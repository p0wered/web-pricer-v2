// Таблица выдачи: закреплённая шапка, виртуализация (в DOM только видимые строки) и
// подгрузка следующих порций при прокрутке.
import type { SearchItem, SearchResponse } from '@webpricer/shared';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { Button } from '../../components/button.tsx';
import { cx } from '../../components/ui.tsx';

export interface Column {
  id: string;
  header: ReactNode;
  /** Минимальная ширина, px, и доля свободного места. */
  min: number;
  grow: number;
  align?: 'start' | 'end';
  cell: (item: SearchItem) => ReactNode;
  /** Полный текст во всплывающей подсказке, если значение обрезано. */
  title?: (item: SearchItem) => string | null | undefined;
  /** Состояние сортировки для aria-sort. */
  sort?: 'ascending' | 'descending' | 'none';
}

interface ResultTableProps {
  label: string;
  columns: Column[];
  query: UseInfiniteQueryResult<InfiniteData<SearchResponse>>;
  /** Запрос ещё не задан — показываем подсказку вместо таблицы. */
  idle: boolean;
  idleText: string;
  emptyText: string;
  /** Смена ключа (запрос, сортировка) возвращает прокрутку в начало. */
  resetKey: string;
}

const ROW_HEIGHT = 32;
const PREFETCH_ROWS = 40;

export function ResultTable({
  label,
  columns,
  query,
  idle,
  idleText,
  emptyText,
  resetKey,
}: ResultTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  // TanStack Virtual не совместим с автоматической мемоизацией React Compiler — это ожидаемо.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const lastIndex = virtualRows.at(-1)?.index ?? 0;

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= items.length - PREFETCH_ROWS) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, lastIndex, items.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  const grid: CSSProperties = {
    gridTemplateColumns: columns
      .map((column) => `minmax(${column.min}px, ${column.grow}fr)`)
      .join(' '),
    minWidth: columns.reduce((sum, column) => sum + column.min, 0),
  };

  let message: ReactNode = null;
  if (idle) message = idleText;
  else if (query.isError && items.length === 0) {
    message = (
      <span className="flex flex-col items-center gap-3">
        <span className="text-danger">{query.error.message}</span>
        <Button onClick={() => void query.refetch()}>Повторить</Button>
      </span>
    );
  } else if (query.isSuccess && items.length === 0 && !query.isPlaceholderData) message = emptyText;

  return (
    <div
      ref={scrollRef}
      role="table"
      aria-label={label}
      aria-rowcount={items.length + 1}
      aria-busy={query.isFetching}
      className={cx(
        'relative min-h-0 flex-1 overflow-auto',
        query.isPlaceholderData && 'opacity-60 transition-opacity',
      )}
    >
      <div
        role="rowgroup"
        className="sticky top-0 z-10 bg-sunken"
        style={{ minWidth: grid.minWidth }}
      >
        <div role="row" aria-rowindex={1} className="grid h-8 items-center" style={grid}>
          {columns.map((column) => (
            <div
              key={column.id}
              role="columnheader"
              aria-sort={column.sort}
              className={cx(
                'truncate px-2.5 text-[12px] font-medium text-subtle',
                column.align === 'end' && 'text-right',
              )}
            >
              {column.header}
            </div>
          ))}
        </div>
      </div>

      {message ? (
        <div className="flex h-[calc(100%-2rem)] min-h-40 items-center justify-center px-6 text-center text-[13px] text-subtle">
          {message}
        </div>
      ) : (
        <div
          role="rowgroup"
          className="relative"
          style={{ height: virtualizer.getTotalSize(), minWidth: grid.minWidth }}
        >
          {virtualRows.map((row) => {
            const item = items[row.index];
            if (!item) return null;
            return (
              <div
                key={item.id}
                role="row"
                aria-rowindex={row.index + 2}
                className={cx(
                  'absolute inset-x-0 top-0 grid items-center text-[13px]',
                  // Линия между строками с отступами по краям — не упирается в рамку блока.
                  row.index < items.length - 1 &&
                    'after:absolute after:inset-x-2.5 after:bottom-0 after:h-px',
                  item.isStop
                    ? 'bg-stop-bg text-stop-fg after:bg-stop-fg/10 hover:bg-stop-bg-hover'
                    : 'text-fg after:bg-line hover:bg-row-hover',
                )}
                style={{ ...grid, height: ROW_HEIGHT, transform: `translateY(${row.start}px)` }}
              >
                {columns.map((column) => (
                  <div
                    key={column.id}
                    role="cell"
                    title={column.title?.(item) ?? undefined}
                    className={cx(
                      'truncate px-2.5',
                      column.align === 'end' && 'tabular text-right',
                    )}
                  >
                    {column.cell(item)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
