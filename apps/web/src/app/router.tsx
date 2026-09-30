import { Loader2 } from 'lucide-react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../api/queries.ts';
import { Button } from '../components/button.tsx';
import { Notice } from '../components/ui.tsx';
import { LoginPage } from '../features/auth/login-page.tsx';
import { SearchPage } from '../features/search/search-page.tsx';
import { SettingsPage } from '../features/settings/settings-page.tsx';

/** Страницы только для вошедших: иначе — на вход, с возвратом туда, куда шли. */
function RequireSession() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-subtle" aria-busy>
        <Loader2 aria-label="Загрузка" size={20} className="animate-spin" />
      </div>
    );
  }
  if (session.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
        <Notice tone="error">{session.error.message}</Notice>
        <Button onClick={() => void session.refetch()}>Повторить</Button>
      </div>
    );
  }
  if (!session.data) {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireSession />,
    children: [
      { path: '/search', element: <SearchPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/search" replace /> },
]);
