import { Worker } from 'node:worker_threads';
import { ImportError, type ImportErrorCode } from './import-errors.ts';
import type { ImportOptions, ImportProgress, ImportResult } from './import-runner.ts';

export interface WorkerInput {
  dataDir: string;
  appSecret: string | undefined;
  options: ImportOptions;
}

export type WorkerMessage =
  | { type: 'progress'; progress: ImportProgress }
  | { type: 'result'; result: ImportResult }
  | { type: 'error'; code: ImportErrorCode; message: string };

/** Запускает импорт в отдельном потоке. Ошибки импорта приходят как {@link ImportError}. */
export function runImportInWorker(
  input: Omit<WorkerInput, 'options'>,
  options: ImportOptions,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const workerData: WorkerInput = { ...input, options };
    const worker = new Worker(new URL('./import-worker.ts', import.meta.url), { workerData });
    let settled = false;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };

    worker.on('message', (message: WorkerMessage) => {
      if (message.type === 'progress') onProgress?.(message.progress);
      else if (message.type === 'result') settle(() => resolve(message.result));
      else settle(() => reject(new ImportError(message.code, message.message)));
    });
    worker.once('error', (error) =>
      settle(() => reject(new ImportError('internal', `Сбой потока импорта: ${error.message}`))),
    );
    worker.once('exit', (code) =>
      settle(() =>
        reject(
          new ImportError('internal', `Поток импорта завершился без результата (код ${code}).`),
        ),
      ),
    );
  });
}
