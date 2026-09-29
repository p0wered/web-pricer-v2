import { ArrowLeft, LogOut, Moon, Settings, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLogout } from '../api/queries.ts';
import { useTheme } from '../lib/theme.ts';
import { Button, buttonClasses, CARD, cx } from './ui.tsx';

export function Wordmark() {
  return (
    <span className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
      Web<span className="text-accent-text">Pricer</span>
    </span>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <Button variant="ghost" onClick={toggle} aria-label={label} title={label} className="w-9 px-0">
      <Icon aria-hidden size={18} strokeWidth={1.75} />
    </Button>
  );
}

function LogoutButton() {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
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
  /** Середина блока: строка поиска на странице поиска, заголовок — на остальных. */
  children?: ReactNode;
  page: 'search' | 'settings';
}

/** Верхний блок приложения: название, содержимое страницы, тема и навигация. */
export function AppHeader({ children, page }: AppHeaderProps) {
  return (
    // На узком экране — две строки: название и навигация, под ними содержимое страницы.
    <header
      className={cx(
        CARD,
        'flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2.5 px-3 py-2.5 md:flex-nowrap md:px-4',
      )}
    >
      <Link to="/search" className="shrink-0 rounded-sm" aria-label="WebPricer — к поиску">
        <Wordmark />
      </Link>
      <div className="order-last flex w-full min-w-0 items-center gap-2 md:order-none md:w-auto md:flex-1">
        {children}
      </div>
      <nav className="ml-auto flex shrink-0 items-center gap-1 md:ml-0" aria-label="Приложение">
        <ThemeToggle />
        {page === 'search' ? (
          <Link
            to="/settings"
            className={buttonClasses('ghost')}
            aria-label="Настройки"
            title="Настройки"
          >
            <Settings aria-hidden size={15} strokeWidth={1.75} />
            <span className="hidden lg:inline">Настройки</span>
          </Link>
        ) : (
          <Link
            to="/search"
            className={buttonClasses('ghost')}
            aria-label="К поиску"
            title="К поиску"
          >
            <ArrowLeft aria-hidden size={15} strokeWidth={1.75} />
            <span className="hidden lg:inline">К поиску</span>
          </Link>
        )}
        <LogoutButton />
      </nav>
    </header>
  );
}
