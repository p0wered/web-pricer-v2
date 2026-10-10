import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@webpricer/shared';
import type { z } from 'zod';

/** Ошибка API: статус, текст для пользователя и (для форм) ошибки по полям. */
export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number;
  readonly fields: Record<string, string>;
  readonly body: unknown;

  constructor(
    status: number,
    message: string,
    fields: Record<string, string> = {},
    body?: unknown,
  ) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.body = body;
  }
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  signal?: AbortSignal;
  schema?: z.ZodType<T>;
}

const NETWORK_ERROR = 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.';

export async function apiRequest<T = void>(
  path: string,
  { method = 'GET', body, signal, schema }: RequestOptions<T> = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: 'same-origin',
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, NETWORK_ERROR);
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const payload = (data ?? {}) as { error?: string; fields?: Record<string, string> };
    throw new ApiError(
      response.status,
      payload.error ?? `Ошибка сервера (${response.status}).`,
      payload.fields ?? {},
      data,
    );
  }
  return schema ? schema.parse(data) : (data as T);
}

export const isApiError = (error: unknown, status?: number): error is ApiError =>
  error instanceof ApiError && (status === undefined || error.status === status);
