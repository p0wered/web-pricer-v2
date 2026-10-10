// Вход по общему паролю, выход, проверка сессии и защита остальных маршрутов API.
import { CSRF_HEADER, CSRF_HEADER_VALUE, fieldErrors, loginRequestSchema } from '@webpricer/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthStore } from '../auth/auth-store.ts';
import type { LoginLimiter } from '../auth/login-limiter.ts';

export const SESSION_COOKIE = 'webpricer_session';

export interface AuthRouteOptions {
  auth: AuthStore;
  limiter: LoginLimiter;
  sessionTtlMs: number;
  /** `auto` — Secure, если запрос пришёл по HTTPS (с учётом X-Forwarded-Proto за прокси). */
  cookieSecure: 'auto' | boolean;
}

/** Маршруты API без входа. */
const PUBLIC_ROUTES = new Set(['GET /api/health', 'POST /api/auth/login']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const secondsPlural = new Intl.PluralRules('ru-RU');
const SECONDS_WORD: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: 'секунду',
  few: 'секунды',
};
const formatSeconds = (count: number) =>
  `${count} ${SECONDS_WORD[secondsPlural.select(count)] ?? 'секунд'}`;

declare module 'fastify' {
  interface FastifyRequest {
    sessionToken?: string;
  }
}

function setSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  token: string,
  options: AuthRouteOptions,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: options.cookieSecure === 'auto' ? request.protocol === 'https' : options.cookieSecure,
    maxAge: Math.round(options.sessionTtlMs / 1000),
  });
}

export function registerAuthRoutes(api: FastifyInstance, options: AuthRouteOptions): void {
  const { auth, limiter } = options;

  api.addHook('onRequest', async (request, reply) => {
    if (!SAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
      return reply.code(403).send({ error: 'Запрос отклонён.' });
    }
    const route = `${request.method} ${request.routeOptions.url ?? request.url.split('?')[0]}`;
    if (PUBLIC_ROUTES.has(route)) return;

    const token = request.cookies[SESSION_COOKIE];
    if (!token || !auth.touchSession(token)) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.code(401).send({ error: 'Требуется вход.' });
    }
    request.sessionToken = token;
    // Скользящее время жизни: cookie продлевается вместе с сессией (как в старой версии).
    setSessionCookie(reply, request, token, options);
  });

  api.post('/auth/login', async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send({ error: 'Проверьте поля формы.', fields: fieldErrors(parsed.error) });
    }
    const retryAfter = limiter.acquire(request.ip);
    if (retryAfter > 0) {
      return reply
        .code(429)
        .header('Retry-After', String(retryAfter))
        .send({
          error: `Слишком много попыток входа. Попробуйте через ${formatSeconds(retryAfter)}.`,
        });
    }
    if (!(await auth.verifyPassword(parsed.data.password))) {
      return reply
        .code(422)
        .send({ error: 'Неверный пароль', fields: { password: 'Неверный пароль' } });
    }
    limiter.succeeded(request.ip);
    auth.deleteExpiredSessions();
    setSessionCookie(reply, request, auth.createSession(), options);
    return reply.code(204).send();
  });

  api.post('/auth/logout', async (request, reply) => {
    if (request.sessionToken) auth.deleteSession(request.sessionToken);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  api.get('/auth/me', async () => ({ authenticated: true as const }));
}
