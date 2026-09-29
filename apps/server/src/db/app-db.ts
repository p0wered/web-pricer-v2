// Служебная БД приложения (настройки, журнал импортов; на этапе 3 — пароль и сессии).
// Миграции — только добавлением в конец списка; номер применённой хранится в user_version.
import Database from 'better-sqlite3';

export type AppDatabase = Database.Database;

const MIGRATIONS: readonly string[] = [
  // 1. Настройки импорта и журнал импортов.
  `
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dav_url TEXT NOT NULL,
    dav_username TEXT NOT NULL,
    dav_password_enc TEXT NOT NULL,
    schedule_frequency TEXT NOT NULL CHECK (schedule_frequency IN ('daily', 'weekly', 'monthly')),
    schedule_day INTEGER,
    schedule_time TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE import_runs (
    id INTEGER PRIMARY KEY,
    trigger TEXT NOT NULL CHECK (trigger IN ('schedule', 'manual', 'cli')),
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    stage TEXT,
    started_at TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL,
    finished_at TEXT,
    source TEXT,
    file_bytes INTEGER,
    sheets INTEGER,
    rows_main INTEGER,
    rows_special INTEGER,
    error_code TEXT,
    error_message TEXT
  );

  CREATE INDEX import_runs_status ON import_runs (status);
  `,
  // 2. Общий пароль входа и сессии.
  `
  CREATE TABLE auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,           -- SHA-256 от токена из cookie; сам токен не хранится
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX sessions_expires_at ON sessions (expires_at);
  `,
];

export function openAppDb(filePath: string): AppDatabase {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: AppDatabase): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > MIGRATIONS.length) {
    throw new Error(
      `Версия БД (${current}) новее, чем поддерживает приложение (${MIGRATIONS.length}). ` +
        'Похоже, запущена старая сборка приложения на данных от новой.',
    );
  }
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version] ?? '');
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}
