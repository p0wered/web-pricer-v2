import type { SearchSort } from '@webpricer/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSearchList } from '../../api/queries.ts';
import { AppHeader } from '../../components/app-header.tsx';
import { Button } from '../../components/button.tsx';
import { currentYear } from '../../lib/format.ts';
import { readStored, writeStored } from '../../lib/storage.ts';
import { detailColumns, stopColumns } from './columns.tsx';
import { ResultPanel } from './result-panel.tsx';
import { ResultTable } from './result-table.tsx';
import { SearchBar } from './search-bar.tsx';
import { SplitPanes } from './split-panes.tsx';

const HIGHLIGHT_YEAR_KEY = 'webpricer.highlight-year';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const [draft, setDraft] = useState(query);
  const [sort, setSort] = useState<SearchSort>('relevance');
  const [highlightYear, setHighlightYear] = useState(
    () => readStored(HIGHLIGHT_YEAR_KEY) === 'true',
  );
  // Год берётся при открытии страницы: в новом году подсветка переключится сама.
  const [year] = useState(() => currentYear());
  const queryClient = useQueryClient();

  // Запрос из адреса (переход «назад», открытая ссылка) попадает в поле, сортировка сбрасывается
  // (как в старой версии). Состояние подстраивается при рендере, без эффекта.
  const [shownQuery, setShownQuery] = useState(query);
  if (shownQuery !== query) {
    setShownQuery(query);
    setDraft(query);
    setSort('relevance');
  }

  useEffect(() => {
    document.title = query ? `${query} — WebPricer` : 'Поиск — WebPricer';
  }, [query]);

  const special = useSearchList(query, 'special', 'relevance');
  const main = useSearchList(query, 'main', sort);

  const submit = () => {
    const next = draft.trim();
    if (next === query) {
      // Повторный Enter по тому же запросу — обновить выдачу (как «Поиск» в старой версии).
      setSort('relevance');
      void queryClient.invalidateQueries({ queryKey: ['search', query] });
      return;
    }
    setParams(next ? { q: next } : {});
  };

  const toggleHighlightYear = () => {
    setHighlightYear((current) => {
      writeStored(HIGHLIGHT_YEAR_KEY, String(!current));
      return !current;
    });
  };

  const shownYear = highlightYear ? year : null;
  const specialColumns = useMemo(() => stopColumns(shownYear), [shownYear]);
  const mainColumns = useMemo(() => detailColumns(sort, setSort, shownYear), [sort, shownYear]);
  const active = query.length > 0;

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <AppHeader>
        <SearchBar
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          actions={
            <Button
              size="lg"
              pressed={highlightYear}
              onClick={toggleHighlightYear}
              className="text-xs"
              title={
                highlightYear
                  ? `Не выделять детали ${year} года`
                  : `Выделить в таблицах детали ${year} года`
              }
            >
              {year}
            </Button>
          }
        />
      </AppHeader>
      <main className="flex min-h-0 flex-1 flex-col">
        <SplitPanes
          left={
            <ResultPanel
              title="Стоп-лист"
              icon={Ban}
              iconClassName="text-stop-fg"
              query={special}
              active={active}
            >
              <ResultTable
                label="Стоп-лист"
                columns={specialColumns}
                query={special}
                idle={!active}
                idleText="Нет данных для отображения"
                emptyText="В стоп-листе ничего не найдено"
                resetKey={query}
              />
            </ResultPanel>
          }
          right={
            <ResultPanel
              title="Детали"
              icon={Package}
              iconClassName="text-accent"
              query={main}
              active={active}
            >
              <ResultTable
                label="Детали"
                columns={mainColumns}
                query={main}
                idle={!active}
                idleText="Нет данных для отображения"
                emptyText="Ничего не найдено. Попробуйте сократить запрос или проверить раскладку."
                resetKey={`${query}|${sort}`}
              />
            </ResultPanel>
          }
        />
      </main>
    </div>
  );
}
