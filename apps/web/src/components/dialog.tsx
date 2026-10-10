import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { buttonClasses } from './button.tsx';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Модальное окно на нативном <dialog>: фокус внутри окна, Esc и клик по затемнению закрывают,
 * страница под ним недоступна. Окно — карточка как блоки интерфейса, содержимое прокручивается.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Окно остаётся в DOM — при каждом открытии содержимое снова с начала.
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // Клик мимо карточки попадает в сам <dialog> (его затемнение) — закрываем.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="dialog m-auto max-h-[min(760px,calc(100%-32px))] w-[min(600px,calc(100%-32px))] flex-col overflow-hidden rounded-2xl bg-surface p-0 text-fg shadow-popover open:flex dark:ring-1 dark:ring-line"
    >
      <div className="flex shrink-0 items-center gap-3 py-3 pr-3 pl-6">
        <h2 id={titleId} className="text-lg font-bold tracking-[-0.01em]">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          title="Закрыть"
          className={buttonClasses({ variant: 'ghost', square: true, className: 'ml-auto' })}
        >
          <X aria-hidden size={17} strokeWidth={1.75} />
        </button>
      </div>
      <div ref={bodyRef} className="min-h-0 overflow-y-auto px-6 pb-6">
        {children}
      </div>
    </dialog>
  );
}
