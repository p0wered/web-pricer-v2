import { z } from 'zod';

/** Таблица выдачи: детали или стоп-лист. */
export const searchListSchema = z.enum(['main', 'special']);
export const searchSortSchema = z.enum(['relevance', 'price_asc', 'price_desc']);

export const SEARCH_PAGE_SIZE = 200;
export const SEARCH_MAX_PAGE_SIZE = 500;

/** Параметры GET /api/search (строка запроса). */
export const searchRequestSchema = z.object({
  q: z.string().max(500).default(''),
  list: searchListSchema,
  sort: searchSortSchema.default('relevance'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_PAGE_SIZE).default(SEARCH_PAGE_SIZE),
});

export const searchItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  /** Колонка B: год (в стоп-листе — «Год / инфо»). */
  year: z.string().nullable(),
  quantity: z.string().nullable(),
  /** Цена как в файле («320,00», «По запросу», «29 $»). */
  price: z.string().nullable(),
  /** Цена числом, если распознана (для сортировки и форматирования). */
  priceValue: z.number().nullable(),
  /** Детали — текст A1 листа («РадиоКомплект от 21.09.2026»), стоп-лист — имя листа без «>». */
  supplier: z.string(),
  description: z.string().nullable(),
  /** Строка из листа >STOP — подсвечивается красным. */
  isStop: z.boolean(),
});

export const searchResponseSchema = z.object({
  total: z.number().int(),
  offset: z.number().int(),
  items: z.array(searchItemSchema),
  /** Номер импорта, из которого данные; `null` — данных ещё нет. */
  dataVersion: z.number().int().nullable(),
});

export type SearchList = z.infer<typeof searchListSchema>;
export type SearchSort = z.infer<typeof searchSortSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchItem = z.infer<typeof searchItemSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
