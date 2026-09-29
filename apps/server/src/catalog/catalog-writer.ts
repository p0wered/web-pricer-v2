// Запись каталога позиций в новый файл SQLite.
//
// Каталог каждый раз собирается в отдельном временном файле и потом атомарно подменяет
// рабочий (rename). Пока идёт импорт, старый каталог продолжает работать; при ошибке
// временный файл просто удаляется. Поэтому при записи можно отключить журнал и fsync —
// недописанный файл никогда не станет рабочим.
import { closeSync, fsyncSync, openSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';

export const CATALOG_SCHEMA = `
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE sheets (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,                  -- имя листа в книге, с '>' у стоп-листов
    kind TEXT NOT NULL CHECK (kind IN ('main', 'special')),
    title TEXT NOT NULL,                 -- текст ячейки A1
    supplier_label TEXT NOT NULL,        -- что показывать в колонке «Поставщик»
    sort_order INTEGER NOT NULL,         -- позиция листа в книге
    row_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    sheet_id INTEGER NOT NULL,
    row_number INTEGER NOT NULL,         -- номер строки в Excel
    name TEXT NOT NULL,
    year_text TEXT,
    qty_text TEXT,
    qty_num REAL,
    price_text TEXT,
    price_num REAL,
    description TEXT
  );
`;

export interface SheetRecord {
  name: string;
  kind: 'main' | 'special';
  title: string;
  supplierLabel: string;
  sortOrder: number;
}

export interface ItemRecord {
  rowNumber: number;
  name: string;
  yearText: string | null;
  qtyText: string | null;
  qtyNum: number | null;
  priceText: string | null;
  priceNum: number | null;
  description: string | null;
}

const BATCH_SIZE = 20_000;

export class CatalogWriter {
  private readonly db: Database.Database;
  private readonly filePath: string;
  private readonly insertSheet: Database.Statement;
  private readonly updateSheetCount: Database.Statement;
  private readonly insertItem: Database.Statement;
  private readonly insertMeta: Database.Statement;
  private pending = 0;

  private constructor(filePath: string) {
    this.filePath = filePath;
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = OFF');
    this.db.pragma('synchronous = OFF');
    this.db.pragma('locking_mode = EXCLUSIVE');
    this.db.pragma('cache_size = -65536'); // 64 МБ
    this.db.exec(CATALOG_SCHEMA);
    this.insertSheet = this.db.prepare(
      `INSERT INTO sheets (name, kind, title, supplier_label, sort_order)
       VALUES (@name, @kind, @title, @supplierLabel, @sortOrder)`,
    );
    this.updateSheetCount = this.db.prepare('UPDATE sheets SET row_count = ? WHERE id = ?');
    this.insertItem = this.db.prepare(
      `INSERT INTO items (sheet_id, row_number, name, year_text, qty_text, qty_num, price_text, price_num, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.insertMeta = this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    this.db.exec('BEGIN');
  }

  /** Создаёт пустой каталог; существующий файл по этому пути удаляется. */
  static create(filePath: string): CatalogWriter {
    rmSync(filePath, { force: true });
    return new CatalogWriter(filePath);
  }

  addSheet(sheet: SheetRecord): number {
    return Number(this.insertSheet.run(sheet).lastInsertRowid);
  }

  setSheetRowCount(sheetId: number, rowCount: number): void {
    this.updateSheetCount.run(rowCount, sheetId);
  }

  addItem(sheetId: number, item: ItemRecord): void {
    this.insertItem.run(
      sheetId,
      item.rowNumber,
      item.name,
      item.yearText,
      item.qtyText,
      item.qtyNum,
      item.priceText,
      item.priceNum,
      item.description,
    );
    if (++this.pending >= BATCH_SIZE) {
      this.db.exec('COMMIT; BEGIN');
      this.pending = 0;
    }
  }

  setMeta(values: Record<string, string | number>): void {
    for (const [key, value] of Object.entries(values)) this.insertMeta.run(key, String(value));
  }

  /** Завершает запись и сбрасывает файл на диск. После этого файл можно делать рабочим. */
  finish(): void {
    this.db.exec('COMMIT');
    this.db.pragma('journal_mode = DELETE');
    this.db.close();
    const fd = openSync(this.filePath, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  /** Прерывает запись и удаляет файл. */
  abort(): void {
    if (this.db.open) this.db.close();
    rmSync(this.filePath, { force: true });
  }
}
