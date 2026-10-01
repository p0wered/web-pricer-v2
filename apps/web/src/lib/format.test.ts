import { describe, expect, it } from 'vitest';
import { formatRecentDateTime } from './format.ts';

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
