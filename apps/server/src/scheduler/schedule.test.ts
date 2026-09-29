import { describe, expect, it } from 'vitest';
import { calendarDay, dailyPattern, isScheduledDay, nextRunAt, type Schedule } from './schedule.ts';

const TZ = 'Europe/Moscow';
const day = (iso: string) => calendarDay(new Date(iso), TZ);

describe('calendarDay', () => {
  it('берёт дату в часовом поясе расписания, а не в UTC', () => {
    // 22:30 UTC 30 сентября — это уже 1 октября в Москве (UTC+3).
    expect(day('2026-09-30T22:30:00Z')).toEqual({ year: 2026, month: 10, day: 1, weekday: 4 });
  });
});

describe('isScheduledDay', () => {
  it('еженедельно: 1 — понедельник, 7 — воскресенье', () => {
    const monday: Schedule = { frequency: 'weekly', day: 1, time: '09:00' };
    const sunday: Schedule = { frequency: 'weekly', day: 7, time: '09:00' };
    expect(isScheduledDay(monday, day('2026-09-28T09:00:00Z'))).toBe(true); // пн
    expect(isScheduledDay(monday, day('2026-09-29T09:00:00Z'))).toBe(false); // вт
    expect(isScheduledDay(sunday, day('2026-10-04T09:00:00Z'))).toBe(true); // вс
  });

  it('ежемесячно в 31-е: в коротком месяце — последний день', () => {
    const schedule: Schedule = { frequency: 'monthly', day: 31, time: '09:00' };
    expect(isScheduledDay(schedule, day('2026-09-30T09:00:00Z'))).toBe(true);
    expect(isScheduledDay(schedule, day('2026-09-29T09:00:00Z'))).toBe(false);
    expect(isScheduledDay(schedule, day('2026-10-30T09:00:00Z'))).toBe(false);
    expect(isScheduledDay(schedule, day('2026-10-31T09:00:00Z'))).toBe(true);
    expect(isScheduledDay(schedule, day('2027-02-28T09:00:00Z'))).toBe(true);
  });

  it('ежедневно — каждый день', () => {
    expect(
      isScheduledDay({ frequency: 'daily', day: null, time: '09:00' }, day('2026-09-29T09:00:00Z')),
    ).toBe(true);
  });
});

describe('nextRunAt', () => {
  const from = new Date('2026-09-29T10:00:00Z'); // вт, 13:00 по Москве

  it('ежедневно: сегодня, если время ещё не прошло, иначе завтра', () => {
    expect(
      nextRunAt({ frequency: 'daily', day: null, time: '15:30' }, from, TZ)?.toISOString(),
    ).toBe('2026-09-29T12:30:00.000Z');
    expect(
      nextRunAt({ frequency: 'daily', day: null, time: '09:00' }, from, TZ)?.toISOString(),
    ).toBe('2026-09-30T06:00:00.000Z');
  });

  it('еженедельно: ближайший нужный день недели', () => {
    expect(nextRunAt({ frequency: 'weekly', day: 1, time: '09:00' }, from, TZ)?.toISOString()).toBe(
      '2026-10-05T06:00:00.000Z',
    );
  });

  it('ежемесячно в 31-е: 30 сентября', () => {
    expect(
      nextRunAt({ frequency: 'monthly', day: 31, time: '09:00' }, from, TZ)?.toISOString(),
    ).toBe('2026-09-30T06:00:00.000Z');
  });
});

describe('dailyPattern', () => {
  it('строит выражение cron из ЧЧ:ММ', () => {
    expect(dailyPattern('09:05')).toBe('5 9 * * *');
    expect(dailyPattern('00:00')).toBe('0 0 * * *');
  });
});
