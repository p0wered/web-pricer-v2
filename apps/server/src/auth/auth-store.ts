// Общий пароль входа и сессии (как в старой версии: один пароль на всех).
//
// Сессия — случайный токен в HttpOnly-cookie; в БД хранится только его SHA-256, поэтому
// утечка файла БД не даёт готовых сессий. Время жизни скользящее: каждый запрос продлевает
// сессию (не чаще раза в минуту, чтобы не писать в БД на каждый запрос).
import { createHash, randomBytes } from 'node:crypto';
import { PASSWORD_MIN_LENGTH } from '@webpricer/shared';
import type { AppDatabase } from '../db/app-db.ts';
import { hashPassword, verifyPassword } from './passwords.ts';

const TOUCH_INTERVAL_MS = 60_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

interface SessionRow {
  last_seen_at: string;
  expires_at: string;
}

export class AuthStore {
  private readonly db: AppDatabase;
  private readonly sessionTtlMs: number;

  constructor(db: AppDatabase, { sessionTtlMs }: { sessionTtlMs: number }) {
    this.db = db;
    this.sessionTtlMs = sessionTtlMs;
  }

  hasPassword(): boolean {
    return this.db.prepare('SELECT 1 FROM auth WHERE id = 1').get() !== undefined;
  }

  async setPassword(password: string): Promise<void> {
    const hash = await hashPassword(password);
    this.db
      .prepare(
        `INSERT INTO auth (id, password_hash, updated_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`,
      )
      .run(hash, new Date().toISOString());
  }

  async verifyPassword(password: string): Promise<boolean> {
    const hash = this.db.prepare('SELECT password_hash FROM auth WHERE id = 1').pluck().get();
    return typeof hash === 'string' && verifyPassword(password, hash);
  }

  createSession(now = Date.now()): string {
    const token = randomBytes(32).toString('base64url');
    const timestamp = new Date(now).toISOString();
    this.db
      .prepare(
        'INSERT INTO sessions (id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(hashToken(token), timestamp, timestamp, new Date(now + this.sessionTtlMs).toISOString());
    return token;
  }

  /** Проверяет сессию и продлевает её. `false` — нет такой или истекла. */
  touchSession(token: string, now = Date.now()): boolean {
    const id = hashToken(token);
    const row = this.db
      .prepare('SELECT last_seen_at, expires_at FROM sessions WHERE id = ?')
      .get(id) as SessionRow | undefined;
    if (!row) return false;
    if (Date.parse(row.expires_at) <= now) {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      return false;
    }
    if (now - Date.parse(row.last_seen_at) >= TOUCH_INTERVAL_MS) {
      this.db
        .prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
        .run(new Date(now).toISOString(), new Date(now + this.sessionTtlMs).toISOString(), id);
    }
    return true;
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
  }

  /** После смены пароля все остальные сессии завершаются. */
  deleteOtherSessions(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id <> ?').run(hashToken(token));
  }

  /** Смена пароля из CLI: заново входят все. */
  deleteAllSessions(): void {
    this.db.prepare('DELETE FROM sessions').run();
  }

  deleteExpiredSessions(now = Date.now()): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date(now).toISOString());
  }
}

export class InitialPasswordError extends Error {
  override name = 'InitialPasswordError';
}

/**
 * Первый запуск: пароля ещё нет — он берётся из APP_INITIAL_PASSWORD. Пароля по умолчанию
 * (как 12341234 в старой версии) нет: без переменной сервер не стартует.
 */
export async function ensureInitialPassword(
  store: AuthStore,
  initialPassword: string | undefined,
): Promise<'existing' | 'created'> {
  if (store.hasPassword()) return 'existing';
  if (!initialPassword) {
    throw new InitialPasswordError(
      'Пароль входа ещё не задан. Укажите APP_INITIAL_PASSWORD (не короче ' +
        `${PASSWORD_MIN_LENGTH} символов) при первом запуске или задайте пароль командой ` +
        '`webpricer password --reset` (в Docker: ' +
        '`docker compose run --rm webpricer2 webpricer password --reset`).',
    );
  }
  if (initialPassword.length < PASSWORD_MIN_LENGTH) {
    throw new InitialPasswordError(
      `APP_INITIAL_PASSWORD должен быть не короче ${PASSWORD_MIN_LENGTH} символов.`,
    );
  }
  await store.setPassword(initialPassword);
  return 'created';
}
