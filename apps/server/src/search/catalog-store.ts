// Текущий каталог: поисковый индекс в памяти + соединение с файлом каталога для выдачи строк.
//
// После импорта файл catalog.sqlite подменяется целиком (rename). Хранилище замечает это —
// и при импорте из сервера, и при импорте из CLI в другом процессе — строит новый индекс в
// отдельном потоке и подменяет текущий. До конца перестроения поиск работает по старому.
import { existsSync, type Stats, unwatchFile, watchFile } from 'node:fs';
import { Worker } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { type BuiltCatalogIndex, readCatalogVersion } from './catalog-index.ts';
import { SearchIndex, SearchIndexBuilder } from './search-index.ts';

export interface CatalogSnapshot {
  /** Растёт при каждой подмене; ключ кэша выдачи. */
  generation: number;
  /** Номер импорта, из которого данные; `null` — каталога ещё нет. */
  version: number | null;
  index: SearchIndex;
  /** `null`, если каталога ещё нет. */
  db: Database.Database | null;
}

export interface CatalogStoreOptions {
  catalogPath: string;
  onReload?: (info: { version: number | null; count: number; durationMs: number }) => void;
  onError?: (error: unknown) => void;
}

const EMPTY_INDEX = new SearchIndex(new SearchIndexBuilder().build());

function buildInWorker(catalogPath: string): Promise<BuiltCatalogIndex> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./index-worker.ts', import.meta.url), {
      workerData: { catalogPath },
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Поток построения индекса завершился с кодом ${code}`));
    });
  });
}

export class CatalogStore {
  private snapshot: CatalogSnapshot | null = null;
  private generation = 0;
  private reloading: Promise<void> | null = null;
  private reloadRequested = false;
  private readonly options: CatalogStoreOptions;

  constructor(options: CatalogStoreOptions) {
    this.options = options;
  }

  /** Текущий каталог или `null`, пока он загружается впервые. */
  get current(): CatalogSnapshot | null {
    return this.snapshot;
  }

  /** Загружает (перезагружает) каталог. Параллельные вызовы объединяются. */
  reload(): Promise<void> {
    if (this.reloading) {
      this.reloadRequested = true;
      return this.reloading;
    }
    this.reloading = (async () => {
      try {
        do {
          this.reloadRequested = false;
          await this.loadOnce();
        } while (this.reloadRequested);
      } catch (error) {
        this.options.onError?.(error);
      } finally {
        this.reloading = null;
      }
    })();
    return this.reloading;
  }

  /** Следит за подменой файла каталога (в том числе импортом из другого процесса). */
  watch(intervalMs = 2000): void {
    watchFile(
      this.options.catalogPath,
      { interval: intervalMs },
      (current: Stats, previous: Stats) => {
        if (current.ino !== previous.ino || current.mtimeMs !== previous.mtimeMs)
          void this.reload();
      },
    );
  }

  close(): void {
    unwatchFile(this.options.catalogPath);
    this.snapshot?.db?.close();
    this.snapshot = null;
  }

  private async loadOnce(): Promise<void> {
    const started = Date.now();
    const { catalogPath } = this.options;
    if (!existsSync(catalogPath)) {
      this.swap({ version: null, index: EMPTY_INDEX, db: null });
      return;
    }
    // Файл могут подменить, пока строится индекс: тогда индекс и открытый файл разойдутся.
    // Сверяем версии и при расхождении строим заново.
    for (;;) {
      const built = await buildInWorker(catalogPath);
      const db = new Database(catalogPath, { readonly: true, fileMustExist: true });
      if (readCatalogVersion(db) === built.version) {
        this.swap({ version: built.version, index: new SearchIndex(built.data), db });
        this.options.onReload?.({
          version: built.version,
          count: built.data.count,
          durationMs: Date.now() - started,
        });
        return;
      }
      db.close();
    }
  }

  private swap(next: Omit<CatalogSnapshot, 'generation'>): void {
    const previous = this.snapshot;
    this.snapshot = { ...next, generation: ++this.generation };
    // Запросы к БД синхронные: между ними старое соединение никто не использует.
    previous?.db?.close();
  }
}
