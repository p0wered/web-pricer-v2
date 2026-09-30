import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cx } from './ui.tsx';

// `peer` — для плавающей подписи в Field: она стоит в разметке сразу после поля.
// Подсказка-placeholder видна только в фокусе, иначе она накладывается на подпись.
const FIELD_INPUT =
  'peer h-12 w-full rounded-lg border border-transparent bg-sunken px-3 pt-4 text-sm text-fg transition duration-150 ' +
  'placeholder:text-transparent focus:placeholder:text-subtle ' +
  'focus:border-accent focus:bg-surface focus:outline-none focus:ring-0 ' +
  'aria-[invalid=true]:border-danger disabled:opacity-60';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  // Непустой placeholder нужен, чтобы по :placeholder-shown понять, что поле пустое.
  function TextInput({ className, placeholder = ' ', ...props }, ref) {
    return (
      <input
        ref={ref}
        placeholder={placeholder}
        className={cx(FIELD_INPUT, className)}
        {...props}
      />
    );
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
