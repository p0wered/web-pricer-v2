import { Check, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { CARD, cx } from '../../components/ui.tsx';

interface SectionProps {
  title: string;
  /** Пояснение под заголовком, над блоком — мелким серым текстом. */
  description?: ReactNode;
  /** Справа от заголовка — например, состояние сохранения. */
  aside?: ReactNode;
  /** Под блоком — строка несохранённых изменений. */
  bar?: ReactNode;
  children: ReactNode;
}

/** Раздел настроек: заголовок и пояснение над блоком, содержимое в блоке. */
export function Section({ title, description, aside, bar, children }: SectionProps) {
  const id = useId();
  return (
    // tabIndex — чтобы строка сохранения могла вернуть фокус на раздел, когда сворачивается.
    <section aria-labelledby={id} tabIndex={-1} className="flex flex-col gap-2 outline-none">
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 id={id} className="text-sm font-semibold tracking-[-0.01em] text-fg">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-subtle">{description}</p>
          )}
        </div>
        {aside}
      </div>
      <div className={cx(CARD, 'p-4')}>{children}</div>
      {bar}
    </section>
  );
}

const SAVED_VISIBLE_MS = 2500;

interface SaveStatusProps {
  /** Время последнего успешного сохранения — надпись показывается после каждого нового. */
  savedAt: number | null;
  label?: string;
  /** Идёт сохранение — «Сохранение…» вместо «Сохранено». */
  pending?: boolean;
}

/**
 * Состояние сохранения справа от заголовка раздела: «Сохранение…», пока идёт запрос
 * (только если он дольше 150 мс — быстрый не мелькает), потом «Сохранено», которое гаснет.
 */
export function SaveStatus({ savedAt, label = 'Сохранено', pending = false }: SaveStatusProps) {
  // Какое сохранение уже погасло: надпись видна, пока это не текущее.
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);
  const shown = savedAt !== null && hiddenAt !== savedAt;

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setHiddenAt(savedAt), SAVED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  return (
    <p aria-live="polite" className="shrink-0 text-[13px]">
      {pending ? (
        <span className="flex animate-[progress-appear_120ms_ease-out_150ms_both] items-center gap-1 text-subtle motion-reduce:animate-none">
          <Loader2 aria-hidden size={14} strokeWidth={2} className="animate-spin" />
          Сохранение…
        </span>
      ) : (
        <span
          aria-hidden={!shown}
          className={cx(
            'flex items-center gap-1 text-success transition-opacity duration-300 motion-reduce:transition-none',
            shown ? 'opacity-100' : 'opacity-0',
          )}
        >
          <Check aria-hidden size={14} strokeWidth={2.25} />
          {label}
        </span>
      )}
    </p>
  );
}
