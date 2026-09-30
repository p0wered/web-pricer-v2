import { type RefObject, useState } from 'react';
import { cx } from './ui.tsx';

type Placement = 'bottom' | 'top';

/**
 * Состояние выпадающей панели у поля формы. Панель всегда в DOM (скрыта через
 * visibility), поэтому её высоту можно измерить до открытия и развернуть её вверх,
 * если снизу не помещается, а закрытие анимируется так же, как открытие.
 */
export function usePopover(
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>('bottom');

  const show = () => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const height = panelRef.current?.offsetHeight ?? 0;
    if (anchor) {
      const below = window.innerHeight - anchor.bottom;
      setPlacement(below < height + 16 && anchor.top > below ? 'top' : 'bottom');
    }
    setOpen(true);
  };

  return { open, placement, show, hide: () => setOpen(false) };
}

/** Карточка выпадающей панели над содержимым и её появление; положение задаёт вызывающий. */
export function popoverSurface(open: boolean): string {
  return cx(
    'absolute z-30 rounded-xl bg-surface p-1.5 shadow-popover dark:ring-1 dark:ring-line',
    'duration-150 ease-out motion-reduce:transition-none',
    // Видимой панель становится сразу (в первом кадре перехода она ещё hidden, и в неё
    // нельзя перевести фокус), а скрывается — после того, как погаснет.
    open
      ? 'visible scale-100 opacity-100 transition-[opacity,scale]'
      : 'invisible scale-[0.97] opacity-0 transition-[opacity,scale,visibility]',
  );
}

/** Классы панели у поля формы: появляется от края поля. */
export function popoverClasses(open: boolean, placement: Placement, className?: string): string {
  return cx(
    popoverSurface(open),
    'left-0 min-w-full',
    placement === 'top' ? 'bottom-full mb-1.5 origin-bottom' : 'top-full mt-1.5 origin-top',
    className,
  );
}

/** Прокрутить список так, чтобы пункт был виден (или стоял по центру — при открытии). */
export function scrollIntoList(list: HTMLElement, item: HTMLElement, center = false) {
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (center) {
    list.scrollTop = top - (list.clientHeight - item.offsetHeight) / 2;
  } else if (top < list.scrollTop) {
    list.scrollTop = top - 4;
  } else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight + 4;
  }
}
