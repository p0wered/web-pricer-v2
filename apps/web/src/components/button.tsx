import type { LucideIcon } from 'lucide-react';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cx } from './ui.tsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
/** `lg` — в хедере: по высоте совпадает со строкой поиска (h-10). */
type ButtonSize = 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium ' +
  'whitespace-nowrap transition-colors duration-150 select-none hover:cursor-pointer disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary:
    'border border-transparent bg-sunken text-fg hover:border-accent/60 hover:text-accent hover:bg-accent/12',
  ghost: 'text-muted hover:bg-sunken hover:text-fg',
};

// Отступы задаются здесь, а не в BUTTON_BASE: px-3 и px-0 в одном className конфликтуют.
const BUTTON_SIZES: Record<ButtonSize, { text: string; square: string }> = {
  md: { text: 'h-9 px-3', square: 'size-9' },
  lg: { text: 'h-10 px-3', square: 'size-10' },
};

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Кнопка только с иконкой. */
  square?: boolean;
  className?: string | undefined;
}

/** Классы кнопки — для ссылок, которые выглядят как кнопки. */
export function buttonClasses({
  variant = 'secondary',
  size = 'md',
  square = false,
  className,
}: ButtonClassOptions = {}): string {
  const sizes = BUTTON_SIZES[size];
  return cx(BUTTON_BASE, square ? sizes.square : sizes.text, BUTTON_VARIANTS[variant], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Нажатое состояние переключателя (EN→RU). */
  pressed?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    pressed,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cx(
        buttonClasses({ variant, size, square: !children }),
        pressed &&
          'border-accent/40 bg-accent-soft text-accent-text hover:border-accent/60 hover:bg-accent-soft',
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden size={15} strokeWidth={1.75} />}
      {children}
    </button>
  );
});
