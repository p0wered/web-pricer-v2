import path from 'node:path';
import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/** docker-compose передаёт незаданные переменные пустой строкой: это значит «не задано». */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // За HTTPS-прокси заказчика IP клиента берётся из X-Forwarded-For.
  TRUST_PROXY: optional(booleanFromEnv),
  WEB_DIST_DIR: optional(z.string()),
  DATA_DIR: optional(z.string()),
  // Ключ шифрования секретов в БД (пароль DAV). Если потерян — пароль DAV вводится заново.
  APP_SECRET: optional(z.string().min(16, 'должен быть не короче 16 символов')),
  // Пароль входа при первом запуске; дальше пароль меняется в настройках или через CLI.
  APP_INITIAL_PASSWORD: optional(z.string()),
  // Время жизни сессии без активности, минуты (как SESSION_LIFETIME в старой версии).
  SESSION_TTL_MINUTES: optional(z.coerce.number().int().min(1)),
  // auto — флаг Secure у cookie, если запрос пришёл по HTTPS (за прокси — по X-Forwarded-Proto).
  COOKIE_SECURE: optional(z.enum(['auto', 'true', 'false'])),
  // Часовой пояс расписания импорта.
  SCHEDULE_TIMEZONE: optional(z.string()),
  // Сколько последних запросов держать в кэше выдачи (0 — без кэша, для замеров).
  SEARCH_CACHE_SIZE: optional(z.coerce.number().int().min(0)),
});

export interface AppConfig {
  host: string;
  port: number;
  logLevel: string;
  trustProxy: boolean;
  /** Каталог собранного фронта; если его нет, сервер отдаёт только API. */
  webDistDir: string;
  /** Каталог данных: SQLite-базы и временные файлы импорта. */
  dataDir: string;
  appSecret: string | undefined;
  initialPassword: string | undefined;
  sessionTtlMs: number;
  cookieSecure: 'auto' | boolean;
  scheduleTimeZone: string;
  searchCacheSize: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Некорректные переменные окружения: ${details}`);
  }
  const values = parsed.data;
  const cookieSecure = values.COOKIE_SECURE ?? 'auto';
  const timeZone = values.SCHEDULE_TIMEZONE ?? 'Europe/Moscow';
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone });
  } catch {
    throw new Error(
      `Некорректные переменные окружения: SCHEDULE_TIMEZONE: неизвестный пояс ${timeZone}`,
    );
  }
  return {
    host: values.HOST,
    port: values.PORT,
    logLevel: values.LOG_LEVEL,
    trustProxy: values.TRUST_PROXY ?? true,
    webDistDir: values.WEB_DIST_DIR ?? path.resolve(import.meta.dirname, '../../web/dist'),
    dataDir: path.resolve(values.DATA_DIR ?? path.resolve(import.meta.dirname, '../../../data')),
    appSecret: values.APP_SECRET,
    initialPassword: values.APP_INITIAL_PASSWORD,
    sessionTtlMs: (values.SESSION_TTL_MINUTES ?? 120) * 60_000,
    cookieSecure: cookieSecure === 'auto' ? 'auto' : cookieSecure === 'true',
    scheduleTimeZone: timeZone,
    searchCacheSize: values.SEARCH_CACHE_SIZE ?? 100,
  };
}
