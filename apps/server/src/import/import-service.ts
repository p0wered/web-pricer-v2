// Запуск импорта из сервера (кнопка в настройках и расписание).
//
// Блокировка берётся сразу в запросе — API отвечает номером запуска, а сам импорт идёт в
// отдельном потоке; фронт опрашивает статус запуска (как индикатор «Импорт выполняется…» в
// старой версии, но без HTTP-запроса длиной в несколько минут).
import type { ImportProgress, ImportRun } from '@webpricer/shared';
import type { AppDatabase } from '../db/app-db.ts';
import type { CatalogStore } from '../search/catalog-store.ts';
import { ImportError } from './import-errors.ts';
import {
  acquireImportRun,
  type ImportOptions,
  type ImportResult,
  markImportRunFailed,
  STALE_RUN_AFTER_MS,
} from './import-runner.ts';
import { runImportInWorker, type WorkerInput } from './run-import-in-worker.ts';

export type ImportRunner = (
  input: Omit<WorkerInput, 'options'>,
  options: ImportOptions,
  onProgress?: (progress: ImportProgress) => void,
) => Promise<ImportResult>;

export interface ImportServiceDeps {
  appDb: AppDatabase;
  dataDir: string;
  appSecret: string | undefined;
  catalog: CatalogStore;
  onFinished?: (runId: number, outcome: ImportResult | ImportError) => void;
  /** Подмена в тестах; по умолчанию — импорт в worker_thread. */
  runner?: ImportRunner;
}

interface RunRow {
  id: number;
  trigger: ImportRun['trigger'];
  status: ImportRun['status'];
  stage: ImportRun['stage'];
  started_at: string;
  finished_at: string | null;
  rows_main: number | null;
  rows_special: number | null;
  error_code: string | null;
  error_message: string | null;
}

export class ImportService {
  private readonly deps: ImportServiceDeps;
  private active: Promise<void> | null = null;
  /** Последний ход импорта, запущенного этим процессом; в базу не пишется — нужен, пока идёт. */
  private progress: { runId: number; progress: ImportProgress } | null = null;

  constructor(deps: ImportServiceDeps) {
    this.deps = deps;
  }

  /** Запускает импорт; возвращает номер запуска. Если импорт уже идёт — ImportError('already_running'). */
  start(trigger: 'manual' | 'schedule'): number {
    const { appDb, dataDir, appSecret, catalog } = this.deps;
    const runId = acquireImportRun(appDb, trigger, STALE_RUN_AFTER_MS);
    const runner = this.deps.runner ?? runImportInWorker;

    this.progress = null;
    this.active = runner({ dataDir, appSecret }, { trigger, runId }, (progress) => {
      this.progress = { runId, progress };
    })
      .then(async (result) => {
        await catalog.reload();
        this.deps.onFinished?.(runId, result);
      })
      .catch((error: unknown) => {
        const importError =
          error instanceof ImportError
            ? error
            : new ImportError('internal', error instanceof Error ? error.message : String(error));
        // Если поток упал, не успев записать итог, — записываем сами.
        markImportRunFailed(appDb, runId, importError.code, importError.message);
        this.deps.onFinished?.(runId, importError);
      })
      .finally(() => {
        this.active = null;
        this.progress = null;
      });
    return runId;
  }

  /**
   * При старте сервера: запуски, начатые сервером (кнопка, расписание) и не завершённые, —
   * прерваны перезапуском. Импорт из CLI (другой процесс) не трогается.
   */
  recoverInterruptedRuns(): void {
    this.deps.appDb
      .prepare(
        `UPDATE import_runs
         SET status = 'failed', finished_at = ?, error_code = 'internal',
             error_message = 'Импорт прерван перезапуском сервера.'
         WHERE status = 'running' AND trigger IN ('manual', 'schedule')`,
      )
      .run(new Date().toISOString());
  }

  /** Номер идущего сейчас импорта (в том числе из CLI в другом процессе). */
  runningRunId(): number | null {
    const id = this.deps.appDb
      .prepare(`SELECT id FROM import_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1`)
      .pluck()
      .get();
    return typeof id === 'number' ? id : null;
  }

  getRun(id: number): ImportRun | null {
    const row = this.deps.appDb
      .prepare(
        `SELECT id, trigger, status, stage, started_at, finished_at, rows_main, rows_special,
                error_code, error_message
         FROM import_runs WHERE id = ?`,
      )
      .get(id) as RunRow | undefined;
    if (!row) return null;
    // Этап в базе меняется раньше, чем приходит ход нового этапа, — старый ход не показываем.
    const progress =
      row.status === 'running' &&
      this.progress?.runId === row.id &&
      this.progress.progress.stage === row.stage
        ? this.progress.progress
        : null;
    return {
      id: row.id,
      trigger: row.trigger,
      status: row.status,
      stage: row.stage,
      progress,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      rowsMain: row.rows_main,
      rowsSpecial: row.rows_special,
      errorCode: row.error_code,
      errorMessage: row.error_message,
    };
  }

  /** Ждёт завершения импорта, запущенного этим процессом (тесты, остановка сервера). */
  async whenIdle(): Promise<void> {
    await this.active;
  }
}
