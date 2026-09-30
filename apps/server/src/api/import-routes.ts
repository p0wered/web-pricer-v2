import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ImportError } from '../import/import-errors.ts';
import type { ImportService } from '../import/import-service.ts';

const runParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export function registerImportRoutes(api: FastifyInstance, imports: ImportService): void {
  api.post('/import', async (_request, reply) => {
    try {
      return reply.code(202).send({ runId: imports.start('manual') });
    } catch (error) {
      if (error instanceof ImportError && error.code === 'already_running') {
        return reply.code(409).send({ error: error.message, runId: imports.runningRunId() });
      }
      throw error;
    }
  });

  // Идущий сейчас импорт (кнопка, расписание или CLI) — страница настроек подхватывает его ход.
  api.get('/import/current', async () => {
    const runId = imports.runningRunId();
    return { run: runId === null ? null : imports.getRun(runId) };
  });

  api.get('/import/:id', async (request, reply) => {
    const parsed = runParamsSchema.safeParse(request.params);
    const run = parsed.success ? imports.getRun(parsed.data.id) : null;
    if (!run) return reply.code(404).send({ error: 'Запуск импорта не найден.' });
    return run;
  });
}
