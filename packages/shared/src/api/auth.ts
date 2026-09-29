import { z } from 'zod';

/** Минимальная длина пароля — как в старой версии (Password::defaults() в Laravel). */
export const PASSWORD_MIN_LENGTH = 8;

export const loginRequestSchema = z.object({
  password: z.string().min(1, 'Поле Пароль обязательно для заполнения.').max(200),
});

export const changePasswordRequestSchema = z
  .object({
    current: z.string().min(1, 'Поле Текущий пароль обязательно для заполнения.'),
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `Количество символов в поле Пароль должно быть не меньше ${PASSWORD_MIN_LENGTH}.`,
      )
      .max(200),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    path: ['password'],
    message: 'Поле Пароль не совпадает с подтверждением.',
  });

export const sessionResponseSchema = z.object({ authenticated: z.literal(true) });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
