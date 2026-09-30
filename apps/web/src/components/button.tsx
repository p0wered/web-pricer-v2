import type { LucideIcon } from 'lucide-react';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cx } from './ui.tsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_BASE =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium ' +
  'whitespace-nowrap transition-colors duration-150 select-none hover:cursor-pointer disabled:pointer-events-none disabled:opacity-50';

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
