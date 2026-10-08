// Построение поискового индекса по файлу каталога.
import Database from 'better-sqlite3';
import { type ItemKind, SearchIndexBuilder, type SearchIndexData } from './search-index.ts';

export interface BuiltCatalogIndex {
  /** Номер импорта из meta каталога (import_run_id). */
  version: number | null;
  data: SearchIndexData;
}

interface Row {
  id: number;
  name: string;
  kind: ItemKind;
  sort_order: number;
  price_num: number | null;
  qty_num: number | null;
}

export function readCatalogVersion(db: Database.Database): number | null {
  const value = db.prepare(`SELECT value FROM meta WHERE key = 'import_run_id'`).pluck().get();
  return typeof value === 'string' ? Number(value) : null;
}

export function buildCatalogIndex(catalogPath: string): BuiltCatalogIndex {
  const db = new Database(catalogPath, { readonly: true, fileMustExist: true });
  try {
    const builder = new SearchIndexBuilder();
    const rows = db
      .prepare(
        `SELECT i.id, i.name, s.kind, s.sort_order, i.price_num, i.qty_num
         FROM items i JOIN sheets s ON s.id = i.sheet_id
         ORDER BY i.id`,
      )
      .iterate() as IterableIterator<Row>;
    for (const row of rows) {
      builder.add({
        id: row.id,
        name: row.name,
        kind: row.kind,
        sheetOrder: row.sort_order,
        price: row.price_num,
        quantity: row.qty_num,
      });
    }
    return { version: readCatalogVersion(db), data: builder.build() };
  } finally {
    db.close();
  }
}
