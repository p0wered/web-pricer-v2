import { describe, expect, it } from 'vitest';
import {
  type IndexItem,
  orderResults,
  parseQuery,
  queryKey,
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

describe('операторы ? _ ^ $', () => {
  it('? — ровно один символ, разделители не считаются', () => {
    const items = ['РС4ТВ', 'РС-7ТВ', 'РСТВ', 'РС45ТВ', '2РС4ТВ'].map((name) => ({ name }));
    expect(names(buildIndex(items), items, 'РС?ТВ').sort()).toEqual(['2РС4ТВ', 'РС-7ТВ', 'РС4ТВ']);
  });

  it('_ — части по порядку, числа после _ ищутся целиком', () => {
    // Строки со скриншота заказчика (запрос «С2-33 1 10») и записи, которые он хотел найти.
    const items = [
      'С2-33 0.25Вт 1кОм 10%',
      'С2-33 0.25Вт 1.2кОм 10%',
      'С2-33Н 1Вт 1кОм 10%',
      'С2-33Н 2Вт 1кОм 10%',
      'С2-33Н 1Вт 22ом 10%',
      'С2-33Н 1Вт 200ом 10%',
      'С2-33Н 1Вт 470ом 10%',
      'С2-33Н 1Вт 680ом 10%',
      'С2-33Н 2Вт 16кОм 10%',
      'С2-33Н 2Вт 13ом 10%',
      'С2-33Н 0.25Вт 15ом 10%',
      'С2-33Н 0.125Вт 150кОм 10%',
      'С2-33Н 0.25Вт 120ом 10%',
      'С2-33 0.25Вт 10кОм 1%',
      'С2-33 2Вт 510ом 10%',
      'С2-33 0.125Вт 10кОм 5%',
      'С2-33Н 1 Вт 10 кОм',
      'С2-33-1-10',
      'С2-33Н 1Вт 10кОм 5%',
      'С2-33 10кОм 1Вт',
    ].map((name) => ({ name }));
    const index = buildIndex(items);
    // «10» совпадает и с допуском 10% — так решили; точный запрос — с единицей.
    expect(names(index, items, 'С2-33_1_10').sort()).toEqual([
      'С2-33 0.25Вт 1кОм 10%',
      'С2-33-1-10',
      'С2-33Н 1 Вт 10 кОм',
      'С2-33Н 1Вт 10кОм 5%',
      'С2-33Н 1Вт 1кОм 10%',
      'С2-33Н 1Вт 200ом 10%',
      'С2-33Н 1Вт 22ом 10%',
      'С2-33Н 1Вт 470ом 10%',
      'С2-33Н 1Вт 680ом 10%',
      'С2-33Н 2Вт 1кОм 10%',
    ]);
    expect(names(index, items, 'С2-33_1_10к').sort()).toEqual([
      'С2-33Н 1 Вт 10 кОм',
      'С2-33Н 1Вт 10кОм 5%',
    ]);
  });

  it('дробное число после _ — тоже целиком', () => {
    const items = [
      'К50-35 50В 4,7мкФ',
      'К50-35 50В 4,75мкФ',
      'К50-35 50В 14,7мкФ',
      'К50-35 4,7мкФ 50В',
    ].map((name) => ({ name }));
    expect(names(buildIndex(items), items, 'К50-35_50в_4.7')).toEqual(['К50-35 50В 4,7мкФ']);
  });

  it('число в начале — как обычное слово: не начинается внутри числа, но может продолжаться', () => {
    const items = ['50В 4.7мкФ', '500В 4.7мкФ', '150В 4.7мкФ'].map((name) => ({ name }));
    expect(names(buildIndex(items), items, '50_4.7').sort()).toEqual(['500В 4.7мкФ', '50В 4.7мкФ']);
  });

  it('^ и $ — начало и конец слова', () => {
    const starts = ['КНР', 'Микросхема КНР', '2КНР', '4КНР-1'].map((name) => ({ name }));
    expect(names(buildIndex(starts), starts, '^КНР').sort()).toEqual(['КНР', 'Микросхема КНР']);
    const ends = ['140УД6', '140УД6 (87г)', 'К140УД6', '140УД601', '140УД6А'].map((name) => ({
      name,
    }));
    expect(names(buildIndex(ends), ends, '140УД6$').sort()).toEqual([
      '140УД6',
      '140УД6 (87г)',
      'К140УД6',
    ]);
  });

  it('слова через пробел по-прежнему в любом порядке; единица присоединяется', () => {
    const items = [{ name: 'С2-33Н 5% 1Вт 10кОм' }, { name: 'С2-33Н 1Вт 10Ом 10%' }];
    const index = buildIndex(items);
    expect(names(index, items, 'С2-33_1_10 5%')).toEqual(['С2-33Н 5% 1Вт 10кОм']);
    expect(names(index, items, 'С2-33_1_10 кОм')).toEqual(['С2-33Н 5% 1Вт 10кОм']);
  });

  it('слово из одних операторов не ищется', () => {
    expect(parseQuery('?')).toEqual([]);
    expect(parseQuery('^_ $ ??')).toEqual([]);
  });

  it('ключ кэша различает операторы и разделители', () => {
    const key = (query: string) => queryKey(parseQuery(query));
    expect(key('кт3_15')).not.toBe(key('кт315'));
    expect(key('_1')).not.toBe(key('1'));
    expect(key('мп-0')).not.toBe(key('мп0'));
    expect(key('^кнр')).not.toBe(key('кнр'));
    expect(key('K52-1')).toBe(key('к52-1'));
  });

  it('отбор через индекс совпадает с полным перебором', () => {
    const items = [
      'РС4ТВ',
      'РС-7ТВ',
      'С2-33Н 1 Вт 10 кОм',
      'С2-33-1-10',
      'С2-33 0.25Вт 1.2кОм 10%',
      '140УД6 (87г)',
      'К140УД601',
      'КНР',
      '2КНР',
    ].map((name) => ({ name }));
    const index = buildIndex(items);
    for (const query of [
      'рс?тв',
      'с2-33_1_10',
      'с2-33_1_10к',
      '^кнр',
      '140уд6$',
      '?с4_в',
      '33_1',
    ]) {
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
