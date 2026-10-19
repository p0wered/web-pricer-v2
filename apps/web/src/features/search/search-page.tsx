import type { SearchSort } from '@webpricer/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, CalendarCheck, Hash, Languages, Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSearchList } from '../../api/queries.ts';
import { AppHeader } from '../../components/app-header.tsx';
import { currentYear } from '../../lib/format.ts';
import { readStored, writeStored } from '../../lib/storage.ts';
import { detailColumns, stopColumns } from './columns.tsx';
import { ResultPanel } from './result-panel.tsx';
import { ResultTable } from './result-table.tsx';
import { SearchBar } from './search-bar.tsx';
import { SearchOptions } from './search-options.tsx';
import { SplitPanes } from './split-panes.tsx';

const HIGHLIGHT_YEAR_KEY = 'webpricer.highlight-year';
const WHOLE_NUMBERS_KEY = 'webpricer.whole-numbers';
const LAYOUT_KEY = 'webpricer.layout-convert';

/** Переключатель, который запоминается в браузере. */
function useStoredToggle(key: string): [boolean, () => void] {
  const [on, setOn] = useState(() => readStored(key) === 'true');
  const toggle = () => {
    setOn((current) => {
      writeStored(key, String(!current));
      return !current;
    });
  };
  return [on, toggle];
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const [draft, setDraft] = useState(query);
  const [sort, setSort] = useState<SearchSort>('relevance');
  const [highlightYear, toggleHighlightYear] = useStoredToggle(HIGHLIGHT_YEAR_KEY);
  const [wholeNumbers, toggleWholeNumbers] = useStoredToggle(WHOLE_NUMBERS_KEY);
  const [convert, toggleConvert] = useStoredToggle(LAYOUT_KEY);
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

  const special = useSearchList(query, 'special', 'relevance', wholeNumbers);
  const main = useSearchList(query, 'main', sort, wholeNumbers);

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

  const shownYear = highlightYear ? year : null;
  const specialColumns = useMemo(() => stopColumns(shownYear), [shownYear]);
  const mainColumns = useMemo(() => detailColumns(sort, setSort, shownYear), [sort, shownYear]);
  const active = query.length > 0;

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <AppHeader>
        <SearchBar
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          convert={convert}
          options={
            <SearchOptions
              narrowed={wholeNumbers}
              search={[
                {
                  label: 'Раскладка EN→RU',
                  icon: Languages,
                  on: convert,
                  onToggle: toggleConvert,
                  title: 'Переключать набранное с английской раскладки на русскую',
                },
                {
                  label: 'Число целиком',
                  icon: Hash,
                  on: wholeNumbers,
                  onToggle: toggleWholeNumbers,
                  title:
                    'Число не входит в другое: 1 не найдёт 15, 150, 1,5; КТ315 не найдёт КТ3150',
                },
              ]}
              view={[
                {
                  label: `Выделять ${year} год`,
                  icon: CalendarCheck,
                  on: highlightYear,
                  onToggle: toggleHighlightYear,
                  title: `Выделять в таблицах детали ${year} года`,
                },
              ]}
            />
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
                resetKey={`${query}|${wholeNumbers}`}
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
                resetKey={`${query}|${sort}|${wholeNumbers}`}
              />
            </ResultPanel>
          }
        />
      </main>
    </div>
  );
}
