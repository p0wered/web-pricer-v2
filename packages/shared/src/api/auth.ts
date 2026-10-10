import { z } from 'zod';

/** Минимальная длина пароля — как в старой версии (Password::defaults() в Laravel). */
export const PASSWORD_MIN_LENGTH = 8;

export const loginRequestSchema = z.object({
  password: z.string().min(1, 'Введите пароль').max(200),
});

export const changePasswordRequestSchema = z
  .object({
    current: z.string().min(1, 'Введите текущий пароль'),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Не короче ${PASSWORD_MIN_LENGTH} символов`)
      .max(200),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    path: ['password'],
    message: 'Пароли не совпадают',
  });

export const sessionResponseSchema = z.object({ authenticated: z.literal(true) });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
