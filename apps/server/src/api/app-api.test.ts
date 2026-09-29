// Сквозные тесты API этапа 3: вход, защита маршрутов, настройки, смена пароля, импорт.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  importRunSchema,
  settingsResponseSchema,
} from '@webpricer/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { AuthStore } from '../auth/auth-store.ts';
import { type AppDatabase, openAppDb } from '../db/app-db.ts';
import { ImportError } from '../import/import-errors.ts';
import { runImport } from '../import/import-runner.ts';
import { type ImportRunner, ImportService } from '../import/import-service.ts';
import { dataPaths } from '../paths.ts';
import { ImportScheduler } from '../scheduler/import-scheduler.ts';
import { CatalogStore } from '../search/catalog-store.ts';
import { SearchService } from '../search/search-service.ts';
import { SettingsStore } from '../settings/settings-store.ts';
import { testConfig } from '../test-support/test-config.ts';
import { samplePricerSheets, writeXlsx } from '../test-support/xlsx-fixture.ts';

const PASSWORD = 'общий-пароль';
const APP_SECRET = 'test-secret-0123456789';

let root: string;
let appDb: AppDatabase;
let catalog: CatalogStore;
let imports: ImportService;
let scheduler: ImportScheduler;
let app: FastifyInstance;
let releaseImport: (() => void) | null;
let holdImport = false;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'webpricer-app-'));
  const paths = dataPaths(path.join(root, 'data'));
  const fixture = path.join(root, 'Pricer.xlsm');
  writeXlsx(fixture, samplePricerSheets());

  appDb = openAppDb(':memory:');
  const auth = new AuthStore(appDb, { sessionTtlMs: 120 * 60_000 });
  await auth.setPassword(PASSWORD);
  catalog = new CatalogStore({ catalogPath: paths.catalogDb });
  await catalog.reload();
  const settings = new SettingsStore(appDb, APP_SECRET);

  // Импорт в процессе на тестовой книге; можно придержать, чтобы проверить «уже идёт».
  releaseImport = null;
  const runner: ImportRunner = async (_input, options) => {
    if (holdImport) {
      await new Promise<void>((resolve) => (releaseImport = resolve));
    }
    return runImport({ appDb, paths, appSecret: APP_SECRET }, { ...options, file: fixture });
  };
  imports = new ImportService({
    appDb,
    dataDir: paths.dataDir,
    appSecret: APP_SECRET,
    catalog,
    runner,
  });
  scheduler = new ImportScheduler({ settings, imports, timeZone: 'Europe/Moscow' });

  app = await buildApp(testConfig({ dataDir: paths.dataDir }), {
    auth,
    searchService: new SearchService(catalog),
    settings,
    scheduler,
    imports,
  });
});

afterEach(async () => {
  holdImport = false;
  scheduler.stop();
  await imports.whenIdle();
  await app.close();
  catalog.close();
  appDb.close();
  rmSync(root, { recursive: true, force: true });
});

const csrf = { [CSRF_HEADER]: CSRF_HEADER_VALUE };

function sessionCookie(response: LightMyRequestResponse): string {
  const cookie = response.cookies.find((item) => item.name === 'webpricer_session');
  if (!cookie) throw new Error('Нет cookie сессии');
  return `webpricer_session=${cookie.value}`;
}

async function login(password = PASSWORD, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { ...csrf, ...headers },
    payload: { password },
  });
}

async function loggedIn(): Promise<Record<string, string>> {
  return { ...csrf, cookie: sessionCookie(await login()) };
}

