// Перенос книги Excel в каталог. Правила — как в старом импорте (PLAN.md §4 «Импорт»):
// - листы Request и Suppliers пропускаются;
// - листы с «>» в начале имени — стоп-лист, остальные — детали;
// - первые две строки листа (A1 — «Поставщик от ДД.ММ.ГГГГ», строка 2 — шапка) — не данные;
// - строки с пустым названием пропускаются;
// - колонки: A — название, B — год, C — кол-во, D — цена, E — описание.
import type { CatalogWriter, ItemRecord, SheetRecord } from '../catalog/catalog-writer.ts';
import { cellText, parsePrice, parseQuantity } from './cell-values.ts';
import type { SheetInfo, XlsxReader, XlsxRow } from './xlsx/xlsx-reader.ts';

export const IGNORED_SHEETS = new Set(['request', 'suppliers']);
const SPECIAL_PREFIX = '>';
const HEADER_ROWS = 2;
const COLUMNS = 5;

const PROGRESS_INTERVAL_MS = 250;

export interface WorkbookProgress {
  /** Лист, который сейчас разбирается, с единицы. */
  sheetIndex: number;
  sheetCount: number;
  sheetName: string;
  rowsMain: number;
  rowsSpecial: number;
  /** Прочитано XML листов без сжатия — доля разбора считается по байтам, а не по листам. */
  bytesDone: number;
  bytesTotal: number;
}

export interface WorkbookStats {
  sheets: number;
  rowsMain: number;
  rowsSpecial: number;
}

export function isIgnoredSheet(name: string): boolean {
  return IGNORED_SHEETS.has(name.trim().toLowerCase());
}

export function describeSheet(sheet: SheetInfo, a1Title: string | null): SheetRecord {
  const isSpecial = sheet.name.startsWith(SPECIAL_PREFIX);
  const title = a1Title ?? '';
  return {
    name: sheet.name,
    kind: isSpecial ? 'special' : 'main',
    title,
    // Стоп-лист: имя листа без «>» (как в старой версии). Детали: текст A1, например
    // «РадиоКомплект от 21.09.2026»; если A1 пуст — имя листа.
    supplierLabel: isSpecial ? sheet.name.slice(SPECIAL_PREFIX.length).trim() : title || sheet.name,
    sortOrder: sheet.index,
  };
}

export function rowToItem(row: XlsxRow): ItemRecord | null {
  const [nameCell, yearCell, qtyCell, priceCell, descriptionCell] = row.cells;
  const name = cellText(nameCell, false);
  if (name === null) return null;
  const qtyText = cellText(qtyCell, false);
  const priceText = cellText(priceCell, false);
  return {
    rowNumber: row.rowNumber,
    name,
    yearText: cellText(yearCell, true),
    qtyText,
    qtyNum: parseQuantity(qtyCell, qtyText),
    priceText,
    priceNum: parsePrice(priceCell, priceText),
    description: cellText(descriptionCell, true),
  };
}

export async function importWorkbook(
  reader: XlsxReader,
  writer: CatalogWriter,
  onProgress?: (progress: WorkbookProgress) => void,
): Promise<WorkbookStats> {
  const stats: WorkbookStats = { sheets: 0, rowsMain: 0, rowsSpecial: 0 };
  const sheets = reader.sheets.filter((sheet) => !isIgnoredSheet(sheet.name));
  // Листы очень разные по размеру (в рабочей книге один лист — четверть всего XML),
  // поэтому ход считается по прочитанным байтам и сообщается и посреди листа.
  const bytesTotal = sheets.reduce((sum, sheet) => sum + sheet.size, 0);
  let bytesBefore = 0;
  let reportedAt = 0;

  for (const [position, sheet] of sheets.entries()) {
    // Лист регистрируется по строке 1 (A1 — заголовок), а если её в файле нет — по первой
    // строке данных или в конце пустого листа.
    const record = { current: null as (SheetRecord & { id: number }) | null };
    const register = (title: string | null) => {
      const described = describeSheet(sheet, title);
      record.current = { ...described, id: writer.addSheet(described) };
      return record.current;
    };
    let count = 0;

    const report = (sheetBytes: number) => {
      reportedAt = Date.now();
      const special = record.current?.kind === 'special';
      onProgress?.({
        sheetIndex: position + 1,
        sheetCount: sheets.length,
        sheetName: sheet.name,
        rowsMain: stats.rowsMain + (special ? 0 : count),
        rowsSpecial: stats.rowsSpecial + (special ? count : 0),
        bytesDone: bytesBefore + sheetBytes,
        bytesTotal,
      });
    };
    const onBytes = (sheetBytes: number) => {
      if (Date.now() - reportedAt >= PROGRESS_INTERVAL_MS) report(sheetBytes);
    };

    for await (const row of reader.rows(sheet, COLUMNS, onProgress && onBytes)) {
      if (row.rowNumber <= HEADER_ROWS) {
        if (row.rowNumber === 1 && !record.current) register(cellText(row.cells[0], false));
        continue;
      }
      const item = rowToItem(row);
      if (!item) continue;
      writer.addItem((record.current ?? register(null)).id, item);
      count++;
    }

    const registered = record.current ?? register(null);
    writer.setSheetRowCount(registered.id, count);
    stats.sheets++;
    if (registered.kind === 'special') stats.rowsSpecial += count;
    else stats.rowsMain += count;

    bytesBefore += sheet.size;
    count = 0;
    report(0);
  }
  return stats;
}
