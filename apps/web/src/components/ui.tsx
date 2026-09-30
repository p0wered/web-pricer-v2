import { type ReactNode, useId } from 'react';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

/** Блок интерфейса («бенто»): поиск, таблицы, разделы настроек — на сером фоне страницы. */
export const CARD = 'rounded-2xl bg-surface shadow-card';

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

// Подпись лежит внутри поля: у пустого поля без фокуса — по центру, как placeholder;
// в фокусе или с введённым значением уменьшается и уезжает наверх. Для select и полей
// времени :placeholder-shown не срабатывает, поэтому у них подпись всегда наверху.
const FIELD_LABEL =
  'pointer-events-none absolute top-1.5 left-3 origin-left text-[11px] font-medium text-subtle ' +
  'transition-all duration-150 peer-focus:text-accent peer-aria-[invalid=true]:text-danger ' +
  'peer-[:not(:focus):placeholder-shown]:top-1/2 peer-[:not(:focus):placeholder-shown]:-translate-y-1/2 ' +
  'peer-[:not(:focus):placeholder-shown]:text-sm peer-[:not(:focus):placeholder-shown]:font-normal';

/** Поле формы: подпись внутри контрола, подсказка или ошибка под ним. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        {children({ id, describedBy: note ? noteId : undefined, invalid: Boolean(error) })}
        <label htmlFor={id} className={FIELD_LABEL}>
          {label}
        </label>
      </div>
      {note && (
        <p id={noteId} className={cx('px-3 text-[13px]', error ? 'text-danger' : 'text-subtle')}>
          {note}
        </p>
      )}
    </div>
  );
}

type NoticeTone = 'error' | 'success' | 'info';

const NOTICE_TONES: Record<NoticeTone, string> = {
  error: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  info: 'bg-sunken text-muted',
};

/** Сообщение о результате действия (не модальное). */
export function Notice({
  tone,
  children,
  className,
}: {
  tone: NoticeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-md px-3 py-2 text-[13px]', NOTICE_TONES[tone], className)}
    >
      {children}
    </p>
  );
}

export { cx };
