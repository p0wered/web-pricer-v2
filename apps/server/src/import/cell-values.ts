// Преобразование значений ячеек в то, что хранится в каталоге.
// Правила выведены из реальных данных Pricer.xlsm (см. PLAN.md §2 и §6.3).
import type { CellValue } from './xlsx/xlsx-reader.ts';

// BOM, zero-width space/joiner, word joiner, мягкий перенос.
const INVISIBLE = /[\uFEFF\u200B-\u200D\u2060\u00AD]/g;
// Управляющие символы и «нестандартные» пробелы (NBSP, узкий NBSP, цифровой пробел).
// eslint-disable-next-line no-control-regex -- управляющие символы здесь и ищем
const SPACE_LIKE = /[\u0000-\u001F\u007F\u00A0\u2007\u202F]/g;

/** Убирает невидимые символы, приводит пробелы к обычным, схлопывает их и обрезает края. */
export function cleanText(text: string): string {
  return text.replace(INVISIBLE, '').replace(SPACE_LIKE, ' ').replace(/\s+/g, ' ').trim();
}

/** Число как в Excel: без артефактов двоичной арифметики (145.79999999999998 → 145.8). */
export function formatNumber(value: number): string {
  return String(Number(value.toPrecision(15)));
}

// Серийные номера дат Excel, которые правдоподобны как даты: 1954–2064 годы.
const MIN_DATE_SERIAL = 20000;
const MAX_DATE_SERIAL = 60000;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

/** `46307` → `12.10.2026`; `null`, если число не похоже на дату. */
export function excelSerialToDate(serial: number): string | null {
  if (!Number.isInteger(serial) || serial < MIN_DATE_SERIAL || serial > MAX_DATE_SERIAL)
    return null;
  const date = new Date(EXCEL_EPOCH_MS + serial * DAY_MS);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getUTCFullYear()}`;
}

/**
 * Текст ячейки для показа.
 * `allowDates` — показывать ли числа с форматом даты как дату. Включается только для колонок
 * «Год»/«Описание»: в колонках количества и цены формат даты в файле — ошибка оформления
 * (например, цена 36800 с форматом «ммм-гг»).
 */
export function cellText(cell: CellValue | undefined, allowDates: boolean): string | null {
  if (!cell) return null;
  let text: string;
  switch (cell.type) {
    case 'string':
      text = cell.value;
      break;
    case 'number':
      text =
        (allowDates && cell.isDate && excelSerialToDate(cell.value)) || formatNumber(cell.value);
      break;
    case 'boolean':
      text = cell.value ? 'TRUE' : 'FALSE';
      break;
    case 'error':
      text = cell.value;
      break;
  }
  const cleaned = cleanText(text);
  return cleaned === '' ? null : cleaned;
}

// «1 600», «320,00», «999-99» (рубли-копейки), «180р», «180 руб.», «415 ₽», «>1000».
const PRICE_PATTERN = /^[<>~≈]?(\d+)(?:[.,](\d+)|-(\d{2}))?(?:р\.?|руб\.?|₽)?$/i;
// «199шт», «9000 шт.», «>1000», «<10».
const QUANTITY_PATTERN = /^[<>~≈]?(\d+)(?:[.,](\d+))?(?:шт\.?|штук)?$/i;

function parseWith(pattern: RegExp, text: string): number | null {
  const match = pattern.exec(text.replace(/\s/g, ''));
  if (!match) return null;
  const [, whole, fraction, kopecks] = match;
  return Number(`${whole}.${fraction ?? kopecks ?? '0'}`);
}

/**
 * Числовая цена для сортировки. Только рубли: цены в других валютах («29 $», «190 Rs.»)
 * и текст («По запросу», «звоните», артикулы) → `null`, показывается исходный текст.
 */
export function parsePrice(cell: CellValue | undefined, text: string | null): number | null {
  if (cell?.type === 'number') return cell.value;
  return text === null ? null : parseWith(PRICE_PATTERN, text);
}

export function parseQuantity(cell: CellValue | undefined, text: string | null): number | null {
  if (cell?.type === 'number') return cell.value;
  return text === null ? null : parseWith(QUANTITY_PATTERN, text);
}
