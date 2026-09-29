import path from 'node:path';
import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // За HTTPS-прокси заказчика IP клиента берётся из X-Forwarded-For (см. PLAN.md §6.8).
  TRUST_PROXY: booleanFromEnv.default(true),
  WEB_DIST_DIR: z.string().optional(),
  DATA_DIR: z.string().optional(),
  // Ключ шифрования секретов в БД (пароль DAV). Если потерян — пароль DAV вводится заново.
  APP_SECRET: z.string().min(16, 'должен быть не короче 16 символов').optional(),
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
  return {
    host: values.HOST,
    port: values.PORT,
    logLevel: values.LOG_LEVEL,
    trustProxy: values.TRUST_PROXY,
    webDistDir: values.WEB_DIST_DIR ?? path.resolve(import.meta.dirname, '../../web/dist'),
    dataDir: path.resolve(values.DATA_DIR ?? path.resolve(import.meta.dirname, '../../../data')),
    appSecret: values.APP_SECRET,
  };
}
