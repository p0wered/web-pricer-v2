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
