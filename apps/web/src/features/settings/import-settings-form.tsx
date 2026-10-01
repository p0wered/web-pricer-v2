import {
  type ImportFrequency,
  type ImportSettings,
  type SettingsResponse,
  WEEKDAY_NAMES,
} from '@webpricer/shared';
import { Save } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { isApiError } from '../../api/client.ts';
import { useSaveSettings } from '../../api/queries.ts';
import { TextInput } from '../../components/input.tsx';
import { Select, type SelectOption } from '../../components/select.tsx';
import { TimePicker } from '../../components/time-picker.tsx';
import { cx, Field } from '../../components/ui.tsx';
import { SaveBar } from './save-bar.tsx';
import { SaveStatus, Section } from './section.tsx';

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

type SourceKey = 'davUrl' | 'davUsername' | 'davPassword';
type ScheduleKey = 'frequency' | 'weekday' | 'monthDay' | 'time';

const SOURCE_KEYS: readonly SourceKey[] = ['davUrl', 'davUsername', 'davPassword'];

function dayOf(form: FormState): number | null {
  if (form.frequency === 'weekly') return Number(form.weekday);
  if (form.frequency === 'monthly') return Number(form.monthDay);
  return null;
}

function sameSchedule(a: FormState, b: FormState): boolean {
  return a.frequency === b.frequency && dayOf(a) === dayOf(b) && a.time === b.time;
}

function sourceOf(form: FormState): Pick<FormState, SourceKey> {
  return { davUrl: form.davUrl, davUsername: form.davUsername, davPassword: form.davPassword };
}

function scheduleOf(form: FormState): Pick<FormState, ScheduleKey> {
  return {
    frequency: form.frequency,
    weekday: form.weekday,
    monthDay: form.monthDay,
    time: form.time,
  };
}

const fieldErrors = (error: Error | null) => (isApiError(error, 422) ? error.fields : {});

const saveError = (error: Error | null) =>
  !error ? undefined : isApiError(error, 422) ? 'Проверьте выделенные поля.' : error.message;

type Part = 'source' | 'schedule';

/**
 * Настройки импорта — два раздела, у каждого своя строка «Отменить · Сохранить».
 * Кнопка сохраняет только свой раздел: другой уходит на сервер в сохранённом виде,
 * его несохранённые правки ждут своей кнопки.
 */
export function ImportSettingsForm({ data }: { data: SettingsResponse }) {
  const [form, setForm] = useState(() => initialState(data.settings));
  const saved = useMemo(() => initialState(data.settings), [data.settings]);
  const configured = data.settings !== null;
  const saveSource = useSaveSettings();
  const saveSchedule = useSaveSettings();
  const [sourceSavedAt, setSourceSavedAt] = useState<number | null>(null);
  const [scheduleSavedAt, setScheduleSavedAt] = useState<number | null>(null);

  const fields = { ...fieldErrors(saveSchedule.error), ...fieldErrors(saveSource.error) };
  const passwordSet = data.settings?.davPasswordSet ?? false;
  const sourceDirty = SOURCE_KEYS.some((key) => form[key] !== saved[key]);
  const scheduleDirty = !sameSchedule(form, saved);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = (part: Part) => (event: FormEvent) => {
    event.preventDefault();
    const mutation = part === 'source' ? saveSource : saveSchedule;
    // Кнопка не блокируется во время сохранения — повторное нажатие просто игнорируем.
    if (mutation.isPending) return;
    // Пока настроек нет совсем, расписание без источника не сохранить — уходит вся форма.
    const withSource = part === 'source' || !configured;
    const withSchedule = part === 'schedule' || !configured;
    const source = withSource ? form : saved;
    const schedule = withSchedule ? form : saved;
    mutation.mutate(
      {
        ...sourceOf(source),
        frequency: schedule.frequency,
        day: dayOf(schedule),
        time: schedule.time,
      },
      {
        onSuccess: (response) => {
          // Сервер обрезает пробелы — сохранённые поля должны совпасть с ответом.
          const next = initialState(response.settings);
          setForm((current) => ({
            ...current,
            ...(withSource ? sourceOf(next) : {}),
            ...(withSchedule ? scheduleOf(next) : {}),
          }));
          if (withSource) setSourceSavedAt(Date.now());
          if (withSchedule) setScheduleSavedAt(Date.now());
        },
      },
    );
  };

  const resetSource = () => {
    saveSource.reset();
    setForm((current) => ({ ...current, ...sourceOf(saved) }));
  };

  const resetSchedule = () => {
    saveSchedule.reset();
    setForm((current) => ({ ...current, ...scheduleOf(saved) }));
  };

  return (
    <>
      <form onSubmit={save('source')} noValidate>
        <Section
          title="Источник файла"
          description="Откуда скачивать файл прайсера"
          aside={<SaveStatus savedAt={sourceSavedAt} pending={saveSource.isPending} />}
          bar={
            <SaveBar
              open={sourceDirty}
              error={saveError(saveSource.error)}
              submitLabel="Сохранить"
              icon={Save}
              onReset={resetSource}
            />
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="URL файла" error={fields.davUrl}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  type="url"
                  inputMode="url"
                  value={form.davUrl}
                  onChange={(event) => set('davUrl', event.target.value)}
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
          </div>
        </Section>
      </form>

      <form onSubmit={save('schedule')} noValidate>
        <Section
          title="Расписание"
          description="Настройка автоматического обновления файла"
          aside={<SaveStatus savedAt={scheduleSavedAt} pending={saveSchedule.isPending} />}
          bar={
            <SaveBar
              open={scheduleDirty}
              error={saveError(saveSchedule.error)}
              submitLabel="Сохранить"
              icon={Save}
              onReset={resetSchedule}
            />
          }
        >
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
        </Section>
      </form>
    </>
  );
}
