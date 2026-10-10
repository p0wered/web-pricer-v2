import { z } from 'zod';

export const importFrequencySchema = z.enum(['daily', 'weekly', 'monthly']);

/** Дни недели для еженедельного импорта: 1 — понедельник … 7 — воскресенье. */
export const WEEKDAY_NAMES = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
] as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Настройки импорта в ответе API. Пароль DAV отдаётся открытым: страница настроек показывает его всегда. */
export const importSettingsSchema = z.object({
  davUrl: z.string(),
  davUsername: z.string(),
  davPasswordSet: z.boolean(),
  /** Пустая строка — пароля нет или его не расшифровать (сменился APP_SECRET). */
  davPassword: z.string(),
  frequency: importFrequencySchema,
  /** Неделя: 1–7 (пн–вс); месяц: 1–31; ежедневно — null. */
  day: z.number().int().nullable(),
  time: z.string(),
});

export const settingsResponseSchema = z.object({
  /** `null` — настройки ещё не сохранялись. */
  settings: importSettingsSchema.nullable(),
  /** Время следующего запуска по расписанию (ISO), если настройки есть. */
  nextRunAt: z.string().nullable(),
});

export const settingsUpdateSchema = z
  .object({
    davUrl: z
      .string()
      .trim()
      .min(1, 'Укажите URL файла.')
      .refine(isHttpUrl, 'Нужен адрес, начинающийся с http:// или https://.'),
    davUsername: z.string().trim().min(1, 'Укажите логин.'),
    /** Пусто или не передан — оставить сохранённый пароль. */
    davPassword: z.string().optional(),
    frequency: importFrequencySchema,
    day: z.number().int().nullable().optional(),
    time: z.string().regex(TIME_PATTERN, 'Введите время в формате ЧЧ:ММ.'),
  })
  .superRefine((value, ctx) => {
    const day = value.day ?? null;
    if (value.frequency === 'weekly' && (day === null || day < 1 || day > 7)) {
      ctx.addIssue({ code: 'custom', path: ['day'], message: 'Выберите день недели.' });
    }
    if (value.frequency === 'monthly' && (day === null || day < 1 || day > 31)) {
      ctx.addIssue({
        code: 'custom',
        path: ['day'],
        message: 'Число месяца должно быть от 1 до 31.',
      });
    }
  })
  .transform((value) => ({
    ...value,
    day: value.frequency === 'daily' ? null : (value.day ?? null),
    davPassword: value.davPassword || undefined,
  }));

export type ImportFrequency = z.infer<typeof importFrequencySchema>;
export type ImportSettings = z.infer<typeof importSettingsSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
export type SettingsUpdateInput = z.input<typeof settingsUpdateSchema>;
