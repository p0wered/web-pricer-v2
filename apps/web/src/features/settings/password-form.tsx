import { type FormEvent, useState } from 'react';
import { isApiError } from '../../api/client.ts';
import { useChangePassword } from '../../api/queries.ts';
import { Button, Field, Notice, TextInput } from '../../components/ui.tsx';

const EMPTY = { current: '', password: '', confirmation: '' };

export function PasswordForm() {
  const [form, setForm] = useState(EMPTY);
  const change = useChangePassword();
  const fields = isApiError(change.error, 422) ? change.error.fields : {};

  const set = (key: keyof typeof EMPTY, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (change.isSuccess) change.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate(form, { onSuccess: () => setForm(EMPTY) });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {/* Скрытое имя пользователя помогает менеджерам паролей связать запись с сайтом. */}
      <input type="text" autoComplete="username" value="webpricer" readOnly hidden />
      <Field label="Текущий пароль" error={fields.current}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            type="password"
            value={form.current}
            onChange={(event) => set('current', event.target.value)}
            autoComplete="current-password"
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Новый пароль" error={fields.password} hint="Не короче 8 символов">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="password"
              value={form.password}
              onChange={(event) => set('password', event.target.value)}
              autoComplete="new-password"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        <Field label="Подтверждение" error={fields.confirmation}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="password"
              value={form.confirmation}
              onChange={(event) => set('confirmation', event.target.value)}
              autoComplete="new-password"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={change.isPending}>
          {change.isPending ? 'Сохранение…' : 'Сменить пароль'}
        </Button>
        {change.isSuccess && (
          <Notice tone="success">Пароль изменён. На других устройствах нужно войти заново.</Notice>
        )}
        {change.isError && !isApiError(change.error, 422) && (
          <Notice tone="error">{change.error.message}</Notice>
        )}
      </div>
    </form>
  );
}
