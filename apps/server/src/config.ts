import { isIP } from 'node:net';
import path from 'node:path';
import { z } from 'zod';

/**
 * Каким адресам доверять заголовки X-Forwarded-* (IP клиента, HTTPS). По умолчанию — прокси
 * с этого же хоста и из частных сетей: nginx заказчика рядом с контейнером приходит с адреса
 * шлюза Docker. Клиент из интернета подделать IP не может: его X-Forwarded-For игнорируется.
 * Доверять всем подряд нельзя: X-Forwarded-For присылает клиент, и лимит попыток входа по IP
 * обходился бы подменой заголовка.
 */
export const DEFAULT_TRUSTED_PROXIES: readonly string[] = ['loopback', 'linklocal', 'uniquelocal'];

/** Адрес или подсеть прокси: `10.0.0.5`, `10.0.0.0/8`, `::1`, или имя набора из DEFAULT_TRUSTED_PROXIES. */
function isProxyAddress(value: string): boolean {
  if (DEFAULT_TRUSTED_PROXIES.includes(value)) return true;
  const [address = '', prefix, ...rest] = value.split('/');
  const version = isIP(address);
  if (version === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return /^\d+$/.test(prefix) && bits <= (version === 4 ? 32 : 128);
}

// `true` — значение из прежних инструкций; означает то же, что «не задано».
const trustProxyFromEnv = z
  .string()
  .trim()
  .transform((value, ctx): false | string[] => {
    if (value === '' || value === 'true' || value === '1') return [...DEFAULT_TRUSTED_PROXIES];
    if (value === 'false' || value === '0') return false;
    const items = value.split(',').map((item) => item.trim());
    const invalid = items.filter((item) => !isProxyAddress(item));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `ожидается false или список IP/подсетей прокси через запятую; не распознано: ${invalid.join(', ')}`,
      });
      return z.NEVER;
    }
    return items;
  });

/** docker-compose передаёт незаданные переменные пустой строкой: это значит «не задано». */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Каким прокси доверять X-Forwarded-For/-Proto; см. DEFAULT_TRUSTED_PROXIES.
  TRUST_PROXY: optional(trustProxyFromEnv),
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
  /** `false` — не доверять никому; иначе адреса и подсети прокси (формат Fastify trustProxy). */
  trustProxy: false | string[];
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
    trustProxy: values.TRUST_PROXY ?? [...DEFAULT_TRUSTED_PROXIES],
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
