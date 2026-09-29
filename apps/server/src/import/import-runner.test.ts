import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AppDatabase, openAppDb } from '../db/app-db.ts';
import { type DataPaths, dataPaths } from '../paths.ts';
import { encryptSecret } from '../secrets.ts';
import { samplePricerSheets, writeXlsx } from '../test-support/xlsx-fixture.ts';
import { ImportError } from './import-errors.ts';
import { runImport } from './import-runner.ts';

const APP_SECRET = 'test-secret-0123456789';

let root: string;
let paths: DataPaths;
let appDb: AppDatabase;
let fixture: string;
let server: Server | undefined;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'webpricer-import-'));
  paths = dataPaths(path.join(root, 'data'));
  fixture = path.join(root, 'Pricer.xlsm');
  writeXlsx(fixture, samplePricerSheets());
  appDb = openAppDb(':memory:');
});

afterEach(async () => {
  appDb.close();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
  rmSync(root, { recursive: true, force: true });
});

const deps = () => ({ appDb, paths, appSecret: APP_SECRET });

function catalog<T>(sql: string): T[] {
  const db = new Database(paths.catalogDb, { readonly: true });
  try {
    return db.prepare(sql).all() as T[];
  } finally {
    db.close();
  }
}

const runs = () =>
  appDb
    .prepare('SELECT id, status, error_code, rows_main, rows_special FROM import_runs ORDER BY id')
    .all();

async function expectImportError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ImportError);
  expect((error as ImportError).code).toBe(code);
  return error as ImportError;
}

