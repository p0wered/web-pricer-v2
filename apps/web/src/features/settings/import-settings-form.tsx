import {
  type ImportFrequency,
  type ImportSettings,
  type SettingsResponse,
  WEEKDAY_NAMES,
} from '@webpricer/shared';
import { type FormEvent, useState } from 'react';
import { isApiError } from '../../api/client.ts';
import { useSaveSettings } from '../../api/queries.ts';
import { Button } from '../../components/button.tsx';
import { TextInput } from '../../components/input.tsx';
import { Select, type SelectOption } from '../../components/select.tsx';
import { TimePicker } from '../../components/time-picker.tsx';
import { cx, Field, Notice } from '../../components/ui.tsx';
import { formatDateTime } from '../../lib/format.ts';

const FREQUENCY_OPTIONS: SelectOption<ImportFrequency>[] = [
  { value: 'daily', label: 'Ежедневно' },
  { value: 'weekly', label: 'Еженедельно' },
  { value: 'monthly', label: 'Ежемесячно' },
];

const WEEKDAY_OPTIONS: SelectOption<string>[] = WEEKDAY_NAMES.map((name, index) => ({
  value: String(index + 1),
  label: name,
}));

const MONTH_DAY_OPTIONS: SelectOption<string>[] = Array.from({ length: 31 }, (_, index) => ({
  value: String(index + 1),
  label: String(index + 1),
}));

interface FormState {
  davUrl: string;
  davUsername: string;
  davPassword: string;
  frequency: ImportFrequency;
  weekday: string;
  monthDay: string;
  time: string;
}

function initialState(settings: ImportSettings | null): FormState {
  return {
    davUrl: settings?.davUrl ?? '',
    davUsername: settings?.davUsername ?? '',
    davPassword: settings?.davPassword ?? '',
    frequency: settings?.frequency ?? 'weekly',
    weekday: settings?.frequency === 'weekly' ? String(settings.day ?? 1) : '1',
    monthDay: settings?.frequency === 'monthly' ? String(settings.day ?? 1) : '1',
    time: settings?.time ?? '09:00',
  };
}

export function ImportSettingsForm({ data }: { data: SettingsResponse }) {
  const [form, setForm] = useState(() => initialState(data.settings));
  const [saved, setSaved] = useState(false);
  const save = useSaveSettings();
  const fields = isApiError(save.error, 422) ? save.error.fields : {};
  const passwordSet = data.settings?.davPasswordSet ?? false;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const day =
      form.frequency === 'weekly'
        ? Number(form.weekday)
        : form.frequency === 'monthly'
          ? Number(form.monthDay)
          : null;
    save.mutate(
      {
        davUrl: form.davUrl,
        davUsername: form.davUsername,
        davPassword: form.davPassword,
        frequency: form.frequency,
        day,
        time: form.time,
      },
      {
        onSuccess: () => setSaved(true),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="URL файла" error={fields.davUrl}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            type="url"
            inputMode="url"
            value={form.davUrl}
            onChange={(event) => set('davUrl', event.target.value)}
            placeholder="https://cloud.example.com/remote.php/dav/files/…/Pricer.xlsm"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            spellCheck={false}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Логин" error={fields.davUsername}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              value={form.davUsername}
              onChange={(event) => set('davUsername', event.target.value)}
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        <Field
          label="Пароль"
          error={fields.davPassword}
          hint={
            passwordSet && !data.settings?.davPassword
              ? 'Сохранённый пароль не удалось прочитать — введите его заново'
              : undefined
          }
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="text"
              value={form.davPassword}
              onChange={(event) => set('davPassword', event.target.value)}
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              spellCheck={false}
            />
          )}
        </Field>
      </div>

      {/* Ежедневно дня нет — два оставшихся поля делят строку пополам. */}
      <div
        className={cx(
          'grid gap-4',
          form.frequency === 'daily' ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
        )}
      >
        <Field label="Частота" error={fields.frequency}>
          {({ id, describedBy }) => (
            <Select
              id={id}
              value={form.frequency}
              options={FREQUENCY_OPTIONS}
              onChange={(value) => set('frequency', value)}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        {form.frequency === 'weekly' && (
          <Field label="День недели" error={fields.day}>
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                value={form.weekday}
                options={WEEKDAY_OPTIONS}
                onChange={(value) => set('weekday', value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
            )}
          </Field>
        )}
        {form.frequency === 'monthly' && (
          <Field label="Число месяца" error={fields.day}>
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                value={form.monthDay}
                options={MONTH_DAY_OPTIONS}
                columns={7}
                onChange={(value) => set('monthDay', value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="tabular"
              />
            )}
          </Field>
        )}

        <Field label="Время запуска (по МСК)" error={fields.time}>
          {({ id, describedBy, invalid }) => (
            <TimePicker
              id={id}
              value={form.time}
              onChange={(value) => set('time', value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? 'Сохранение…' : 'Сохранить'}
        </Button>
        {saved && data.nextRunAt && (
          <Notice tone="success">
            Настройки сохранены. Следующий импорт — {formatDateTime(data.nextRunAt)}.
          </Notice>
        )}
        {save.isError && !isApiError(save.error, 422) && (
          <Notice tone="error">{save.error.message}</Notice>
        )}
      </div>
    </form>
  );
}
