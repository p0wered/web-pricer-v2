const priceFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat('ru-RU');

/**
 * Цена для таблицы: распознанное число — в формате ru-RU («1 600», «999,99»), иначе исходный
 * текст из прайса («По запросу», «29 $»). Числом распознаются только рубли, поэтому знак «₽»
 * (`rub`) добавляется только к числу.
 */
export function formatPrice(
  text: string | null,
  value: number | null,
  { rub = false }: { rub?: boolean } = {},
): string {
  if (value === null) return text ?? '';
  const formatted = priceFormat.format(value);
  return rub ? `${formatted}\u00a0₽` : formatted;
}

export function formatCount(value: number): string {
  return countFormat.format(value);
}

const SUPPLIER_COLORS = 8;

/**
 * Номер цвета поставщика (FNV-1a от названия): одинаковый при каждом поиске. Дата в подписи
 * («РадиоКомплект от 21.09.2026») меняется с каждым прайсом, поэтому в хэш не входит.
 */
function supplierSlot(supplier: string): number {
  const key = supplier.replace(/\s+от\s+\d{1,2}\.\d{1,2}\.\d{2,4}$/, '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % SUPPLIER_COLORS;
}

/** Цвет-метка поставщика (точка в колонке «Поставщик»). */
export function supplierColor(supplier: string): string {
  return `var(--sup-${supplierSlot(supplier)})`;
}

/** Фон строки поставщика и фон при наведении. */
export function supplierRowColors(supplier: string): { background: string; hover: string } {
  const slot = supplierSlot(supplier);
  return { background: `var(--sup-${slot}-bg)`, hover: `var(--sup-${slot}-bg-hover)` };
}

const RU_DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

export function formatDateTime(iso: string): string {
  return RU_DATE_TIME.format(new Date(iso));
}

const MOSCOW = 'Europe/Moscow';
/** «ГГГГ-ММ-ДД» по Москве — чтобы сравнивать дни. */
const MOSCOW_DAY = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: MOSCOW,
});
const MOSCOW_TIME = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: MOSCOW,
});
const MOSCOW_DATE = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: MOSCOW,
});
const MOSCOW_DATE_YEAR = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: MOSCOW,
});

/** Недавний момент по Москве: «сегодня в 09:04», «вчера в 22:10», «28 сентября в 09:04». */
export function formatRecentDateTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const day = MOSCOW_DAY.format(date);
  const today = MOSCOW_DAY.format(now);
  const time = MOSCOW_TIME.format(date);
  if (day === today) return `сегодня в ${time}`;
  // В Москве нет перехода на летнее время — сутки всегда 24 часа.
  if (day === MOSCOW_DAY.format(new Date(now.getTime() - 86_400_000))) return `вчера в ${time}`;
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return `${(sameYear ? MOSCOW_DATE : MOSCOW_DATE_YEAR).format(date)} в ${time}`;
}

/** Текущий год по Москве. */
export function currentYear(now = new Date()): number {
  return Number(MOSCOW_DAY.format(now).slice(0, 4));
}

/**
 * Значение колонки «Год» — это год `year`: «2026», «26», «2026 г.», «2026,Элекон» (год и
 * завод). Не подходят даты вида «12.10.2026» — это записи «ГГ.ММ», которые Excel превратил
 * в дату текущего года, — а также диапазоны («2025-2026»), «26шт», «90:26» и т. п.
 */
export function isYear(text: string | null, year: number): boolean {
  if (!text) return false;
  const short = String(year % 100).padStart(2, '0');
  const match = /^(\d{2}|\d{4})(?:\s*г\.?)?(?:\s*,.*)?$/.exec(text.trim());
  return match?.[1] === String(year) || match?.[1] === short;
}