describe('вход и защита API', () => {
  it('без сессии API закрыто, health открыт', async () => {
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
    for (const url of ['/api/search?q=кт&list=main', '/api/settings', '/api/auth/me']) {
      const response = await app.inject({ url });
      expect(response.statusCode, url).toBe(401);
      expect(response.json()).toEqual({ error: 'Требуется вход.' });
    }
  });

  it('входит по общему паролю и ставит защищённую cookie', async () => {
    const response = await login();
    expect(response.statusCode).toBe(204);
    const cookie = response.cookies.find((item) => item.name === 'webpricer_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 7200 });
    expect(cookie?.secure).toBeFalsy(); // обычный HTTP

    const me = await app.inject({
      url: '/api/auth/me',
      headers: { cookie: sessionCookie(response) },
    });
    expect(me.json()).toEqual({ authenticated: true });
  });

  it('за HTTPS-прокси ставит Secure', async () => {
    const response = await login(PASSWORD, { 'x-forwarded-proto': 'https' });
    expect(response.cookies.find((item) => item.name === 'webpricer_session')?.secure).toBe(true);
  });

  it('неверный пароль и блокировка после 5 попыток', async () => {
    const wrong = await login('не тот');
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().fields).toEqual({ password: 'Неверный пароль' });
    for (let i = 0; i < 4; i++) await login('не тот');
    const blocked = await login(PASSWORD);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatch(
      /Слишком много попыток входа. Попробуйте через \d+ секунд./,
    );
  });

  it('отклоняет изменяющие запросы без CSRF-заголовка', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: PASSWORD },
    });
    expect(response.statusCode).toBe(403);
  });

  it('выход завершает сессию', async () => {
    const headers = await loggedIn();
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/logout', headers })).statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/api/auth/me', headers })).statusCode).toBe(401);
  });
});

describe('настройки импорта', () => {
  const valid = {
    davUrl: 'https://cloud.example.com/remote.php/dav/files/pricer/Pricer.xlsm',
    davUsername: 'pricer',
    davPassword: 'dav-secret',
    frequency: 'weekly',
    day: 1,
    time: '09:00',
  };

  it('сохраняет, не возвращает пароль DAV и считает следующий запуск', async () => {
    const headers = await loggedIn();
    const empty = settingsResponseSchema.parse(
      (await app.inject({ url: '/api/settings', headers })).json(),
    );
    expect(empty).toEqual({ settings: null, nextRunAt: null });

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: valid,
    });
    expect(saved.statusCode).toBe(200);
    const body = settingsResponseSchema.parse(saved.json());
    expect(body.settings).toEqual({
      davUrl: valid.davUrl,
      davUsername: 'pricer',
      davPasswordSet: true,
      frequency: 'weekly',
      day: 1,
      time: '09:00',
    });
    expect(JSON.stringify(body)).not.toContain('dav-secret');
    expect(new Date(body.nextRunAt ?? '').getUTCDay()).toBe(1); // понедельник

    const stored = appDb.prepare('SELECT dav_password_enc FROM settings').pluck().get();
    expect(stored).toMatch(/^v1:/);
  });

  it('без нового пароля оставляет сохранённый', async () => {
    const headers = await loggedIn();
    await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: valid });
    const before = appDb.prepare('SELECT dav_password_enc FROM settings').pluck().get();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: { ...valid, davPassword: '', frequency: 'daily', day: 5 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().settings).toMatchObject({ frequency: 'daily', day: null });
    expect(appDb.prepare('SELECT dav_password_enc FROM settings').pluck().get()).toBe(before);
  });

  it('проверяет поля', async () => {
    const headers = await loggedIn();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: { ...valid, davUrl: 'не url', davPassword: '', day: 8, time: '25:00' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().fields).toEqual({
      davUrl: 'Поле должно содержать корректный URL.',
      time: 'Введите время в формате ЧЧ:ММ.',
      day: 'Выберите день недели.',
    });
    const noPassword = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: { ...valid, davPassword: '' },
    });
    expect(noPassword.json().fields).toEqual({
      davPassword: 'Поле Пароль обязательно для заполнения.',
    });
  });
});

describe('смена пароля', () => {
  it('проверяет текущий и подтверждение, завершает остальные сессии', async () => {
    const mine = await loggedIn();
    const other = await loggedIn();
    const change = (payload: object) =>
      app.inject({ method: 'POST', url: '/api/settings/password', headers: mine, payload });

    expect(
      (
        await change({ current: 'не тот', password: 'новый-пароль', confirmation: 'новый-пароль' })
      ).json().fields,
    ).toEqual({
      current: 'Текущий пароль не совпадает с нашими записями.',
    });
    expect(
      (await change({ current: PASSWORD, password: 'новый-пароль', confirmation: 'другой' })).json()
        .fields,
    ).toEqual({
      password: 'Поле Пароль не совпадает с подтверждением.',
    });
    expect(
      (await change({ current: PASSWORD, password: 'short', confirmation: 'short' })).statusCode,
    ).toBe(422);

    expect(
      (await change({ current: PASSWORD, password: 'новый-пароль', confirmation: 'новый-пароль' }))
        .statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/api/auth/me', headers: mine })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me', headers: other })).statusCode).toBe(401);
    expect((await login('новый-пароль')).statusCode).toBe(204);
  });
});

