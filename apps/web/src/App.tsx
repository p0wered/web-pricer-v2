import { healthResponseSchema } from '@webpricer/shared';
import { useEffect, useState } from 'react';

type ApiState = 'loading' | 'ok' | 'error';

// Временная страница каркаса (этап 0): проверяет связку фронт → API.
export function App() {
  const [apiState, setApiState] = useState<ApiState>('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((response) => response.json())
      .then((body: unknown) => {
        healthResponseSchema.parse(body);
        setApiState('ok');
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiState('error');
      });
    return () => controller.abort();
  }, []);

  const statusText = {
    loading: 'проверка…',
    ok: 'доступен',
    error: 'недоступен',
  }[apiState];

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-800">
      <div className="rounded-lg bg-white px-8 py-6 shadow-sm">
        <h1 className="text-2xl font-semibold">WebPricer</h1>
        <p className="mt-2 text-sm text-slate-500">
          API: <span className={apiState === 'error' ? 'text-red-600' : ''}>{statusText}</span>
        </p>
      </div>
    </main>
  );
}
