import type { SearchResponse } from '@webpricer/shared';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CARD, cx } from '../../components/ui.tsx';
import { formatCount } from '../../lib/format.ts';

interface ResultPanelProps {
  title: string;
  query: UseInfiniteQueryResult<InfiniteData<SearchResponse>>;
  active: boolean;
  children: ReactNode;
}

/** Блок таблицы: заголовок со счётчиком, полоса загрузки, сама таблица. */
export function ResultPanel({ title, query, active, children }: ResultPanelProps) {
  const total = query.data?.pages[0]?.total;
  const loading = active && query.isFetching && !query.isFetchingNextPage;
  return (
    <section
      aria-label={title}
      className={cx(CARD, 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden')}
    >
      <div className="relative flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {active && total !== undefined && (
          <span
            className={cx(
              'tabular rounded-full bg-sunken px-2 py-px text-[12px] font-medium text-muted',
              query.isPlaceholderData && 'opacity-50',
            )}
          >
            {formatCount(total)}
          </span>
        )}
        {loading && (
          <div
            aria-hidden
            className="progress-bar absolute inset-x-0 -bottom-px h-0.5 overflow-hidden"
          />
        )}
      </div>
      {children}
    </section>
  );
}
