import type { SearchItem, SearchSort } from '@webpricer/shared';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { formatPrice, isYear, supplierColor } from '../../lib/format.ts';
import type { Column } from './result-table.tsx';

function Supplier({ item }: { item: SearchItem }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: item.isStop ? 'var(--stop-fg)' : supplierColor(item.supplier) }}
      />
      <span className={item.isStop ? 'truncate font-medium' : 'truncate text-muted'}>
        {item.supplier}
      </span>
    </span>
  );
}

const name: Column = {
  id: 'name',
  header: 'Название',
  min: 160,
  grow: 3,
  cell: (item) => <span className={item.isStop ? 'font-medium' : undefined}>{item.name}</span>,
  title: (item) => item.name,
};

const quantity: Column = {
  id: 'quantity',
  header: 'Кол-во',
  min: 70,
  grow: 0.6,
  align: 'end',
  cell: (item) => item.quantity,
  title: (item) => item.quantity,
};

/** Цена — красным (просьба заказчика: так её легче найти взглядом). */
function Price({ item, rub }: { item: SearchItem; rub: boolean }) {
  return (
    <span className="font-medium text-price">
      {formatPrice(item.price, item.priceValue, { rub })}
    </span>
  );
}

const supplier = (min: number, grow: number): Column => ({
  id: 'supplier',
  header: 'Поставщик',
  min,
  grow,
  cell: (item) => <Supplier item={item} />,
  title: (item) => item.supplier,
});

/** Год детали; текущий год выделяется, если включена подсветка. */
function Year({ item, highlightYear }: { item: SearchItem; highlightYear: number | null }) {
  if (highlightYear === null || !isYear(item.year, highlightYear)) return item.year;
  // Плашка заходит в отступы ячейки (-mx-1): текст не сдвигается и не обрезается раньше,
  // чем без подсветки.
  return (
    <span className="-mx-1 rounded-md bg-accent px-1 py-0.5 font-medium text-accent-fg">
      {item.year}
    </span>
  );
}

/**
 * Стоп-лист: колонка B у разных листов значит разное — отсюда «Год / инфо». Год в ней
 * подсвечивается так же, как в деталях: у листов, где там не год (PI — поставщик, Zavod —
 * срок), правило года не срабатывает.
 */
export const stopColumns = (highlightYear: number | null): Column[] => [
  { ...name, min: 140, grow: 2.4 },
  {
    id: 'year',
    header: 'Год / инфо',
    min: 94,
    grow: 0.9,
    cell: (item) => <Year item={item} highlightYear={highlightYear} />,
    title: (item) => item.year,
  },
  quantity,
  {
    id: 'price',
    header: 'Цена',
    min: 70,
    grow: 0.8,
    align: 'end',
    cell: (item) => <Price item={item} rub={false} />,
    title: (item) => item.price,
  },
  supplier(92, 0.8),
  {
    id: 'description',
    header: 'Описание',
    min: 110,
    grow: 2,
    cell: (item) => (
      <span className={item.isStop ? undefined : 'text-muted'}>{item.description}</span>
    ),
    title: (item) => item.description,
  },
];

type SortField = 'price' | 'qty';

interface SortSpec {
  label: string;
  /** Порядок переключения по клику: первый, второй, затем сброс. */
  first: SearchSort;
  second: SearchSort;
  hints: { first: string; second: string; reset: string };
}

const SORTS: Record<SortField, SortSpec> = {
  price: {
    label: 'Цена',
    first: 'price_asc',
    second: 'price_desc',
    hints: {
      first: 'Сортировать по цене: сначала дешёвые',
      second: 'Сортировать по цене: сначала дорогие',
      reset: 'Сбросить сортировку по цене',
    },
  },
  // Количество — сначала большие остатки: обычно ищут, у кого деталей больше.
  qty: {
    label: 'Кол-во',
    first: 'qty_desc',
    second: 'qty_asc',
    hints: {
      first: 'Сортировать по количеству: сначала больше',
      second: 'Сортировать по количеству: сначала меньше',
      reset: 'Сбросить сортировку по количеству',
    },
  },
};

const ASCENDING: ReadonlySet<SearchSort> = new Set(['price_asc', 'qty_asc']);

/** Заголовок колонки-сортировки: клик — первый порядок → второй → без сортировки. */
function sortableHeader(
  field: SortField,
  sort: SearchSort,
  onSort: (sort: SearchSort) => void,
): Pick<Column, 'header' | 'sort'> {
  const spec = SORTS[field];
  const active = sort === spec.first || sort === spec.second;
  const next = sort === spec.first ? spec.second : sort === spec.second ? 'relevance' : spec.first;
  const hint =
    sort === spec.first
      ? spec.hints.second
      : sort === spec.second
        ? spec.hints.reset
        : spec.hints.first;
  const SortIcon = !active ? ArrowUpDown : ASCENDING.has(sort) ? ArrowUp : ArrowDown;
  return {
    header: (
      <button
        type="button"
        onClick={() => onSort(next)}
        title={hint}
        aria-label={hint}
        className={
          'inline-flex items-center gap-1 rounded-sm hover:text-fg ' +
          (active ? 'text-accent-text hover:text-accent-text' : '')
        }
      >
        {spec.label}
        <SortIcon aria-hidden size={13} strokeWidth={2} />
      </button>
    ),
    sort: !active ? 'none' : ASCENDING.has(sort) ? 'ascending' : 'descending',
  };
}

/**
 * Детали: цена и количество сортируются (клик по заголовку), как цена в старой версии.
 * `highlightYear` — год, который выделяется в колонке «Год» (`null` — подсветка выключена).
 */
export function detailColumns(
  sort: SearchSort,
  onSort: (sort: SearchSort) => void,
  highlightYear: number | null,
): Column[] {
  return [
    name,
    {
      id: 'year',
      header: 'Год',
      min: 60,
      grow: 0.5,
      cell: (item) => <Year item={item} highlightYear={highlightYear} />,
      title: (item) => item.year,
    },
    { ...quantity, min: 84, ...sortableHeader('qty', sort, onSort) },
    {
      id: 'price',
      min: 96,
      grow: 0.8,
      align: 'end',
      cell: (item) => <Price item={item} rub />,
      title: (item) => item.price,
      ...sortableHeader('price', sort, onSort),
    },
    supplier(160, 2),
  ];
}
