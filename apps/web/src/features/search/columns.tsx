import type { SearchItem, SearchSort } from '@webpricer/shared';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { formatPrice, supplierColor } from '../../lib/format.ts';
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
  min: 62,
  grow: 0.6,
  align: 'end',
  cell: (item) => item.quantity,
  title: (item) => item.quantity,
};

const priceCell = (item: SearchItem) => formatPrice(item.price, item.priceValue);

const supplier = (min: number, grow: number): Column => ({
  id: 'supplier',
  header: 'Поставщик',
  min,
  grow,
  cell: (item) => <Supplier item={item} />,
  title: (item) => item.supplier,
});

/** Стоп-лист: колонка B у разных листов значит разное — отсюда «Год / инфо». */
export const stopColumns: Column[] = [
  { ...name, min: 140, grow: 2.4 },
  {
    id: 'year',
    header: 'Год / инфо',
    min: 84,
    grow: 0.9,
    cell: (item) => item.year,
    title: (item) => item.year,
  },
  quantity,
  {
    id: 'price',
    header: 'Цена',
    min: 70,
    grow: 0.8,
    align: 'end',
    cell: priceCell,
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

const NEXT_SORT: Record<SearchSort, SearchSort> = {
  relevance: 'price_asc',
  price_asc: 'price_desc',
  price_desc: 'relevance',
};

const SORT_LABEL: Record<SearchSort, string> = {
  relevance: 'Сортировать по цене: сначала дешёвые',
  price_asc: 'Сортировать по цене: сначала дорогие',
  price_desc: 'Сбросить сортировку по цене',
};

/** Детали: цена сортируется (нет → по возрастанию → по убыванию → нет), как в старой версии. */
export function detailColumns(sort: SearchSort, onSort: (sort: SearchSort) => void): Column[] {
  const SortIcon = sort === 'price_asc' ? ArrowUp : sort === 'price_desc' ? ArrowDown : ArrowUpDown;
  return [
    name,
    {
      id: 'year',
      header: 'Год',
      min: 60,
      grow: 0.5,
      cell: (item) => item.year,
      title: (item) => item.year,
    },
    quantity,
    {
      id: 'price',
      header: (
        <button
          type="button"
          onClick={() => onSort(NEXT_SORT[sort])}
          title={SORT_LABEL[sort]}
          aria-label={SORT_LABEL[sort]}
          className={
            'inline-flex items-center gap-1 rounded-sm hover:text-fg ' +
            (sort === 'relevance' ? '' : 'text-accent-text hover:text-accent-text')
          }
        >
          Цена
          <SortIcon aria-hidden size={13} strokeWidth={2} />
        </button>
      ),
      min: 84,
      grow: 0.8,
      align: 'end',
      cell: priceCell,
      title: (item) => item.price,
      sort: sort === 'price_asc' ? 'ascending' : sort === 'price_desc' ? 'descending' : 'none',
    },
    supplier(160, 2),
  ];
}
