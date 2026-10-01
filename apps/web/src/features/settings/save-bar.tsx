import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '../../components/button.tsx';
import { Reveal } from '../../components/reveal.tsx';
import { CARD, cx } from '../../components/ui.tsx';

interface SaveBarProps {
  /** Есть несохранённые изменения — строка раскрыта. */
  open: boolean;
  error?: string | undefined;
  submitLabel: string;
  icon: LucideIcon;
  onReset: () => void;
}

/**
 * Строка несохранённых изменений под блоком раздела: раскрывается, пока поля отличаются
 * от сохранённого. Кнопки внутри неё — поэтому их радиус не спорит с радиусом блоков.
 * Стоит внутри формы: «Сохранить» — её кнопка отправки.
 */
export function SaveBar({ open, error, submitLabel, icon, onReset }: SaveBarProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Строка свернулась с фокусом внутри (отменили или сохранили) — фокус переходит
  // на раздел, а не теряется вместе со скрытой кнопкой: Tab продолжит с его полей.
  useLayoutEffect(() => {
    const bar = ref.current;
    if (open || !bar?.contains(document.activeElement)) return;
    bar.closest<HTMLElement>('section')?.focus({ preventScroll: true });
  }, [open]);

  return (
    // -mt-2 гасит отступ раздела между блоком и свёрнутой строкой; pt-2 возвращает его раскрытой.
    <Reveal ref={ref} open={open} className="-mt-2">
      <div className="pt-2">
        <div className={cx(CARD, 'flex flex-wrap items-center justify-end gap-2 p-3 pl-4')}>
          <p
            role={error ? 'alert' : 'status'}
            className={cx(
              'min-w-0 flex-1 text-[13px]',
              // На узком экране без ошибки текст только для чтения с экрана — кнопкам нужно место.
              error ? 'text-danger' : 'text-muted max-sm:sr-only',
            )}
          >
            {error ?? 'Есть несохранённые изменения'}
          </p>
          <Button onClick={onReset}>Отменить</Button>
          {/* Кнопка не меняется во время сохранения — ход показывает надпись над блоком. */}
          <Button type="submit" variant="primary" icon={icon}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Reveal>
  );
}
