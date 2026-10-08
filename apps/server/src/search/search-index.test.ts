import { describe, expect, it } from 'vitest';
import {
  type IndexItem,
  orderResults,
  parseQuery,
  type ResultList,
  type ResultSort,
  SearchIndex,
  SearchIndexBuilder,
} from './search-index.ts';

function buildIndex(items: (Partial<IndexItem> & { name: string })[]): SearchIndex {
  const builder = new SearchIndexBuilder();
  items.forEach((item, i) =>
    builder.add({ id: i + 1, kind: 'main', sheetOrder: 10, price: null, ...item }),
  );
  return new SearchIndex(builder.build());
}

function search(
  index: SearchIndex,
  query: string,
  list: ResultList = 'main',
  sort: ResultSort = 'relevance',
): number[] {
  return [...orderResults(index, index.match(parseQuery(query)), list, sort)];
}

function names(index: SearchIndex, source: { name: string }[], query: string): string[] {
  return search(index, query).map((id) => source[id - 1]?.name ?? '');
}

describe('сопоставление', () => {
  it('находит латиницу и кириллицу одинаково, разделители не важны', () => {
    const items = [{ name: 'К52-1В-50В-15мкФ' }, { name: 'K52 1 50V 15uF' }, { name: 'К521' }];
    const index = buildIndex(items);
    expect(names(index, items, 'k52-1 50в').sort()).toEqual(['K52 1 50V 15uF', 'К52-1В-50В-15мкФ']);
    expect(search(index, 'к521')).toHaveLength(3);
  });

  it('число в начале слова не совпадает с концом другого числа', () => {
    const items = [{ name: 'К10-17 15пФ' }, { name: 'К10-17 115пФ' }, { name: 'К10-17 0,15пФ' }];
    const index = buildIndex(items);
    expect(names(index, items, '15пф')).toEqual(['К10-17 15пФ']);
  });

  it('значение с единицей не продолжается буквой', () => {
    const items = [{ name: 'С2-33 10 кОм' }, { name: 'С2-33 10К 5%' }, { name: 'К15-5 10кВ' }];
    const index = buildIndex(items);
    expect(names(index, items, 'с2-33 10к').sort()).toEqual(['С2-33 10 кОм', 'С2-33 10К 5%']);
    expect(names(index, items, '10к')).not.toContain('К15-5 10кВ');
  });

  it('не склеивает соседние токены там, где в запросе не было разделителя', () => {
    const items = [
      { name: 'Р1-8МП 0.125Вт 1кОм' },
      { name: 'К10-17-МП0-1000пФ' },
      { name: 'КТ 315 А' },
      { name: 'ОСК52-1' },
    ];
    const index = buildIndex(items);
    expect(names(index, items, 'мп0')).toEqual(['К10-17-МП0-1000пФ']);
    expect(names(index, items, 'кт315')).toEqual(['КТ 315 А']);
    expect(names(index, items, 'к52-1')).toEqual(['ОСК52-1']);
  });

  it('присоединяет единицу, написанную отдельным словом, к числу', () => {
    const items = [{ name: 'К52-1 33мкФ' }, { name: 'К52-1 33 пФ' }, { name: 'С2-33 1.5 кОм' }];
    const index = buildIndex(items);
    expect(names(index, items, 'к52 33 uF')).toEqual(['К52-1 33мкФ']);
    expect(names(index, items, 'с2-33 1,5 ком')).toEqual(['С2-33 1.5 кОм']);
  });

  it('ищет короткие запросы без триграмм', () => {
    const items = [{ name: 'КТ315' }, { name: 'Реле' }];
    expect(names(buildIndex(items), items, 'кт')).toEqual(['КТ315']);
  });

  it('отбор через индекс совпадает с полным перебором', () => {
    const items = [
      'К52-1В-50В-15мкФ',
      'КТ315Г',
      'КТ3151Б9',
      'С2-33Н-0.25-10 кОм 5%',
      'С2-33Н-0.25-110 кОм',
      '2РМТ22КПН10Ш1В1В',
      'Р1-8МП 0.125Вт',
      'К10-17-МП0-1000пФ',
      'Реле РЭС-47 (408)',
      'ОНЦ-БС-2-19/18-Р12',
    ].map((name) => ({ name }));
    const index = buildIndex(items);
    for (const query of ['кт315', 'с2-33 10к', 'мп0', 'рэс47', '2рмт22', 'онц бс 2', '10к', 'кт']) {
      const terms = parseQuery(query);
      expect(index.match(terms), query).toEqual(index.match(terms, { useIndex: false }));
    }
  });
});

describe('ранжирование', () => {
  it('точное совпадение выше продолжения числа, короткое выше длинного', () => {
    const items = [
      { name: 'КТ3151Б9' },
      { name: 'КТ315Г' },
      { name: 'Транзистор КТ315' },
      { name: 'КТ315' },
    ];
    expect(names(buildIndex(items), items, 'кт315')).toEqual([
      'КТ315',
      'КТ315Г',
      'КТ3151Б9',
      'Транзистор КТ315',
    ]);
  });

  it('при равной релевантности — по алфавиту', () => {
    const items = [{ name: 'КТ315В' }, { name: 'КТ315А' }, { name: 'КТ315Б' }];
    expect(names(buildIndex(items), items, 'кт315')).toEqual(['КТ315А', 'КТ315Б', 'КТ315В']);
  });

  it('слова в порядке запроса выше', () => {
    const items = [{ name: 'С2-33 1к К52' }, { name: 'К52 С2-33 1к' }];
    expect(names(buildIndex(items), items, 'к52 1к')).toEqual(['К52 С2-33 1к', 'С2-33 1к К52']);
  });
});

describe('таблицы выдачи и сортировка', () => {
  const items: (Partial<IndexItem> & { name: string })[] = [
    { name: 'КТ315 деталь', price: 50, quantity: 3 },
    { name: 'КТ315 стоп Spam', kind: 'special', sheetOrder: 5 },
    { name: 'КТ315 стоп STOP', kind: 'special', sheetOrder: 2 },
    { name: 'КТ315 без цены', quantity: 1000 },
    { name: 'КТ315 дешёвая', price: 10 },
  ];
  const index = buildIndex(items);

  it('делит выдачу на детали и стоп-лист; стоп-лист — по порядку листов', () => {
    expect(search(index, 'кт315', 'special')).toEqual([3, 2]);
    expect(search(index, 'кт315', 'main').sort()).toEqual([1, 4, 5]);
  });

  it('сортирует по цене, позиции без цены — в конце', () => {
    expect(search(index, 'кт315', 'main', 'price_asc')).toEqual([5, 1, 4]);
    expect(search(index, 'кт315', 'main', 'price_desc')).toEqual([1, 5, 4]);
  });

  it('сортирует по количеству, позиции без количества — в конце', () => {
    expect(search(index, 'кт315', 'main', 'qty_desc')).toEqual([4, 1, 5]);
    expect(search(index, 'кт315', 'main', 'qty_asc')).toEqual([1, 4, 5]);
  });
});
