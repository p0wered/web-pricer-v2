import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import type { HealthResponse } from '@webpricer/shared';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './api/auth-routes.ts';
import { registerImportRoutes } from './api/import-routes.ts';
import { registerSearchRoutes } from './api/search-routes.ts';
import { registerSettingsRoutes } from './api/settings-routes.ts';
import type { AuthStore } from './auth/auth-store.ts';
import { LoginLimiter } from './auth/login-limiter.ts';
import type { AppConfig } from './config.ts';
import type { ImportService } from './import/import-service.ts';
import type { ImportScheduler } from './scheduler/import-scheduler.ts';
import type { SearchService } from './search/search-service.ts';
import type { SettingsStore } from './settings/settings-store.ts';

/** Части приложения; тесты подключают только нужные. Без `auth` API открыто (только тесты). */
export interface AppDeps {
  /** Общий логгер процесса (им же пишут планировщик и загрузка каталога). */
  logger?: FastifyBaseLogger;
  auth?: AuthStore;
  loginLimiter?: LoginLimiter;
  searchService?: SearchService;
  settings?: SettingsStore;
  scheduler?: ImportScheduler;
  imports?: ImportService;
}

export async function buildApp(config: AppConfig, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    ...(deps.logger ? { loggerInstance: deps.logger } : { logger: { level: config.logLevel } }),
    trustProxy: config.trustProxy,
  });

  // Ответы поиска — до ~80 КБ JSON: сжатие заметно ускоряет их передачу по сети.
  await app.register(fastifyCompress, { threshold: 512 });
  await app.register(fastifyCookie);

  await app.register(
    async (api) => {
      // Проверка сессии и CSRF-заголовка — до регистрации остальных маршрутов.
      if (deps.auth) {
        registerAuthRoutes(api, {
          auth: deps.auth,
          limiter: deps.loginLimiter ?? new LoginLimiter(),
          sessionTtlMs: config.sessionTtlMs,
          cookieSecure: config.cookieSecure,
        });
      }
      api.get('/health', async (): Promise<HealthResponse> => ({
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime()),
      }));
      if (deps.searchService) registerSearchRoutes(api, deps.searchService);
      if (deps.settings && deps.scheduler && deps.auth) {
        registerSettingsRoutes(api, {
          settings: deps.settings,
          scheduler: deps.scheduler,
          auth: deps.auth,
        });
      }
      if (deps.imports) registerImportRoutes(api, deps.imports);
    },
    { prefix: '/api' },
  );

  const hasWebDist = existsSync(path.join(config.webDistDir, 'index.html'));
  if (hasWebDist) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url === '/api' || request.url.startsWith('/api/');
    if (hasWebDist && request.method === 'GET' && !isApi) {
      // SPA: любые неизвестные страницы отдаются фронту, маршрутизирует React Router.
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Не найдено' });
  });

  return app;
}
