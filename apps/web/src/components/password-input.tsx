import { forwardRef, type InputHTMLAttributes, type Ref, useId, useRef, useState } from 'react';
import { TextInput } from './input.tsx';
import { cx } from './ui.tsx';

// Контур и зрачок — как у lucide Eye, черта — как у EyeOff.
const EYE_OUTLINE =
  'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0';
const SLASH = 'm2 2 20 20';

const BLINK: Keyframe[] = [
  { transform: 'scaleY(1)' },
  { transform: 'scaleY(0.1)', offset: 0.4 },
  { transform: 'scaleY(1)' },
];

/**
 * Глаз, который перечёркивается: черта прорисовывается по диагонали и маской
 * вырезает под собой зазор в контуре. Анимация — в `.eye-slash` (index.css).
 */
function EyeIcon({ slashed, eyeRef }: { slashed: boolean; eyeRef: Ref<SVGGElement> }) {
  // В id от useId бывают символы, которые ломают url(#…).
  const maskId = `eye-mask-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg
      aria-hidden
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-slashed={slashed}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="white" />
        <path d={SLASH} pathLength={1} stroke="black" strokeWidth={4.75} className="eye-slash" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <g ref={eyeRef} style={{ transformOrigin: '12px 12px' }}>
          <path d={EYE_OUTLINE} />
          <circle cx="12" cy="12" r="3" />
        </g>
      </g>
      <path d={SLASH} pathLength={1} className="eye-slash" />
    </svg>
  );
}

/**
 * Поле пароля с кнопкой «показать/скрыть». Кнопка стоит между полем и подписью Field —
 * `peer-*` работает через `~`, так что плавающая подпись не ломается.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const eyeRef = useRef<SVGGElement>(null);
  const label = visible ? 'Скрыть пароль' : 'Показать пароль';

  const toggle = () => {
    setVisible((v) => !v);
    // Моргание — разовая реакция на нажатие, а не состояние, поэтому через Web Animations.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      eyeRef.current?.animate(BLINK, { duration: 150, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
    }
  };

  return (
    <>
      <TextInput
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cx('pr-11', className)}
        {...props}
      />
      <button
        type="button"
        onClick={toggle}
        // Фокус остаётся в поле: можно переключить и продолжать печатать.
        onMouseDown={(event) => event.preventDefault()}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className={
          'absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-md ' +
          'text-subtle transition-[color,scale] duration-150 hover:text-fg active:scale-90 ' +
          'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none'
        }
      >
        <EyeIcon slashed={visible} eyeRef={eyeRef} />
      </button>
    </>
  );
});
