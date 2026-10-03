import path from 'node:path';
import { type AppConfig, DEFAULT_TRUSTED_PROXIES } from '../config.ts';

/** Конфигурация для тестов: без логов, без собранного фронта. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    trustProxy: [...DEFAULT_TRUSTED_PROXIES],
    webDistDir: path.join('/nonexistent', 'dist'),
    dataDir: path.join('/nonexistent', 'data'),
    appSecret: 'test-secret-0123456789',
    initialPassword: undefined,
    sessionTtlMs: 120 * 60_000,
    cookieSecure: 'auto',
    scheduleTimeZone: 'Europe/Moscow',
    searchCacheSize: 10,
    ...overrides,
  };
}
