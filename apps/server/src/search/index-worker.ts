// worker_thread: строит индекс по каталогу, не блокируя основной поток сервера
// (1,65 млн названий нормализуются несколько секунд).
import { parentPort, workerData } from 'node:worker_threads';
import { buildCatalogIndex } from './catalog-index.ts';
import { transferList } from './search-index.ts';

const port = parentPort;
if (!port) throw new Error('index-worker.ts запускается только как worker_thread');

const built = buildCatalogIndex((workerData as { catalogPath: string }).catalogPath);
port.postMessage(built, transferList(built.data));
