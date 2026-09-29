// Запросы к API через TanStack Query: кэш, повторы, отмена устаревших запросов.
import {
  importRunSchema,
  SEARCH_PAGE_SIZE,
  type SearchList,
  searchResponseSchema,
  type SearchSort,
  type SettingsUpdateInput,
  settingsResponseSchema,
  startImportResponseSchema,
  type ChangePasswordRequest,
} from '@webpricer/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError, apiRequest, isApiError } from './client.ts';

export const sessionKey = ['session'] as const;

/** Вошёл ли пользователь: `true` / `false`. */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async ({ signal }) => {
      try {
        await apiRequest('/auth/me', { signal });
        return true;
      } catch (error) {
        if (isApiError(error, 401)) return false;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      apiRequest('/auth/login', { method: 'POST', body: { password } }),
    onSuccess: () => client.setQueryData(sessionKey, true),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      client.clear();
      client.setQueryData(sessionKey, false);
    },
  });
}

/** Одна таблица выдачи; порции подгружаются при прокрутке. */
export function useSearchList(query: string, list: SearchList, sort: SearchSort) {
  return useInfiniteQuery({
    queryKey: ['search', query, list, sort],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        q: query,
        list,
        sort,
        offset: String(pageParam),
        limit: String(SEARCH_PAGE_SIZE),
      });
      return apiRequest(`/search?${params}`, { signal, schema: searchResponseSchema });
    },
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return next < last.total ? next : undefined;
    },
    enabled: query.length > 0,
    // Пока загружается новая выдача, старая остаётся на экране (без мигания пустоты).
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    // 503 — индекс ещё загружается после старта сервера: повторяем, пока не будет готов.
    retry: (count, error) => isApiError(error, 503) && count < 20,
    retryDelay: 1500,
  });
}

export const settingsKey = ['settings'] as const;

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => apiRequest('/settings', { signal, schema: settingsResponseSchema }),
  });
}

export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (update: SettingsUpdateInput) =>
      apiRequest('/settings', { method: 'PUT', body: update, schema: settingsResponseSchema }),
    onSuccess: (data) => client.setQueryData(settingsKey, data),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (request: ChangePasswordRequest) =>
      apiRequest('/settings/password', { method: 'POST', body: request }),
  });
}

/** Запуск ручного импорта. Если импорт уже идёт — возвращает номер идущего. */
export function useStartImport() {
  return useMutation({
    mutationFn: async () => {
      try {
        const { runId } = await apiRequest('/import', {
          method: 'POST',
          schema: startImportResponseSchema,
        });
        return { runId, alreadyRunning: false };
      } catch (error) {
        const runId =
          (error instanceof ApiError && (error.body as { runId?: unknown })?.runId) || null;
        if (isApiError(error, 409) && typeof runId === 'number') {
          return { runId, alreadyRunning: true };
        }
        throw error;
      }
    },
  });
}

/** Статус запуска импорта; опрашивается, пока импорт идёт. */
export function useImportRun(runId: number | null) {
  return useQuery({
    queryKey: ['import-run', runId],
    queryFn: ({ signal }) => apiRequest(`/import/${runId}`, { signal, schema: importRunSchema }),
    enabled: runId !== null,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1000 : false),
  });
}
