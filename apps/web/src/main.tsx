import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { isApiError } from './api/client.ts';
import { sessionKey } from './api/queries.ts';
import { router } from './app/router.tsx';
import './index.css';

// Сессия истекла на любом запросе (401) — помечаем «не вошёл», страница уйдёт на вход.
const onError = (error: unknown) => {
  if (isApiError(error, 401)) queryClient.setQueryData(sessionKey, false);
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Не найден элемент #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
