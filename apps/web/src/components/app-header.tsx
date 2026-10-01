import { LogOut, Moon, Settings, Sun } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate } from 'react-router';
import { useLogout } from '../api/queries.ts';
import { useTheme } from '../lib/theme.ts';
import { Button, buttonClasses } from './button.tsx';
import { popoverSurface } from './popover.tsx';
import { focusOnClick } from './select.tsx';
import { CARD, cx } from './ui.tsx';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <Button
      variant="secondary"
      size="lg"
      icon={Icon}
      onClick={toggle}
      aria-label={label}
      title={label}
    />
  );
}

const MENU_ITEM =
  'group flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-fg ' +
  'transition-colors duration-100 outline-none hover:bg-row-hover focus-visible:bg-row-hover';

/** Иконка пункта: при наведении или фокусе с клавиатуры — цвета акцента. */
const MENU_ICON =
  'text-subtle transition-colors duration-100 group-hover:text-accent group-focus-visible:text-accent';

const menuItems = (menu: HTMLElement) => [
  ...menu.querySelectorAll<HTMLElement>('[role="menuitem"],[role="menuitemcheckbox"]'),
];

/**
 * Меню приложения (шаблон WAI-ARIA «menu button»): настройки, тема, выход.
 * Панель позиционируется от ближайшего `relative`-предка — под его правым краем.
 */
export function AppMenu({
  settings,
  variant = 'secondary',
}: {
  settings: boolean;
  /** `ghost` — без фона в покое (страница настроек); по умолчанию — как кнопки в хедере поиска. */
  variant?: 'secondary' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Какой пункт получит фокус, когда панель откроется.
  const focusOnOpen = useRef<'first' | 'last'>('first');
  const { theme, toggle } = useTheme();
  const logout = useLogout();
  const navigate = useNavigate();
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
  }, [open]);

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
        aria-label="Меню"
        title="Меню"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(event) => {
          focusOnClick(event);
          if (open) hide();
          else show('first');
        }}
        onKeyDown={onTriggerKeyDown}
        // Бургер — сама иконка (полоски цвета текста): у ghost акцентом окрашивается цвет кнопки.
        className={buttonClasses({
          variant,
          size: 'lg',
          square: true,
          className: cx(
            'relative aria-expanded:border-accent/60 aria-expanded:bg-accent/12 aria-expanded:text-accent',
            variant === 'ghost' && 'hover:text-accent',
          ),
        })}
      >
        <span aria-hidden className="burger-bar" />
        <span aria-hidden className="burger-bar" />
        <span aria-hidden className="burger-bar" />
      </button>

      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-label="Меню"
        inert={!open}
        onKeyDown={onMenuKeyDown}
        className={cx(popoverSurface(open), 'top-full right-0 mt-1.5 w-56 origin-top-right')}
      >
        {settings && (
          <Link
            to="/settings"
            role="menuitem"
            tabIndex={-1}
            className={MENU_ITEM}
            onPointerMove={focusItem}
          >
            <Settings aria-hidden size={15} strokeWidth={1.75} className={MENU_ICON} />
            Настройки
          </Link>
        )}
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={theme === 'dark'}
          tabIndex={-1}
          className={MENU_ITEM}
          onPointerMove={focusItem}
          // Меню остаётся открытым: новую тему видно сразу, её можно вернуть обратно.
          onClick={toggle}
        >
          <Moon aria-hidden size={15} strokeWidth={1.75} className={MENU_ICON} />
          Тёмная тема
          <span
            aria-hidden
            data-theme-animate
            className={cx(
              'ml-auto flex h-4 w-7 items-center rounded-full p-0.5 transition-colors duration-200 motion-reduce:transition-none',
              theme === 'dark' ? 'bg-accent' : 'bg-line-strong',
            )}
          >
            <span
              data-theme-animate
              className={cx(
                'size-3 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none',
                theme === 'dark' && 'translate-x-3',
              )}
            />
          </span>
        </button>
        <div role="separator" className="mx-1 my-1 h-px bg-line" />
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={logout.isPending}
          className={cx(
            MENU_ITEM,
            'hover:bg-danger-soft hover:text-danger focus-visible:bg-danger-soft focus-visible:text-danger disabled:opacity-50',
          )}
          onPointerMove={focusItem}
          onClick={() => {
            hide();
            logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) });
          }}
        >
          <LogOut
            aria-hidden
            size={15}
            strokeWidth={1.75}
            className="text-subtle transition-colors duration-100 group-hover:text-danger group-focus-visible:text-danger"
          />
          Выйти
        </button>
      </div>
    </>
  );
}

/** Пункт под мышью получает фокус, чтобы стрелки продолжали с него. */
function focusItem(event: PointerEvent<HTMLElement>) {
  if (document.activeElement !== event.currentTarget) event.currentTarget.focus();
}

/**
 * Верхний блок страницы поиска: строка поиска и меню. Все элементы строки — высотой h-10.
 */
export function AppHeader({ children }: { children: ReactNode }) {
  return (
    <header
      className={cx(
        CARD,
        'relative flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 p-2 md:flex-nowrap',
      )}
    >
      {/* Строка поиска на узком экране уходит отдельной строкой под навигацию. */}
      <div className="order-last flex min-w-0 basis-full items-center md:order-none md:flex-1 md:basis-auto">
        {children}
      </div>
      <nav className="ml-auto flex shrink-0 items-center" aria-label="Приложение">
        <AppMenu settings />
      </nav>
    </header>
  );
}
