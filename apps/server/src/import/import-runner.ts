// Полный цикл импорта: блокировка → скачивание → разбор книги в новый каталог →
// атомарная подмена рабочего каталога → запись итога в журнал.
//
// Гарантии:
// - одновременно идёт только один импорт — и между процессами (сервер, CLI), т. к.
//   блокировка хранится в БД; «зависшая» блокировка упавшего процесса снимается по heartbeat;
// - пока идёт импорт, рабочий каталог не трогается; при любой ошибке он остаётся прежним.
import type { ImportProgress } from '@webpricer/shared';
import { readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { AppDatabase } from '../db/app-db.ts';
import { CatalogWriter } from '../catalog/catalog-writer.ts';
import type { DataPaths } from '../paths.ts';
import { ensureDataDirs } from '../paths.ts';
import { decryptSecret } from '../secrets.ts';
import { downloadFile } from './download.ts';
import { ImportError, type ImportErrorCode } from './import-errors.ts';
import { importWorkbook, type WorkbookStats } from './workbook-import.ts';
import { XlsxFormatError, XlsxReader } from './xlsx/xlsx-reader.ts';

export type ImportTrigger = 'schedule' | 'manual' | 'cli';
export type ImportStage = 'download' | 'parse' | 'finalize';

export interface ImportOptions {
  trigger: ImportTrigger;
  /** Импорт из локального файла вместо скачивания по настройкам (CLI, тесты, замеры). */
  file?: string;
  /**
   * Запуск, уже созданный {@link acquireImportRun}: API берёт блокировку сам, чтобы сразу
   * ответить номером запуска, а импорт выполняется в отдельном потоке.
   */
  runId?: number;
}

/** Через сколько без heartbeat запуск считается брошенным упавшим процессом. */
export const STALE_RUN_AFTER_MS = 2 * 60_000;

export interface ImportDeps {
  appDb: AppDatabase;
  paths: DataPaths;
  appSecret: string | undefined;
  fetchImpl?: typeof fetch;
  /** Интервал heartbeat и возраст, после которого блокировка считается зависшей (мс). */
  heartbeatMs?: number;
  staleAfterMs?: number;
}

export type { ImportProgress };

export interface ImportResult extends WorkbookStats {
  runId: number;
  durationMs: number;
  fileBytes: number | null;
}

interface SettingsRow {
  dav_url: string;
  dav_username: string;
  dav_password_enc: string;
}

const now = () => new Date().toISOString();

/** Берёт блокировку: создаёт запись о запуске. Зависшие записи помечаются прерванными. */
export function acquireImportRun(
  db: AppDatabase,
  trigger: ImportTrigger,
  staleAfterMs: number,
): number {
  return db
    .transaction(() => {
      const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();
      db.prepare(
        `UPDATE import_runs
         SET status = 'failed', finished_at = ?, error_code = 'internal',
             error_message = 'Импорт прерван: процесс остановился.'
         WHERE status = 'running' AND heartbeat_at < ?`,
      ).run(now(), staleBefore);

      const running = db.prepare(`SELECT id FROM import_runs WHERE status = 'running'`).get();
      if (running) throw new ImportError('already_running', 'Импорт уже выполняется.');

      const timestamp = now();
      return Number(
        db
          .prepare(
            `INSERT INTO import_runs (trigger, status, stage, started_at, heartbeat_at)
             VALUES (?, 'running', 'download', ?, ?)`,
          )
          .run(trigger, timestamp, timestamp).lastInsertRowid,
      );
    })
    .immediate();
}

/** Помечает запуск ошибкой, если он ещё не завершён (например, упал поток импорта). */
export function markImportRunFailed(
  db: AppDatabase,
  runId: number,
  code: ImportErrorCode,
  message: string,
): void {
  db.prepare(
    `UPDATE import_runs
     SET status = 'failed', finished_at = ?, error_code = ?, error_message = ?
     WHERE id = ? AND status = 'running'`,
  ).run(now(), code, message, runId);
}

function toImportError(error: unknown): ImportError {
  if (error instanceof ImportError) return error;
  if (error instanceof XlsxFormatError) {
    return new ImportError('format', 'Файл повреждён или не является книгой Excel.', {
      cause: error,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ImportError('internal', `Ошибка при импорте: ${message}`, { cause: error });
}

export async function runImport(
  deps: ImportDeps,
  options: ImportOptions,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const { appDb, paths } = deps;
  const heartbeatMs = deps.heartbeatMs ?? 10_000;
  const startedAt = Date.now();

  ensureDataDirs(paths);
  const runId =
    options.runId ??
    acquireImportRun(appDb, options.trigger, deps.staleAfterMs ?? STALE_RUN_AFTER_MS);

  const setStage = appDb.prepare('UPDATE import_runs SET stage = ?, heartbeat_at = ? WHERE id = ?');
  const heartbeat = setInterval(() => {
    appDb.prepare('UPDATE import_runs SET heartbeat_at = ? WHERE id = ?').run(now(), runId);
  }, heartbeatMs);
  heartbeat.unref();

  // Блокировка наша — всё в tmp осталось от прерванных импортов.
  for (const name of readdirSync(paths.tmpDir)) {
    rmSync(path.join(paths.tmpDir, name), { recursive: true, force: true });
  }
  const downloadPath = path.join(paths.tmpDir, `download-${runId}.xlsx`);
  const catalogPath = path.join(paths.tmpDir, `catalog-${runId}.sqlite`);

  let writer: CatalogWriter | null = null;
  let reader: XlsxReader | null = null;
  try {
    // 1. Источник файла.
    let sourcePath: string;
    let source: string;
    let fileBytes: number | null = null;
    if (options.file) {
      sourcePath = options.file;
      source = `file:${path.basename(options.file)}`;
    } else {
      const settings = appDb
        .prepare('SELECT dav_url, dav_username, dav_password_enc FROM settings WHERE id = 1')
        .get() as SettingsRow | undefined;
      if (!settings) {
        throw new ImportError('no_settings', 'Настройки импорта не заданы.');
      }
      const password = decryptDavPassword(settings.dav_password_enc, deps.appSecret);
      appDb.prepare('UPDATE import_runs SET source = ? WHERE id = ?').run(settings.dav_url, runId);
      ({ bytes: fileBytes } = await downloadFile({
        url: settings.dav_url,
        username: settings.dav_username,
        password,
        destination: downloadPath,
        fetchImpl: deps.fetchImpl,
        onProgress: (bytes, totalBytes) => onProgress?.({ stage: 'download', bytes, totalBytes }),
      }));
      sourcePath = downloadPath;
      source = settings.dav_url;
    }

    // 2. Разбор книги в новый каталог.
    setStage.run('parse', now(), runId);
    reader = await XlsxReader.open(sourcePath);
    writer = CatalogWriter.create(catalogPath);
    const stats = await importWorkbook(reader, writer, (progress) =>
      onProgress?.({ stage: 'parse', ...progress }),
    );
    reader.close();
    reader = null;

    // 3. Подмена рабочего каталога: rename в пределах одного каталога атомарен.
    setStage.run('finalize', now(), runId);
    onProgress?.({ stage: 'finalize' });
    const finishedAt = now();
    writer.setMeta({
      import_run_id: runId,
      imported_at: finishedAt,
      source,
      rows_main: stats.rowsMain,
      rows_special: stats.rowsSpecial,
    });
    writer.finish();
    writer = null;
    renameSync(catalogPath, paths.catalogDb);

    appDb
      .prepare(
        `UPDATE import_runs
         SET status = 'success', stage = NULL, finished_at = ?, heartbeat_at = ?, source = ?,
             file_bytes = ?, sheets = ?, rows_main = ?, rows_special = ?
         WHERE id = ?`,
      )
      .run(
        finishedAt,
        finishedAt,
        source,
        fileBytes,
        stats.sheets,
        stats.rowsMain,
        stats.rowsSpecial,
        runId,
      );

    return { runId, ...stats, fileBytes, durationMs: Date.now() - startedAt };
  } catch (error) {
    const importError = toImportError(error);
    const code: ImportErrorCode = importError.code;
    appDb
      .prepare(
        `UPDATE import_runs
         SET status = 'failed', finished_at = ?, error_code = ?, error_message = ?
         WHERE id = ?`,
      )
      .run(now(), code, importError.message, runId);
    throw importError;
  } finally {
    clearInterval(heartbeat);
    reader?.close();
    writer?.abort();
    rmSync(downloadPath, { force: true });
    rmSync(catalogPath, { force: true });
  }
}

function decryptDavPassword(encrypted: string, appSecret: string | undefined): string {
  if (!appSecret) {
    throw new ImportError(
      'secret',
      'Не задан APP_SECRET: невозможно расшифровать пароль DAV. Задайте APP_SECRET и сохраните пароль в настройках заново.',
    );
  }
  try {
    return decryptSecret(encrypted, appSecret);
  } catch (error) {
    throw new ImportError(
      'secret',
      'Не удалось расшифровать пароль DAV: похоже, APP_SECRET изменился. Сохраните пароль в настройках заново.',
      { cause: error },
    );
  }
}
