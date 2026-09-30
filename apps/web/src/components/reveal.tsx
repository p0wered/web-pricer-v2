import { forwardRef, type ReactNode } from 'react';
import { cx } from './ui.tsx';

const MOTION = 'duration-250 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none';

interface RevealProps {
  open: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Плавно раскрывает содержимое по высоте (строка сетки 0fr → 1fr), раздвигая контент ниже,
 * и так же сворачивает. Свёрнутое остаётся в разметке, но inert — недоступно с клавиатуры
 * и для чтения с экрана.
 */
export const Reveal = forwardRef<HTMLDivElement, RevealProps>(function Reveal(
  { open, className, children },
  ref,
) {
  return (
    <div
      ref={ref}
      inert={!open}
      className={cx(
        'grid transition-[grid-template-rows]',
        MOTION,
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cx(
            'transition-[opacity,translate]',
            MOTION,
            open ? 'translate-y-0 opacity-100' : '-translate-y-1.5 opacity-0',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
});
