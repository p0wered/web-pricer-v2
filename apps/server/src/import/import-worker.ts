// Точка входа worker_thread: импорт выполняется в отдельном потоке, чтобы разбор книги
// (1,6 млн строк) не блокировал обработку HTTP-запросов в основном потоке сервера.
import { parentPort, workerData } from 'node:worker_threads';
import { openAppDb } from '../db/app-db.ts';
import { dataPaths, ensureDataDirs } from '../paths.ts';
import { ImportError } from './import-errors.ts';
import { runImport } from './import-runner.ts';
import type { WorkerInput, WorkerMessage } from './run-import-in-worker.ts';

const port = parentPort;
if (!port) throw new Error('import-worker.ts запускается только как worker_thread');
const post = (message: WorkerMessage) => port.postMessage(message);

const { dataDir, appSecret, options } = workerData as WorkerInput;
const paths = dataPaths(dataDir);
ensureDataDirs(paths);
const appDb = openAppDb(paths.appDb);
try {
  const result = await runImport({ appDb, paths, appSecret }, options, (progress) =>
    post({ type: 'progress', progress }),
  );
  post({ type: 'result', result });
} catch (error) {
  const importError =
    error instanceof ImportError
      ? error
      : new ImportError('internal', error instanceof Error ? error.message : String(error));
  post({ type: 'error', code: importError.code, message: importError.message });
} finally {
  appDb.close();
}
