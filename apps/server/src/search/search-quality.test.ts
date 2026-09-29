// Качество поиска на реальном каталоге (регрессионный набор из tools/benchmark/queries.json
// и правила из PLAN.md §6.5). Каталог большой и в репозиторий не входит:
//   PRICER_CATALOG=data/catalog.sqlite npm test
import { normalizeText } from '@webpricer/shared';
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCatalogIndex } from './catalog-index.ts';
import { orderResults, parseQuery, type ResultList, SearchIndex } from './search-index.ts';

const catalogPath = process.env.PRICER_CATALOG;

describe.skipIf(!catalogPath)('качество поиска на реальном каталоге', () => {
  let index: SearchIndex;
  let names: Map<number, string>;
  let sheetOrders: Map<number, number>;

  beforeAll(() => {
    index = new SearchIndex(buildCatalogIndex(catalogPath ?? '').data);
    const db = new Database(catalogPath ?? '', { readonly: true });
    const rows = db
      .prepare('SELECT i.id, i.name, s.sort_order FROM items i JOIN sheets s ON s.id = i.sheet_id')
      .all() as { id: number; name: string; sort_order: number }[];
    db.close();
    names = new Map(rows.map((row) => [row.id, row.name]));
    sheetOrders = new Map(rows.map((row) => [row.id, row.sort_order]));
  }, 120_000);

  const ids = (query: string, list: ResultList = 'main') => [
    ...orderResults(index, index.match(parseQuery(query)), list, 'relevance'),
  ];
  const found = (query: string, list: ResultList = 'main') =>
    ids(query, list).map((id) => names.get(id) ?? '');
  const compact = (name: string) => normalizeText(name).replace(/ /g, '');

  it('латиница вместо кириллицы находит то же самое', () => {
    expect(ids('KT315')).toEqual(ids('кт315'));
    expect(ids('K52-1 50в')).toEqual(ids('к52-1 50в'));
    expect(ids('2PMT22')).toEqual(ids('2рмт22'));
  });

  it('точное обозначение выше продолжений: кт315', () => {
    const results = found('кт315');
    expect(compact(results[0] ?? '')).toBe('кт315');
    // Другие серии (КТ3151, КТ3157…) — не раньше, чем закончатся КТ315 и КТ315А…Я.
    const top = results.slice(0, 100).map((name) => normalizeText(name));
    expect(top.filter((name) => /(^| )кт ?315\d/.test(name))).toEqual([]);
  });

  it('число не совпадает с концом другого числа', () => {
    for (const name of found('к10-17 15пф')) {
      expect(normalizeText(name), name).toMatch(/(^|[^\d.])15 ?пф/);
    }
    for (const name of found('с2-33н 0.25 10к')) {
      expect(normalizeText(name), name).toMatch(/(^|[^\d.])10 ?к(?![а-яa-z])/);
    }
  });

  it('разные записи номиналов совпадают', () => {
    expect(ids('с2-33 1,5ком')).toEqual(ids('с2-33 1.5к'));
    expect(ids('с2-33 1,5ком').length).toBeGreaterThan(500);
    expect(ids('к52 33мкф')).toEqual(ids('к52 33 uF'));
    expect(ids('с2-33 1,5 ком')).toEqual(ids('с2-33 1.5к'));
  });

  it('не склеивает соседние токены: мп0 ≠ «8МП 0.125»', () => {
    for (const name of found('мп0')) {
      expect(compact(name), name).toContain('мп0');
      // «МП» с середины токена, а «0» — уже следующий токен: это не МП0.
      expect(normalizeText(name), name).not.toMatch(/[^ ]мп 0/);
    }
  });

  it('широкие запросы отвечают полной выдачей', () => {
    expect(ids('к52').length).toBeGreaterThan(12_000);
    expect(ids('2рм').length).toBeGreaterThan(90_000);
    expect(ids('с2-33').length).toBeGreaterThan(58_000);
  });

  it('находит не меньше старой версии там, где она работала верно', () => {
    // Числа старой версии — docs/benchmarks.md (детали / стоп-лист).
    const atLeast: [string, number][] = [
      ['рэс60', 728 + 108],
      ['рэс47', 615 + 375],
      ['реле', 6081 + 38],
      ['разъем', 10129 + 30],
      ['динамик', 151],
      ['2рмт22кпн10ш1в1в', 423 + 5],
    ];
    for (const [query, count] of atLeast) {
      expect(ids(query).length + ids(query, 'special').length, query).toBeGreaterThanOrEqual(count);
    }
  });

  it('стоп-лист сгруппирован по порядку листов в книге', () => {
    const orders = ids('рэс47', 'special').map((id) => sheetOrders.get(id) ?? 0);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
