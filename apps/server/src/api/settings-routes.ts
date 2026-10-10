import {
  changePasswordRequestSchema,
  fieldErrors,
  type SettingsResponse,
  settingsUpdateSchema,
} from '@webpricer/shared';
import type { FastifyInstance } from 'fastify';
import type { AuthStore } from '../auth/auth-store.ts';
import type { ImportScheduler } from '../scheduler/import-scheduler.ts';
import { MissingDavPasswordError, type SettingsStore } from '../settings/settings-store.ts';

export interface SettingsRouteOptions {
  settings: SettingsStore;
  scheduler: ImportScheduler;
  auth: AuthStore;
}

export function registerSettingsRoutes(api: FastifyInstance, options: SettingsRouteOptions): void {
  const { settings, scheduler, auth } = options;

  const current = (): SettingsResponse => ({
    settings: settings.get(),
    nextRunAt: scheduler.nextRunAt()?.toISOString() ?? null,
  });

  api.get('/settings', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store'); // в ответе пароль DAV
    return current();
  });

  api.put('/settings', async (request, reply) => {
    const parsed = settingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send({ error: 'Проверьте поля формы.', fields: fieldErrors(parsed.error) });
    }
    try {
      settings.save(parsed.data);
    } catch (error) {
      if (error instanceof MissingDavPasswordError) {
        return reply
          .code(422)
          .send({ error: 'Проверьте поля формы.', fields: { davPassword: error.message } });
      }
      throw error;
    }
    scheduler.reschedule();
    return current();
  });

  api.post('/settings/password', async (request, reply) => {
    const parsed = changePasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send({ error: 'Проверьте поля формы.', fields: fieldErrors(parsed.error) });
    }
    if (!(await auth.verifyPassword(parsed.data.current))) {
      return reply.code(422).send({
        error: 'Проверьте поля формы.',
        fields: { current: 'Текущий пароль введён неверно.' },
      });
    }
    await auth.setPassword(parsed.data.password);
    // Пароль общий: после смены остальные сессии завершаются, текущая остаётся.
    if (request.sessionToken) auth.deleteOtherSessions(request.sessionToken);
    return reply.code(204).send();
  });
}
