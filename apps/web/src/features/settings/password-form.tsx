import { SquarePen } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { isApiError } from '../../api/client.ts';
import { useChangePassword } from '../../api/queries.ts';
import { TextInput } from '../../components/input.tsx';
import { PasswordInput } from '../../components/password-input.tsx';
import { Field } from '../../components/ui.tsx';
import { SaveBar } from './save-bar.tsx';
import { SaveStatus, Section } from './section.tsx';

const EMPTY = { current: '', password: '', confirmation: '' };

export function PasswordForm() {
  const [form, setForm] = useState(EMPTY);
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const change = useChangePassword();
  const fields = isApiError(change.error, 422) ? change.error.fields : {};
  const dirty = Object.values(form).some(Boolean);

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Кнопка не блокируется во время сохранения — повторное нажатие просто игнорируем.
    if (change.isPending) return;
    change.mutate(form, {
      onSuccess: () => {
        setForm(EMPTY);
        setChangedAt(Date.now());
      },
    });
  };

  const reset = () => {
    change.reset();
    setForm(EMPTY);
  };

  const barError = !change.isError
    ? undefined
    : isApiError(change.error, 422)
      ? 'Проверьте выделенные поля.'
      : change.error.message;

  return (
    <form onSubmit={submit} noValidate>
      <Section
        title="Пароль для входа"
        description="После смены остальные сеансы завершатся"
        aside={<SaveStatus savedAt={changedAt} label="Пароль изменён" pending={change.isPending} />}
        bar={
          <SaveBar
            open={dirty}
            error={barError}
            submitLabel="Сменить пароль"
            icon={SquarePen}
            onReset={reset}
          />
        }
      >
        <div className="flex flex-col gap-4">
          {/* Скрытое имя пользователя помогает менеджерам паролей связать запись с сайтом. */}
          <input type="text" autoComplete="username" value="webpricer" readOnly hidden />
          <Field label="Текущий пароль" error={fields.current}>
            {({ id, describedBy, invalid }) => (
              <PasswordInput
                id={id}
                value={form.current}
                onChange={(event) => set('current', event.target.value)}
                autoComplete="current-password"
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Новый пароль" error={fields.password}>
              {({ id, describedBy, invalid }) => (
                <PasswordInput
                  id={id}
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
        </div>
      </Section>
    </form>
  );
}
