import type { SearchResponse } from '@webpricer/shared';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { CARD, cx } from '../../components/ui.tsx';
import { formatCount } from '../../lib/format.ts';

interface ResultPanelProps {
  title: string;
  icon: LucideIcon;
  /** Цвет иконки: красный у стоп-листа, акцентный у деталей. */
  iconClassName: string;
  query: UseInfiniteQueryResult<InfiniteData<SearchResponse>>;
  active: boolean;
  children: ReactNode;
}

/**
 * Блок таблицы: заголовок с иконкой, счётчик у правого края, под ними таблица прямо в карточке, без
 * вложенной рамки. Полоса загрузки идёт по нижнему краю заголовка.
 */
export function ResultPanel({
  title,
  icon: Icon,
  iconClassName,
  query,
  active,
  children,
}: ResultPanelProps) {
  const total = query.data?.pages[0]?.total;
  const loading = active && query.isFetching && !query.isFetchingNextPage;
  return (
    <section aria-label={title} className={cx(CARD, 'flex h-full min-h-0 min-w-0 flex-col p-2')}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
        {/* Отступ как у ячеек: заголовок стоит в одну линию с колонками. */}
        <div className="relative flex h-11 shrink-0 items-center gap-2 px-2.5">
          <h2 className="flex items-center gap-2 text-base font-bold tracking-[-0.01em] text-fg">
            <Icon aria-hidden size={17} strokeWidth={2} className={cx('shrink-0', iconClassName)} />
            {title}
          </h2>
          {active && total !== undefined && (
            <span
              className={cx(
                'tabular ml-auto rounded-full text-[13px] font-medium text-subtle',
                query.isPlaceholderData && 'opacity-50',
              )}
            >
              {formatCount(total)} шт.
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
      </div>
    </section>
  );
}
