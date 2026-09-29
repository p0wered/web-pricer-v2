import { z } from 'zod';

/** Ответ с ошибками полей формы (HTTP 422): сообщение для каждого поля. */
export const validationErrorSchema = z.object({
  error: z.string(),
  fields: z.record(z.string(), z.string()),
});

export type ValidationError = z.infer<typeof validationErrorSchema>;

/** Любая другая ошибка API. */
export const apiErrorSchema = z.object({ error: z.string() });

/** Первое сообщение для каждого поля из ошибки zod. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    fields[key] ??= issue.message;
  }
  return fields;
}

/**
 * Заголовок, который фронт добавляет к изменяющим запросам. Браузер не отправит его с чужого
 * сайта без CORS-разрешения, поэтому его наличие защищает от CSRF (вместе с SameSite-cookie).
 */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'webpricer';
