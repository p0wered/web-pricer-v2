// Выпадающее меню (шаблон WAI-ARIA «menu button») и его пункты. На нём сделаны меню приложения
// и параметры поиска.
import type { LucideIcon } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { popoverSurface } from './popover.tsx';
import { focusOnClick } from './select.tsx';
import { cx } from './ui.tsx';

export const MENU_ITEM =
  'group flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-sm whitespace-nowrap text-fg ' +
  'transition-colors duration-100 outline-none hover:bg-row-hover focus-visible:bg-row-hover';

/** Иконка пункта: при наведении или фокусе с клавиатуры — цвета акцента. */
export const MENU_ICON =
  'text-subtle transition-colors duration-100 group-hover:text-accent group-focus-visible:text-accent';

/** Открытая кнопка меню — в цветах акцента (дополняет классы кнопки). */
export const MENU_TRIGGER_OPEN =
  'aria-expanded:border-accent/60 aria-expanded:bg-accent/12 aria-expanded:text-accent';

const menuItems = (menu: HTMLElement) => [
  ...menu.querySelectorAll<HTMLElement>('[role="menuitem"],[role="menuitemcheckbox"]'),
];

/** Пункт под мышью получает фокус, чтобы стрелки продолжали с него. */
export function focusItem(event: PointerEvent<HTMLElement>) {
  if (document.activeElement !== event.currentTarget) event.currentTarget.focus();
}

export function MenuSeparator() {
  return <div role="separator" className="mx-1 my-1 h-px bg-line" />;
}

/** Переключатель-«тумблер» в пункте меню (тёмная тема, цветные строки). */
function MenuSwitch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      data-theme-animate
      className={cx(
        'ml-auto flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 motion-reduce:transition-none',
        on ? 'bg-accent' : 'bg-line-strong',
      )}
    >
      <span
        data-theme-animate
        className={cx(
          'size-3 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none',
          on && 'translate-x-3',
        )}
      />
    </span>
  );
}

export interface MenuToggleProps {
  label: string;
  icon: LucideIcon;
  on: boolean;
  onToggle: () => void;
  /** Подсказка при наведении: что именно меняет переключатель. */
  title?: string;
}

/** Пункт меню с тумблером. Меню не закрывается: результат виден сразу, его можно вернуть. */
export function MenuToggle({ label, icon: Icon, on, onToggle, title }: MenuToggleProps) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      tabIndex={-1}
      title={title}
      className={MENU_ITEM}
      onPointerMove={focusItem}
      onClick={onToggle}
    >
      <Icon aria-hidden size={15} strokeWidth={1.75} className={MENU_ICON} />
      {label}
      <MenuSwitch on={on} />
    </button>
  );
}

interface DropdownMenuProps {
  /** Имя кнопки и меню для экранного диктора (и подсказка у кнопки, если нет `title`). */
  label: string;
  title?: string;
  triggerClassName: string;
  /** Содержимое кнопки. */
  trigger: ReactNode;
  /** Положение и ширина панели; панель позиционируется от ближайшего `relative`-предка. */
  panelClassName: string;
  /** Нужен, если фокус возвращается на кнопку извне (после окна, открытого из меню). */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** Пункты; `close` закрывает меню (для пунктов, которые что-то открывают или уводят). */
  children: (close: () => void) => ReactNode;
}

export function DropdownMenu({
  label,
  title = label,
  triggerClassName,
  trigger,
  panelClassName,
  triggerRef: externalTriggerRef,
  children,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ownTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = externalTriggerRef ?? ownTriggerRef;
  const menuRef = useRef<HTMLDivElement>(null);
  // Какой пункт получит фокус, когда панель откроется.
  const focusOnOpen = useRef<'first' | 'last'>('first');
  const menuId = useId();

  const show = (focus: 'first' | 'last') => {
    focusOnOpen.current = focus;
    setOpen(true);
  };

  const hide = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    const items = menuItems(menu);
    (focusOnOpen.current === 'first' ? items[0] : items.at(-1))?.focus();

    const onPointerDown = (event: Event) => {
      const target = event.target as Node;
      if (!menu.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, triggerRef]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      show(event.key === 'ArrowDown' ? 'first' : 'last');
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(event.currentTarget);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focus = (to: number) => {
      event.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return focus(index + 1);
      case 'ArrowUp':
        return focus(index - 1);
      case 'Home':
        return focus(0);
      case 'End':
        return focus(items.length - 1);
      case 'Escape':
        event.preventDefault();
        return hide(true);
      case 'Tab':
        // Фокус уходит дальше сам: закрытая панель inert, её пункты Tab пропускает.
        return hide();
      case ' ':
        // Ссылку пробел не нажимает, а пункт меню должен.
        if (event.target instanceof HTMLAnchorElement) {
          event.preventDefault();
          event.target.click();
        }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(event) => {
          focusOnClick(event);
          if (open) hide();
          else show('first');
        }}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {trigger}
      </button>

      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-label={label}
        inert={!open}
        onKeyDown={onMenuKeyDown}
        className={cx(popoverSurface(open), 'top-full mt-1.5', panelClassName)}
      >
        {children(() => setOpen(false))}
      </div>
    </>
  );
}
