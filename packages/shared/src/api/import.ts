import { z } from 'zod';

export const importRunSchema = z.object({
  id: z.number().int(),
  trigger: z.enum(['schedule', 'manual', 'cli']),
  status: z.enum(['running', 'success', 'failed']),
  stage: z.enum(['download', 'parse', 'finalize']).nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  rowsMain: z.number().int().nullable(),
  rowsSpecial: z.number().int().nullable(),
  /** Код ошибки импорта (auth, connect, http, format, …) — по нему фронт выбирает текст. */
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export const startImportResponseSchema = z.object({ runId: z.number().int() });

export type ImportRun = z.infer<typeof importRunSchema>;
