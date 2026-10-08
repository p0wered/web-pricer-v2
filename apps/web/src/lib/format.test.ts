import { describe, expect, it } from 'vitest';
import { formatPrice, formatRecentDateTime, isYear } from './format.ts';

describe('formatRecentDateTime', () => {
  // 1 октября 2026, 14:00 по Москве (UTC+3).
  const now = new Date('2026-10-01T11:00:00Z');

  it('сегодня и вчера — по московским суткам', () => {
    expect(formatRecentDateTime('2026-10-01T06:04:00Z', now)).toBe('сегодня в 09:04');
    // 30 сентября 21:30 UTC — уже 1 октября 00:30 по Москве.
    expect(formatRecentDateTime('2026-09-30T21:30:00Z', now)).toBe('сегодня в 00:30');
    expect(formatRecentDateTime('2026-09-30T19:10:00Z', now)).toBe('вчера в 22:10');
  });

  it('раньше — датой, год только если другой', () => {
    expect(formatRecentDateTime('2026-09-28T06:04:00Z', now)).toBe('28 сентября в 09:04');
    expect(formatRecentDateTime('2025-12-31T06:04:00Z', now)).toBe('31 декабря 2025 г. в 09:04');
  });
});

describe('formatPrice', () => {
  it('знак рубля — только у распознанного числа', () => {
    expect(formatPrice('1600', 1600, { rub: true })).toBe('1\u00a0600\u00a0₽');
    expect(formatPrice('29 $', null, { rub: true })).toBe('29 $');
    expect(formatPrice('999,99', 999.99)).toBe('999,99');
  });
});

describe('isYear', () => {
  it('узнаёт год в записях колонки «Год»', () => {
    for (const text of ['2026', '26', '2026г', '2026 г.', '2026,Элекон', ' 26 ']) {
      expect(isYear(text, 2026)).toBe(true);
    }
  });

  it('не путает с датами, диапазонами и другими числами', () => {
    for (const text of [
      '12.10.2026',
      '2025-2026',
      '2024(2026)',
      '26шт',
      '90:26',
      '2025',
      '126',
      null,
    ]) {
      expect(isYear(text, 2026)).toBe(false);
    }
  });
});
