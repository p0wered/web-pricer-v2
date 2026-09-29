import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyCompress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import type { HealthResponse } from '@webpricer/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerSearchRoutes } from './api/search-routes.ts';
import type { AppConfig } from './config.ts';
import type { SearchService } from './search/search-service.ts';

export interface AppDeps {
  searchService?: SearchService;
}

export async function buildApp(config: AppConfig, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy,
  });

  // Ответы поиска — до ~80 КБ JSON: сжатие заметно ускоряет их передачу по сети.
  await app.register(fastifyCompress, { threshold: 512 });

  await app.register(
    async (api) => {
      api.get('/health', async (): Promise<HealthResponse> => ({
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime()),
      }));
      if (deps.searchService) registerSearchRoutes(api, deps.searchService);
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
