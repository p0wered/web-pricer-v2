import type { SearchSort } from '@webpricer/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSearchList } from '../../api/queries.ts';
import { AppHeader } from '../../components/app-header.tsx';
import { detailColumns, stopColumns } from './columns.tsx';
import { ResultPanel } from './result-panel.tsx';
import { ResultTable } from './result-table.tsx';
import { SearchBar } from './search-bar.tsx';
import { SplitPanes } from './split-panes.tsx';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const [draft, setDraft] = useState(query);
  const [priceSort, setPriceSort] = useState<SearchSort>('relevance');
  const queryClient = useQueryClient();

  // Запрос из адреса (переход «назад», открытая ссылка) попадает в поле, сортировка сбрасывается
  // (как в старой версии). Состояние подстраивается при рендере, без эффекта.
  const [shownQuery, setShownQuery] = useState(query);
  if (shownQuery !== query) {
    setShownQuery(query);
    setDraft(query);
    setPriceSort('relevance');
  }

  useEffect(() => {
    document.title = query ? `${query} — WebPricer` : 'Поиск — WebPricer';
  }, [query]);

  const special = useSearchList(query, 'special', 'relevance');
  const main = useSearchList(query, 'main', priceSort);

  const submit = () => {
    const next = draft.trim();
    if (next === query) {
      // Повторный Enter по тому же запросу — обновить выдачу (как «Поиск» в старой версии).
      setPriceSort('relevance');
      void queryClient.invalidateQueries({ queryKey: ['search', query] });
      return;
    }
    setParams(next ? { q: next } : {});
  };

  const mainColumns = useMemo(() => detailColumns(priceSort, setPriceSort), [priceSort]);
  const active = query.length > 0;

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <AppHeader page="search">
        <SearchBar value={draft} onChange={setDraft} onSubmit={submit} />
      </AppHeader>
      <main className="flex min-h-0 flex-1 flex-col">
        <SplitPanes
          left={
            <ResultPanel title="Стоп-лист" query={special} active={active}>
              <ResultTable
                label="Стоп-лист"
                columns={stopColumns}
                query={special}
                idle={!active}
                idleText="Нет данных для отображения"
                emptyText="В стоп-листе ничего не найдено"
                resetKey={query}
              />
            </ResultPanel>
          }
          right={
            <ResultPanel title="Детали" query={main} active={active}>
              <ResultTable
                label="Детали"
                columns={mainColumns}
                query={main}
                idle={!active}
                idleText="Нет данных для отображения"
                emptyText="Ничего не найдено. Попробуйте сократить запрос или проверить раскладку."
                resetKey={`${query}|${priceSort}`}
              />
            </ResultPanel>
          }
        />
      </main>
    </div>
  );
}
