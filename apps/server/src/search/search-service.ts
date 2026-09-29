// Поиск для API: сопоставление по индексу, упорядочивание, кэш, выдача порциями.
//
// В кэше хранятся только упорядоченные id (не строки выдачи), поэтому широкие запросы
// («к52», «2рм» — десятки тысяч позиций) не упираются в размер кэша, как в старой версии,
// где выдача целиком сериализовалась в таблицу MySQL и не помещалась в колонку.
import type { SearchItem, SearchRequest, SearchResponse } from '@webpricer/shared';
import type { CatalogSnapshot, CatalogStore } from './catalog-store.ts';
import { type MatchResult, orderResults, parseQuery, queryKey } from './search-index.ts';

export class CatalogNotReadyError extends Error {
  override name = 'CatalogNotReadyError';
}

interface CacheEntry {
  match: MatchResult;
  orders: Map<string, Uint32Array>;
}

interface ItemRow {
  id: number;
  name: string;
  year_text: string | null;
  qty_text: string | null;
  price_text: string | null;
  price_num: number | null;
  description: string | null;
  supplier_label: string;
  sheet_name: string;
}

export interface SearchTimings {
  /** Сопоставление и упорядочивание (0, если выдача из кэша). */
  searchMs: number;
  /** Чтение строк порции из каталога. */
  hydrateMs: number;
  cached: boolean;
}

const STOP_SHEET = '>STOP';

export class SearchService {
  private readonly store: CatalogStore;
  private readonly cacheSize: number;
  private readonly cache = new Map<string, CacheEntry>();
  private cacheGeneration = -1;

  constructor(store: CatalogStore, { cacheSize = 100 }: { cacheSize?: number } = {}) {
    this.store = store;
    this.cacheSize = cacheSize;
  }

  search(request: SearchRequest): { response: SearchResponse; timings: SearchTimings } {
    const snapshot = this.store.current;
    if (!snapshot)
      throw new CatalogNotReadyError(
        'Данные загружаются, повторите запрос через несколько секунд.',
      );

    const started = performance.now();
    const terms = parseQuery(request.q);
    const { entry, cached } = this.entryFor(snapshot, queryKey(terms), () =>
      snapshot.index.match(terms),
    );
    const orderKey = `${request.list}:${request.sort}`;
    let ordered = entry.orders.get(orderKey);
    const orderCached = ordered !== undefined;
    if (!ordered) {
      ordered = orderResults(snapshot.index, entry.match, request.list, request.sort);
      entry.orders.set(orderKey, ordered);
    }
    const searchMs = performance.now() - started;

    const hydrateStarted = performance.now();
    const pageIds = ordered.subarray(request.offset, request.offset + request.limit);
    const items = this.hydrate(snapshot, pageIds);
    const hydrateMs = performance.now() - hydrateStarted;

    return {
      response: {
        total: ordered.length,
        offset: request.offset,
        items,
        dataVersion: snapshot.version,
      },
      timings: { searchMs, hydrateMs, cached: cached && orderCached },
    };
  }

  private entryFor(
    snapshot: CatalogSnapshot,
    key: string,
    compute: () => MatchResult,
  ): { entry: CacheEntry; cached: boolean } {
    if (snapshot.generation !== this.cacheGeneration) {
      this.cache.clear();
      this.cacheGeneration = snapshot.generation;
    }
    const existing = this.cache.get(key);
    if (existing) {
      // LRU: свежеиспользованная запись — в конец.
      this.cache.delete(key);
      this.cache.set(key, existing);
      return { entry: existing, cached: true };
    }
    const entry: CacheEntry = { match: compute(), orders: new Map() };
    if (this.cacheSize > 0) {
      this.cache.set(key, entry);
      while (this.cache.size > this.cacheSize) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
    }
    return { entry, cached: false };
  }

  private hydrate(snapshot: CatalogSnapshot, ids: Uint32Array): SearchItem[] {
    if (ids.length === 0 || !snapshot.db) return [];
    const rows = snapshot.db
      .prepare(
        `SELECT i.id, i.name, i.year_text, i.qty_text, i.price_text, i.price_num, i.description,
                s.supplier_label, s.name AS sheet_name
         FROM items i JOIN sheets s ON s.id = i.sheet_id
         WHERE i.id IN (SELECT value FROM json_each(?))`,
      )
      .all(JSON.stringify(Array.from(ids))) as ItemRow[];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items: SearchItem[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) continue;
      items.push({
        id: row.id,
        name: row.name,
        year: row.year_text,
        quantity: row.qty_text,
        price: row.price_text,
        priceValue: row.price_num,
        supplier: row.supplier_label,
        description: row.description,
        isStop: row.sheet_name === STOP_SHEET,
      });
    }
    return items;
  }
}
