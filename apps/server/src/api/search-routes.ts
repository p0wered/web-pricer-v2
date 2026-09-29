import { searchRequestSchema } from '@webpricer/shared';
import type { FastifyInstance } from 'fastify';
import { CatalogNotReadyError, type SearchService } from '../search/search-service.ts';

export function registerSearchRoutes(api: FastifyInstance, searchService: SearchService): void {
  api.get('/search', async (request, reply) => {
    const parsed = searchRequestSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные параметры поиска' });
    }
    try {
      const { response, timings } = searchService.search(parsed.data);
      reply.header(
        'Server-Timing',
        `search;dur=${timings.searchMs.toFixed(1)}, hydrate;dur=${timings.hydrateMs.toFixed(1)}` +
          (timings.cached ? ', cache;desc="hit"' : ''),
      );
      return response;
    } catch (error) {
      if (error instanceof CatalogNotReadyError) {
        return reply.code(503).header('Retry-After', '5').send({ error: error.message });
      }
      throw error;
    }
  });
}
