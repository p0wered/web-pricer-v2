// Автоимпорт по расписанию из настроек. Изменение настроек применяется сразу (reschedule),
// перезапускать сервер не нужно. Запуск по расписанию идёт через ту же блокировку, что и
// ручной: если импорт уже идёт, плановый пропускается.
import { Cron } from 'croner';
import type { FastifyBaseLogger } from 'fastify';
import { ImportError } from '../import/import-errors.ts';
import type { ImportService } from '../import/import-service.ts';
import type { SettingsStore } from '../settings/settings-store.ts';
import { calendarDay, dailyPattern, isScheduledDay, nextRunAt } from './schedule.ts';

export interface ImportSchedulerDeps {
  settings: SettingsStore;
  imports: ImportService;
  timeZone: string;
  log?: FastifyBaseLogger;
}

export class ImportScheduler {
  private readonly deps: ImportSchedulerDeps;
  private job: Cron | null = null;

  constructor(deps: ImportSchedulerDeps) {
    this.deps = deps;
  }

  /** (Пере)читает расписание из настроек и запускает таймер. */
  reschedule(): void {
    this.stop();
    const schedule = this.deps.settings.schedule();
    if (!schedule) return;
    const { timeZone, log } = this.deps;
    this.job = new Cron(dailyPattern(schedule.time), { timezone: timeZone, protect: true }, () => {
      this.runIfDue();
    });
    log?.info({ nextRunAt: this.nextRunAt()?.toISOString() ?? null }, 'Расписание импорта');
  }

  /**
   * Срабатывание таймера (каждый день в ЧЧ:ММ): запускает импорт, если сегодня день по
   * расписанию. Возвращает номер запуска или `null`.
   */
  runIfDue(now = new Date()): number | null {
    const { settings, imports, timeZone, log } = this.deps;
    const schedule = settings.schedule();
    if (!schedule || !isScheduledDay(schedule, calendarDay(now, timeZone))) return null;
    try {
      const runId = imports.start('schedule');
      log?.info({ runId }, 'Запущен импорт по расписанию');
      return runId;
    } catch (error) {
      if (error instanceof ImportError && error.code === 'already_running') {
        log?.warn('Импорт по расписанию пропущен: уже идёт другой импорт');
      } else {
        log?.error(error, 'Не удалось запустить импорт по расписанию');
      }
      return null;
    }
  }

  nextRunAt(from = new Date()): Date | null {
    const schedule = this.deps.settings.schedule();
    return schedule ? nextRunAt(schedule, from, this.deps.timeZone) : null;
  }

  stop(): void {
    this.job?.stop();
    this.job = null;
  }
}
