import { beforeEach, describe, expect, it } from 'vitest';
import { type AppDatabase, openAppDb } from '../db/app-db.ts';
import { AuthStore, ensureInitialPassword, InitialPasswordError } from './auth-store.ts';
import { LoginLimiter } from './login-limiter.ts';

const TTL = 120 * 60_000;
let db: AppDatabase;
let auth: AuthStore;

beforeEach(() => {
  db = openAppDb(':memory:');
  auth = new AuthStore(db, { sessionTtlMs: TTL });
});

describe('пароль', () => {
  it('проверяет пароль и не хранит его открытым текстом', async () => {
    await auth.setPassword('секретный пароль');
    expect(await auth.verifyPassword('секретный пароль')).toBe(true);
    expect(await auth.verifyPassword('другой пароль')).toBe(false);
    const stored = db.prepare('SELECT password_hash FROM auth').pluck().get() as string;
    expect(stored).toMatch(/^scrypt\$/);
    expect(stored).not.toContain('секретный');
  });

  it('первый запуск: пароль из APP_INITIAL_PASSWORD, без него — ошибка', async () => {
    await expect(ensureInitialPassword(auth, undefined)).rejects.toBeInstanceOf(
      InitialPasswordError,
    );
    await expect(ensureInitialPassword(auth, 'short')).rejects.toThrow('не короче 8');
    expect(await ensureInitialPassword(auth, 'начальный-пароль')).toBe('created');
    // Дальше переменная игнорируется: пароль уже задан (например, сменён в настройках).
    expect(await ensureInitialPassword(auth, 'другой-пароль-123')).toBe('existing');
    expect(await auth.verifyPassword('начальный-пароль')).toBe(true);
  });
});

describe('сессии', () => {
  it('живёт 120 минут без активности и продлевается запросами', () => {
    const start = Date.parse('2026-09-29T10:00:00Z');
    const token = auth.createSession(start);
    expect(auth.touchSession(token, start + 100 * 60_000)).toBe(true); // продлили
    expect(auth.touchSession(token, start + 200 * 60_000)).toBe(true); // ещё в пределах
    expect(auth.touchSession(token, start + 200 * 60_000 + TTL + 1)).toBe(false); // истекла
    expect(auth.touchSession(token, start + 200 * 60_000)).toBe(false); // и удалена
  });

  it('хранит только хэш токена', () => {
    const token = auth.createSession();
    const ids = db.prepare('SELECT id FROM sessions').pluck().all();
    expect(ids).toHaveLength(1);
    expect(ids).not.toContain(token);
  });

  it('завершает остальные сессии', () => {
    const mine = auth.createSession();
    const other = auth.createSession();
    auth.deleteOtherSessions(mine);
    expect(auth.touchSession(mine)).toBe(true);
    expect(auth.touchSession(other)).toBe(false);
    auth.deleteAllSessions();
    expect(auth.touchSession(mine)).toBe(false);
  });
});

describe('LoginLimiter', () => {
  it('после 5 неудач блокирует на минуту, успешный вход сбрасывает счётчик', () => {
    const limiter = new LoginLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(limiter.acquire('1.2.3.4', t0)).toBe(0);
    expect(limiter.acquire('1.2.3.4', t0 + 15_000)).toBe(45);
    expect(limiter.acquire('5.6.7.8', t0)).toBe(0); // другой IP
    expect(limiter.acquire('1.2.3.4', t0 + 60_000)).toBe(0); // окно прошло

    const t1 = t0 + 60_000;
    for (let i = 0; i < 3; i++) limiter.acquire('1.2.3.4', t1);
    limiter.succeeded('1.2.3.4', t1);
    for (let i = 0; i < 5; i++) expect(limiter.acquire('1.2.3.4', t1)).toBe(0);
  });

  it('попытка учитывается до проверки пароля: параллельные запросы не проходят сверх лимита', () => {
    const limiter = new LoginLimiter();
    const t0 = 1_000_000;
    // Ни одна из попыток ещё не завершилась, а шестая уже отклонена.
    const results = Array.from({ length: 10 }, () => limiter.acquire('1.2.3.4', t0));
    expect(results.filter((wait) => wait === 0)).toHaveLength(5);
  });

  it('не больше 20 неудач в минуту со всех IP вместе', () => {
    const limiter = new LoginLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(limiter.acquire(`10.0.0.${i}`, t0)).toBe(0);
    expect(limiter.acquire('10.0.1.1', t0 + 10_000)).toBe(50); // новый IP — всё равно ждать
    expect(limiter.acquire('10.0.1.1', t0 + 60_000)).toBe(0);
  });

  it('успешный вход не считается неудачей в общем лимите', () => {
    const limiter = new LoginLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) {
      expect(limiter.acquire(`10.0.0.${i}`, t0)).toBe(0);
      limiter.succeeded(`10.0.0.${i}`, t0);
    }
    expect(limiter.acquire('10.0.1.1', t0)).toBe(0);
  });

  it('не копит в памяти IP, у которых окно прошло', () => {
    const limiter = new LoginLimiter({ maxGlobalAttempts: Infinity });
    const t0 = 1_000_000;
    for (let i = 0; i < 1000; i++) limiter.acquire(`10.0.${i >> 8}.${i & 255}`, t0);
    limiter.acquire('1.2.3.4', t0 + 30_000);
    expect(limiter.size).toBe(1001);

    limiter.acquire('5.6.7.8', t0 + 60_000);
    expect(limiter.size).toBe(2); // 1.2.3.4 (окно ещё идёт) и 5.6.7.8
    expect(limiter.acquire('1.2.3.4', t0 + 60_000)).toBe(0);
  });
});
