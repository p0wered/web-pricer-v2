// Настройки импорта (одна запись). Пароль DAV хранится зашифрованным APP_SECRET и наружу
// не отдаётся — только признак «задан».
import type { ImportFrequency, ImportSettings, SettingsUpdate } from '@webpricer/shared';
import type { AppDatabase } from '../db/app-db.ts';
import { encryptSecret } from '../secrets.ts';
import type { Schedule } from '../scheduler/schedule.ts';

interface SettingsRow {
  dav_url: string;
  dav_username: string;
  dav_password_enc: string;
  schedule_frequency: ImportFrequency;
  schedule_day: number | null;
  schedule_time: string;
}

export class MissingDavPasswordError extends Error {
  override name = 'MissingDavPasswordError';
}

export class SettingsStore {
  private readonly db: AppDatabase;
  private readonly appSecret: string;

  constructor(db: AppDatabase, appSecret: string) {
    this.db = db;
    this.appSecret = appSecret;
  }

  get(): ImportSettings | null {
    const row = this.row();
    if (!row) return null;
    return {
      davUrl: row.dav_url,
      davUsername: row.dav_username,
      davPasswordSet: row.dav_password_enc !== '',
      frequency: row.schedule_frequency,
      day: row.schedule_day,
      time: row.schedule_time,
    };
  }

  schedule(): Schedule | null {
    const row = this.row();
    return row
      ? { frequency: row.schedule_frequency, day: row.schedule_day, time: row.schedule_time }
      : null;
  }

  /** Сохраняет настройки. Пустой пароль — оставить прежний; если прежнего нет — ошибка. */
  save(update: SettingsUpdate): void {
    const existing = this.row();
    let passwordEnc: string;
    if (update.davPassword) passwordEnc = encryptSecret(update.davPassword, this.appSecret);
    else if (existing) passwordEnc = existing.dav_password_enc;
    else throw new MissingDavPasswordError('Поле Пароль обязательно для заполнения.');

    this.db
      .prepare(
        `INSERT INTO settings (id, dav_url, dav_username, dav_password_enc, schedule_frequency,
                               schedule_day, schedule_time, updated_at)
         VALUES (1, @url, @username, @password, @frequency, @day, @time, @updatedAt)
         ON CONFLICT (id) DO UPDATE SET
           dav_url = excluded.dav_url, dav_username = excluded.dav_username,
           dav_password_enc = excluded.dav_password_enc,
           schedule_frequency = excluded.schedule_frequency, schedule_day = excluded.schedule_day,
           schedule_time = excluded.schedule_time, updated_at = excluded.updated_at`,
      )
      .run({
        url: update.davUrl,
        username: update.davUsername,
        password: passwordEnc,
        frequency: update.frequency,
        day: update.day,
        time: update.time,
        updatedAt: new Date().toISOString(),
      });
  }

  private row(): SettingsRow | undefined {
    return this.db
      .prepare(
        `SELECT dav_url, dav_username, dav_password_enc, schedule_frequency, schedule_day, schedule_time
         FROM settings WHERE id = 1`,
      )
      .get() as SettingsRow | undefined;
  }
}
