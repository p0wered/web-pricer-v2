import { type FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { isApiError } from '../../api/client.ts';
import { useLogin, useSession } from '../../api/queries.ts';
import { Button } from '../../components/button.tsx';
import { PasswordInput } from '../../components/password-input.tsx';
import { CARD, cx, Field } from '../../components/ui.tsx';
import { LogIn } from 'lucide-react';

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
      <main className="flex flex-1 gap-4 flex-col items-center justify-center px-4 pb-[16vh]">
        <div className="flex gap-3 items-center">
          <LogIn className="text-accent"/>
          <h2 className="text-lg font-semibold">
            Авторизация
          </h2>
        </div>

        <form
          onSubmit={submit}
          className={cx(CARD, 'flex w-full max-w-95 flex-col gap-4 p-5')}
          noValidate
        >
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
