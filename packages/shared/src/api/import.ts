import { z } from 'zod';

/** Ход импорта внутри этапа — для индикатора в настройках и вывода CLI. */
export const importProgressSchema = z.discriminatedUnion('stage', [
  z.object({
    stage: z.literal('download'),
    bytes: z.number().int(),
    /** `null` — сервер с файлом не сообщил размер. */
    totalBytes: z.number().int().nullable(),
  }),
  z.object({
    stage: z.literal('parse'),
    /** Номер листа, который сейчас разбирается, с единицы. */
    sheetIndex: z.number().int(),
    sheetCount: z.number().int(),
    sheetName: z.string(),
    rowsMain: z.number().int(),
    rowsSpecial: z.number().int(),
    /** Прочитано XML листов (без сжатия) — по нему считается доля разбора. */
    bytesDone: z.number().int(),
    bytesTotal: z.number().int(),
  }),
  z.object({ stage: z.literal('finalize') }),
]);

export const importRunSchema = z.object({
  id: z.number().int(),
  trigger: z.enum(['schedule', 'manual', 'cli']),
  status: z.enum(['running', 'success', 'failed']),
  stage: z.enum(['download', 'parse', 'finalize']).nullable(),
  /**
   * Подробный ход текущего этапа. Только пока импорт идёт и только для импорта,
   * запущенного сервером (у импорта из CLI — `null`, виден лишь этап).
   */
  progress: importProgressSchema.nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  rowsMain: z.number().int().nullable(),
  rowsSpecial: z.number().int().nullable(),
  /** Код ошибки импорта (auth, connect, http, format, …) — по нему фронт выбирает текст. */
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export const startImportResponseSchema = z.object({ runId: z.number().int() });

/** Состояние импорта для страницы настроек. */
export const importStatusResponseSchema = z.object({
  /** Идущий сейчас импорт — его ход показывается сразу при открытии страницы. */
  running: importRunSchema.nullable(),
  /** Последний завершённый импорт (успешный или с ошибкой); `null` — импортов ещё не было. */
  last: importRunSchema.nullable(),
});

export type ImportProgress = z.infer<typeof importProgressSchema>;
export type ImportRun = z.infer<typeof importRunSchema>;
export type ImportStatusResponse = z.infer<typeof importStatusResponseSchema>;
