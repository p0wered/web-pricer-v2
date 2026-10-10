// Справка по поиску (пункт меню «Как искать»): обычный поиск и символы ? _ ^ $.
// Правила — в apps/server/src/search/search-index.ts и docs/customer-feedback-2026-10.md.
import type { ReactNode } from 'react';
import { Dialog } from '../../components/dialog.tsx';

/** Запрос или фрагмент названия моноширинным шрифтом на плашке. */
function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[12.5px] whitespace-nowrap text-fg">
      {children}
    </code>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 mb-2 text-[13px] font-semibold text-subtle">{children}</h3>;
}

interface OperatorProps {
  symbol: string;
  title: string;
  children: ReactNode;
  query: string;
  found: string[];
  notFound: string[];
}

/** Символ поиска: что делает, пример запроса, что найдётся и что нет. */
function Operator({ symbol, title, children, query, found, notFound }: OperatorProps) {
  return (
    <li className="flex gap-3.5 py-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-mono text-lg font-semibold text-accent-text"
      >
        {symbol}
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">
          <span className="sr-only">Символ {symbol}: </span>
          {title}
        </p>
        <p className="mt-0.5 text-muted">{children}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-subtle">Запрос</dt>
          <dd>
            <Code>{query}</Code>
          </dd>
          <dt className="text-subtle">Найдёт</dt>
          <dd>{found.map((name) => `«${name}»`).join(', ')}</dd>
          <dt className="text-subtle">Не найдёт</dt>
          <dd className="text-muted">{notFound.map((name) => `«${name}»`).join(', ')}</dd>
        </dl>
      </div>
    </li>
  );
}

export function SearchHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Справка">
      <p className="text-sm">
        Пишите обозначение и номинал через пробел, например <Code>к50-35 50в 4.7мкф</Code>. Поиск
        найдёт названия, в которых есть каждое слово, в любом порядке.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted marker:text-subtle">
        <li>Большие и маленькие буквы не различаются.</li>
        <li>
          Латиница и кириллица — одно и то же: <Code>KT315</Code> = <Code>КТ315</Code>.
        </li>
        <li>
          Дефисы и пробелы внутри обозначения не важны: <Code>КТ-315</Code> = <Code>КТ 315</Code>.
        </li>
        <li>
          В числах точка и запятая равнозначны: <Code>4,7</Code> = <Code>4.7</Code>.
        </li>
        <li>
          Единицу можно писать слитно или через пробел: <Code>10 кОм</Code> = <Code>10к</Code>.
        </li>
      </ul>

      <SectionTitle>Символы для точного поиска</SectionTitle>
      <ul className="divide-y divide-line">
        <Operator
          symbol="_"
          title="Части по порядку"
          query="С2-33_1_10к"
          found={['С2-33Н 1 Вт 10 кОм', 'С2-33-1-10к']}
          notFound={['С2-33 10кОм 1Вт']}
        >
          Части, разделённые подчёркиванием, должны идти в названии именно в этом порядке, а между
          ними может быть что угодно. Число после подчёркивания ищется целиком: <Code>_1</Code>{' '}
          найдёт «1 Вт» и «1кОм», но не 15, 150 или 0,125.
        </Operator>
        <Operator
          symbol="?"
          title="Один любой символ"
          query="РС?ТВ"
          found={['РС4ТВ', 'РС-7ТВ']}
          notFound={['РСТВ', 'РС45ТВ']}
        >
          Вопросительный знак заменяет ровно одну букву или цифру.
        </Operator>
        <Operator
          symbol="^"
          title="Слово начинается с"
          query="^КНР"
          found={['КНР', 'Микросхема КНР']}
          notFound={['2КНР', '4КНР']}
        >
          Ставится в начале: найдутся только слова, которые начинаются именно так.
        </Operator>
        <Operator
          symbol="$"
          title="Слово заканчивается на"
          query="140УД6$"
          found={['140УД6', 'К140УД6 (81г)']}
          notFound={['140УД601', '140УД608']}
        >
          Ставится в конце: найдутся только слова, которые заканчиваются именно так. После слова в
          названии может идти что угодно — год, «ОТК» и т. п.
        </Operator>
      </ul>
    </Dialog>
  );
}
