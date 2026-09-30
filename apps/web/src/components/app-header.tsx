import { ArrowLeft, LogOut, Moon, Settings, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLogout } from '../api/queries.ts';
import { useTheme } from '../lib/theme.ts';
import { Button, buttonClasses } from './button.tsx';
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

function LogoutButton() {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      size="lg"
      className="hover:text-danger! hover:bg-danger-soft! hover:border-danger/60"
      icon={LogOut}
      disabled={logout.isPending}
      aria-label="Выйти"
      title="Выйти"
      onClick={() =>
        logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })
      }
    >
      <span className="hidden lg:inline">Выйти</span>
    </Button>
  );
}

interface AppHeaderProps {
  /** Строка поиска на странице поиска; заголовок страницы — на остальных (по центру блока). */
  children?: ReactNode;
  page: 'search' | 'settings';
}

/**
 * Верхний блок приложения. Все элементы строки — высотой h-10, как строка поиска,
 * поэтому хедер одинаковой высоты на всех страницах.
 */
export function AppHeader({ children, page }: AppHeaderProps) {
  const search = page === 'search';
  return (
    <header
      className={cx(
        CARD,
        'relative flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 p-2 md:flex-nowrap',
      )}
    >
      {search ? (
        // Строка поиска на узком экране уходит отдельной строкой под навигацию.
        <div className="order-last flex min-w-0 basis-full items-center md:order-none md:flex-1 md:basis-auto">
          {children}
        </div>
      ) : (
        <>
          <Link to="/search" className={buttonClasses({ size: 'lg' })} title="К поиску">
            <ArrowLeft aria-hidden size={15} strokeWidth={1.75} />
            Назад
          </Link>
          {/* По центру всего блока, а не промежутка между кнопками — ширина кнопок разная. */}
          <div className="absolute left-1/2 -translate-x-1/2">{children}</div>
        </>
      )}
      <nav className="ml-auto flex shrink-0 items-center gap-2" aria-label="Приложение">
        <ThemeToggle />
        {search && (
          <Link
            to="/settings"
            className={buttonClasses({ size: 'lg' })}
            aria-label="Настройки"
            title="Настройки"
          >
            <Settings aria-hidden size={15} strokeWidth={1.75} />
            <span className="hidden lg:inline">Настройки</span>
          </Link>
        )}
        <LogoutButton />
      </nav>
    </header>
  );
}
