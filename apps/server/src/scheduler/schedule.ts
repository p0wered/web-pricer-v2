// Расписание автоимпорта (как в старой версии): ежедневно / еженедельно / ежемесячно в ЧЧ:ММ.
//
// Отличия от старой версии (исправления, PLAN.md §5):
// - день недели — 1…7 (пн…вс), а не «число 1–31»;
// - ежемесячно в 29–31 число: в коротком месяце импорт идёт в последний день месяца
//   (cron в старой версии такие месяцы просто пропускал).
//
// Срабатывание по времени с учётом часового пояса считает croner (каждый день в ЧЧ:ММ),
// а подходит ли день — решает isScheduledDay.
import type { ImportFrequency } from '@webpricer/shared';
import { Cron } from 'croner';

export interface Schedule {
  frequency: ImportFrequency;
  /** Неделя: 1–7 (пн–вс); месяц: 1–31; ежедневно — null. */
  day: number | null;
  /** ЧЧ:ММ */
  time: string;
}

export interface CalendarDay {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  /** 1 — понедельник … 7 — воскресенье. */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Календарный день момента `date` в часовом поясе `timeZone`. */
export function calendarDay(date: Date, timeZone: string): CalendarDay {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday ?? ''] ?? 0,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isScheduledDay(schedule: Schedule, day: CalendarDay): boolean {
  switch (schedule.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return day.weekday === schedule.day;
    case 'monthly':
      return day.day === Math.min(schedule.day ?? 1, daysInMonth(day.year, day.month));
  }
}

/** Выражение cron «каждый день в ЧЧ:ММ». */
export function dailyPattern(time: string): string {
  const [hours = '0', minutes = '0'] = time.split(':');
  return `${Number(minutes)} ${Number(hours)} * * *`;
}

/** Следующий запуск по расписанию после `from` (в пределах двух месяцев — этого всегда хватает). */
export function nextRunAt(schedule: Schedule, from: Date, timeZone: string): Date | null {
  const cron = new Cron(dailyPattern(schedule.time), { timezone: timeZone, paused: true });
  try {
    return (
      cron.nextRuns(62, from).find((run) => isScheduledDay(schedule, calendarDay(run, timeZone))) ??
      null
    );
  } finally {
    cron.stop();
  }
}
