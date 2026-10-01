import { type FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { isApiError } from '../../api/client.ts';
import { useLogin, useSession } from '../../api/queries.ts';
import { ThemeToggle } from '../../components/app-header.tsx';
import { Button } from '../../components/button.tsx';
import { PasswordInput } from '../../components/password-input.tsx';
import { CARD, cx, Field } from '../../components/ui.tsx';

export function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const next = (location.state as { from?: string } | null)?.from ?? '/search';

  useEffect(() => {
    document.title = 'Вход — WebPricer';
  }, []);

  if (session.data === true) return <Navigate to={next} replace />;

  const error = isApiError(login.error)
    ? (login.error.fields.password ?? login.error.message)
    : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(password, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: () => setPassword(''),
    });
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex justify-end p-3">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pt-[16vh]">
        <form
          onSubmit={submit}
          className={cx(CARD, 'flex w-full max-w-[380px] flex-col gap-6 p-5')}
          noValidate
        >
          <div className="flex flex-col items-center justify-center text-center">
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-fg">WebPricer</h1>
            <p className="text-[13px] text-subtle">Авторизация</p>
          </div>
          {/* Имя пользователя одно на всех: скрытое поле нужно менеджерам паролей. */}
          <input type="text" autoComplete="username" value="webpricer" readOnly hidden />
          <Field label="Пароль" error={error}>
            {({ id, describedBy, invalid }) => (
              <PasswordInput
                id={id}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="h-10"
            disabled={login.isPending || !password}
          >
            {login.isPending ? 'Вход…' : 'Войти'}
          </Button>
        </form>
      </main>
    </div>
  );
}