async function serve(handler: RequestListener): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server?.address() as AddressInfo).port}/Pricer.xlsm`;
}

function saveSettings(url: string, password = 'dav-pass') {
  appDb
    .prepare(
      `INSERT INTO settings (id, dav_url, dav_username, dav_password_enc, schedule_frequency, schedule_day, schedule_time, updated_at)
       VALUES (1, ?, 'dav-user', ?, 'weekly', 1, '09:00', '2026-09-29T00:00:00.000Z')`,
    )
    .run(url, encryptSecret(password, APP_SECRET));
}

const basicAuthHandler =
  (body: Buffer | string, status = 200): RequestListener =>
  (request, response) => {
    const expected = `Basic ${Buffer.from('dav-user:dav-pass').toString('base64')}`;
    if (request.headers.authorization !== expected) {
      response.writeHead(401).end();
      return;
    }
    response.writeHead(status, { 'Content-Length': Buffer.byteLength(body) }).end(body);
  };

describe('runImport из файла', () => {
  it('переносит книгу в каталог по правилам старого импорта', async () => {
    const result = await runImport(deps(), { trigger: 'cli', file: fixture });
    expect(result).toMatchObject({ runId: 1, sheets: 2, rowsMain: 5, rowsSpecial: 2 });

    expect(
      catalog(
        'SELECT name, kind, title, supplier_label, row_count FROM sheets ORDER BY sort_order',
      ),
    ).toEqual([
      {
        name: '>STOP',
        kind: 'special',
        title: 'СтопЛист от 30.06.2025',
        supplier_label: 'STOP',
        row_count: 2,
      },
      {
        name: 'Ркомп',
        kind: 'main',
        title: 'РадиоКомплект от 21.09.2026',
        supplier_label: 'РадиоКомплект от 21.09.2026',
        row_count: 5,
      },
    ]);

    const items = catalog<Record<string, unknown>>(
      'SELECT row_number, name, year_text, qty_text, qty_num, price_text, price_num, description FROM items ORDER BY id',
    );
    expect(items.map((item) => item.name)).toEqual([
      'ОНЦ-БС-2-19/18-Р12-3В',
      'ТВ115-830/400',
      'КТ315Г',
      'К52-1В 50В 33мкФ',
      'С2-33Н 0,25 10к',
      'Динамик',
      'Реле',
    ]);
    expect(items[3]).toMatchObject({
      row_number: 4,
      year_text: '1985',
      qty_text: '199шт',
      qty_num: 199,
      price_text: '999-99',
      price_num: 999.99,
    });
    // Дата показывается датой в колонке года; в колонке цены формат даты игнорируется.
    expect(items[4]).toMatchObject({
      year_text: '12.10.2026',
      qty_num: 1000,
      price_text: '36800',
      price_num: 36800,
    });
    expect(items[5]).toMatchObject({
      year_text: 'бг',
      price_text: 'По запосу',
      price_num: null,
      description: 'формула',
    });
    expect(items[6]).toMatchObject({ price_text: '145.8', description: '#N/A' });

    expect(runs()).toEqual([
      { id: 1, status: 'success', error_code: null, rows_main: 5, rows_special: 2 },
    ]);
    expect(readdirSync(paths.tmpDir)).toEqual([]);
  });

  it('при ошибке оставляет прежний каталог и записывает причину', async () => {
    await runImport(deps(), { trigger: 'cli', file: fixture });
    const broken = path.join(root, 'broken.xlsm');
    writeFileSync(broken, readFileSync(fixture).subarray(0, 200));

    const error = await expectImportError(
      runImport(deps(), { trigger: 'manual', file: broken }),
      'format',
    );
    expect(error.message).toContain('не является книгой Excel');
    expect(catalog("SELECT value FROM meta WHERE key = 'import_run_id'")).toEqual([{ value: '1' }]);
    expect(runs()).toMatchObject([
      { status: 'success' },
      { status: 'failed', error_code: 'format' },
    ]);
    expect(readdirSync(paths.tmpDir)).toEqual([]);
  });

  it('не запускает второй импорт, пока идёт первый', async () => {
    const recent = new Date().toISOString();
    appDb
      .prepare(
        `INSERT INTO import_runs (trigger, status, started_at, heartbeat_at) VALUES ('schedule', 'running', ?, ?)`,
      )
      .run(recent, recent);
    await expectImportError(
      runImport(deps(), { trigger: 'manual', file: fixture }),
      'already_running',
    );
    expect(runs()).toHaveLength(1);
  });

  it('снимает зависшую блокировку упавшего процесса', async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    appDb
      .prepare(
        `INSERT INTO import_runs (trigger, status, started_at, heartbeat_at) VALUES ('schedule', 'running', ?, ?)`,
      )
      .run(old, old);
    await runImport(deps(), { trigger: 'manual', file: fixture });
    expect(runs()).toMatchObject([
      { status: 'failed', error_code: 'internal' },
      { status: 'success' },
    ]);
  });
});

describe('runImport со скачиванием по настройкам', () => {
  it('скачивает файл с Basic Auth и импортирует его', async () => {
    saveSettings(await serve(basicAuthHandler(readFileSync(fixture))));
    const result = await runImport(deps(), { trigger: 'manual' });
    expect(result).toMatchObject({
      rowsMain: 5,
      rowsSpecial: 2,
      fileBytes: readFileSync(fixture).length,
    });
    expect(readdirSync(paths.tmpDir)).toEqual([]);
  });

  it('401 → ошибка авторизации', async () => {
    saveSettings(await serve(basicAuthHandler(readFileSync(fixture))), 'wrong-pass');
    const error = await expectImportError(runImport(deps(), { trigger: 'manual' }), 'auth');
    expect(error.message).toBe('Ошибка авторизации. Проверьте логин и пароль.');
  });

  it('ошибка сервера → код http', async () => {
    saveSettings(await serve(basicAuthHandler('fail', 500)));
    await expectImportError(runImport(deps(), { trigger: 'manual' }), 'http');
  });

  it('вместо книги пришла HTML-страница → код format', async () => {
    saveSettings(await serve(basicAuthHandler('<html>login</html>')));
    await expectImportError(runImport(deps(), { trigger: 'manual' }), 'format');
  });

  it('недоступный хост → код connect', async () => {
    const url = await serve(basicAuthHandler(''));
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
    saveSettings(url);
    const error = await expectImportError(runImport(deps(), { trigger: 'manual' }), 'connect');
    expect(error.message).toBe('Не удалось подключиться по указанному URL.');
  });

  it('без настроек и без ключа — понятные ошибки', async () => {
    await expectImportError(runImport(deps(), { trigger: 'manual' }), 'no_settings');
    saveSettings('http://127.0.0.1:1/Pricer.xlsm');
    await expectImportError(
      runImport({ ...deps(), appSecret: undefined }, { trigger: 'manual' }),
      'secret',
    );
    await expectImportError(
      runImport({ ...deps(), appSecret: 'another-secret-0123' }, { trigger: 'manual' }),
      'secret',
    );
  });
});
