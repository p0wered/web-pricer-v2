const priceFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat('ru-RU');

/**
 * Цена для таблицы: распознанное число — в формате ru-RU («1 600», «999,99»), иначе исходный
 * текст из прайса («По запросу», «29 $»).
 */
export function formatPrice(text: string | null, value: number | null): string {
  return value !== null ? priceFormat.format(value) : (text ?? '');
}

export function formatCount(value: number): string {
  return countFormat.format(value);
}

const SUPPLIER_COLORS = 12;

/** Стабильный цвет-метка поставщика (FNV-1a от названия): одинаковый при каждом поиске. */
export function supplierColor(supplier: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < supplier.length; i++) {
    hash ^= supplier.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `var(--sup-${(hash >>> 0) % SUPPLIER_COLORS})`;
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