describe('ручной импорт', () => {
  it('запускает импорт, отдаёт статус и обновляет поиск', async () => {
    const headers = await loggedIn();
    const started = await app.inject({ method: 'POST', url: '/api/import', headers });
    expect(started.statusCode).toBe(202);
    const { runId } = started.json();
    await imports.whenIdle();

    const run = importRunSchema.parse(
      (await app.inject({ url: `/api/import/${runId}`, headers })).json(),
    );
    expect(run).toMatchObject({
      id: runId,
      trigger: 'manual',
      status: 'success',
      rowsMain: 5,
      rowsSpecial: 2,
    });

    const search = await app.inject({ url: '/api/search?q=%D0%BA%D1%82315&list=main', headers });
    expect(search.json().total).toBe(1);
  });

  it('не запускает второй импорт, пока идёт первый', async () => {
    holdImport = true;
    const headers = await loggedIn();
    const first = (await app.inject({ method: 'POST', url: '/api/import', headers })).json();
    const second = await app.inject({ method: 'POST', url: '/api/import', headers });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'Импорт уже выполняется.', runId: first.runId });
    // И плановый запуск в это время пропускается.
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: {
        davUrl: 'https://x.example/p.xlsm',
        davUsername: 'u',
        davPassword: 'p',
        frequency: 'daily',
        time: '09:00',
      },
    });
    expect(scheduler.runIfDue()).toBeNull();
    releaseImport?.();
  });

  it('неизвестный запуск — 404', async () => {
    const headers = await loggedIn();
    expect((await app.inject({ url: '/api/import/999', headers })).statusCode).toBe(404);
  });

  it('если импорт упал вне runImport, запуск помечается ошибкой', async () => {
    const service = new ImportService({
      appDb,
      dataDir: root,
      appSecret: APP_SECRET,
      catalog,
      runner: async () => {
        throw new ImportError('internal', 'Сбой потока импорта');
      },
    });
    const runId = service.start('manual');
    await service.whenIdle();
    expect(service.getRun(runId)).toMatchObject({
      status: 'failed',
      errorMessage: 'Сбой потока импорта',
    });
  });

  it('после перезапуска сервера незавершённые запуски помечаются прерванными', () => {
    const timestamp = new Date().toISOString();
    appDb
      .prepare(
        `INSERT INTO import_runs (trigger, status, started_at, heartbeat_at) VALUES ('manual', 'running', ?, ?)`,
      )
      .run(timestamp, timestamp);
    appDb
      .prepare(
        `INSERT INTO import_runs (trigger, status, started_at, heartbeat_at) VALUES ('cli', 'running', ?, ?)`,
      )
      .run(timestamp, timestamp);
    imports.recoverInterruptedRuns();
    const statuses = appDb.prepare('SELECT trigger, status FROM import_runs ORDER BY id').all();
    expect(statuses).toEqual([
      { trigger: 'manual', status: 'failed' },
      { trigger: 'cli', status: 'running' }, // CLI — другой процесс, его не трогаем
    ]);
  });
});

describe('расписание', () => {
  it('запускает импорт только в день по расписанию', async () => {
    const headers = await loggedIn();
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: {
        davUrl: 'https://x.example/p.xlsm',
        davUsername: 'u',
        davPassword: 'p',
        frequency: 'weekly',
        day: 1,
        time: '09:00',
      },
    });
    expect(scheduler.runIfDue(new Date('2026-09-29T06:00:00Z'))).toBeNull(); // вторник
    const runId = scheduler.runIfDue(new Date('2026-09-28T06:00:00Z')); // понедельник
    expect(runId).toBeTypeOf('number');
    await imports.whenIdle();
    expect(imports.getRun(runId ?? 0)).toMatchObject({ trigger: 'schedule', status: 'success' });
  });
});
