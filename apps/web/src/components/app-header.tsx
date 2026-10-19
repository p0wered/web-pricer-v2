import { CircleHelp, LogOut, Moon, Palette, Settings } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLogout } from '../api/queries.ts';
import { SearchHelp } from '../features/search/search-help.tsx';
import { useRowColors } from '../lib/row-colors.ts';
import { useTheme } from '../lib/theme.ts';
import { buttonClasses } from './button.tsx';
import {
  DropdownMenu,
  focusItem,
  MENU_ICON,
  MENU_ITEM,
  MENU_TRIGGER_OPEN,
  MenuSeparator,
  MenuToggle,
} from './menu.tsx';
import { CARD, cx } from './ui.tsx';

/**
 * Меню приложения: настройки, справка по поиску, тема, цветные строки, выход. Панель — под
 * правым краем ближайшего `relative`-предка (всей шапки).
 */
export function AppMenu({
  settings,
  search = false,
  variant = 'secondary',
}: {
  settings: boolean;
  /** Страница поиска: справка по поиску и переключатель цветных строк таблиц. */
  search?: boolean;
  /** `ghost` — без фона в покое (страница настроек); по умолчанию — как кнопки в хедере поиска. */
  variant?: 'secondary' | 'ghost';
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { theme, toggle } = useTheme();
  const rowColors = useRowColors();
  const [helpOpen, setHelpOpen] = useState(false);
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <>
      <DropdownMenu
        label="Меню"
        triggerRef={triggerRef}
        // Бургер — сама иконка (полоски цвета текста): у ghost акцентом окрашивается цвет кнопки.
        triggerClassName={buttonClasses({
          variant,
          size: 'lg',
          square: true,
          className: cx('relative', MENU_TRIGGER_OPEN, variant === 'ghost' && 'hover:text-accent'),
        })}
        trigger={
          <>
            <span aria-hidden className="burger-bar" />
            <span aria-hidden className="burger-bar" />
            <span aria-hidden className="burger-bar" />
          </>
        }
        panelClassName="right-0 w-56 origin-top-right"
      >
        {(hide) => (
          <>
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
            {search && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={MENU_ITEM}
                onPointerMove={focusItem}
                onClick={() => {
                  hide();
                  setHelpOpen(true);
                }}
              >
                <CircleHelp aria-hidden size={15} strokeWidth={1.75} className={MENU_ICON} />
                Справка
              </button>
            )}
            {(settings || search) && <MenuSeparator />}
            <MenuToggle label="Тёмная тема" icon={Moon} on={theme === 'dark'} onToggle={toggle} />
            {search && (
              <MenuToggle
                label="Цветные строки"
                icon={Palette}
                on={rowColors.enabled}
                onToggle={rowColors.toggle}
              />
            )}
            <MenuSeparator />
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
                logout.mutate(undefined, {
                  onSettled: () => navigate('/login', { replace: true }),
                });
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
          </>
        )}
      </DropdownMenu>

      {search && (
        <SearchHelp
          open={helpOpen}
          onClose={() => {
            setHelpOpen(false);
            // Пункт меню, с которого открыли справку, скрыт — фокус возвращается на кнопку меню.
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
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
        <AppMenu settings search />
      </nav>
    </header>
  );
}
