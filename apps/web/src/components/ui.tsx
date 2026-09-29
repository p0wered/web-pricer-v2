import type { LucideIcon } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useId,
} from 'react';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

/** Блок интерфейса («бенто»): поиск, таблицы, разделы настроек — на сером фоне страницы. */
export const CARD = 'rounded-xl border border-line bg-surface shadow-card';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_BASE =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium ' +
  'whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-fg hover:border-line-strong hover:bg-sunken',
  ghost: 'text-muted hover:bg-sunken hover:text-fg',
};

/** Классы кнопки — для ссылок, которые выглядят как кнопки. */
export function buttonClasses(variant: ButtonVariant = 'secondary', className?: string): string {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  /** Нажатое состояние переключателя (EN→RU). */
  pressed?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', icon: Icon, pressed, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        pressed &&
          'border-accent/40 bg-accent-soft text-accent-text hover:border-accent/60 hover:bg-accent-soft',
        !children && 'w-9 px-0',
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden size={15} strokeWidth={1.75} />}
      {children}
    </button>
  );
});

const FIELD_INPUT =
  'h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg transition-colors duration-150 ' +
  'hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 disabled:opacity-60';

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Поле формы: подпись над контролом, подсказка или ошибка под ним. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      {children({ id, describedBy: note ? noteId : undefined, invalid: Boolean(error) })}
      {note && (
        <p id={noteId} className={cx('text-[13px]', error ? 'text-danger' : 'text-subtle')}>
          {note}
        </p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={cx(FIELD_INPUT, className)} {...props} />;
  },
);

export function SelectInput({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(FIELD_INPUT, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
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
