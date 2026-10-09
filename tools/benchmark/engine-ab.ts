// Сравнение двух версий поискового движка в одном процессе, на одном индексе: прогоны идут
// вперемешку, поэтому нагрев и фоновая нагрузка машины влияют на обе версии одинаково.
//   git show HEAD:apps/server/src/search/search-index.ts > apps/server/src/search/zz-old.ts
//   node tools/benchmark/engine-ab.ts apps/server/src/search/zz-old.ts [data/catalog.sqlite]
//   rm apps/server/src/search/zz-old.ts
// Старая версия лежит рядом с текущей, чтобы у неё разрешались те же импорты.
// Для оценки погрешности сравните старую версию с её же копией (разница должна быть ~0%).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCatalogIndex } from '../../apps/server/src/search/catalog-index.ts';
import * as current from '../../apps/server/src/search/search-index.ts';

const [oldPath, catalogPath = 'data/catalog.sqlite'] = process.argv.slice(2);
if (!oldPath) {
  console.error('Нужен путь к старой версии search-index.ts');
  process.exit(1);
}
const old = (await import(pathToFileURL(path.resolve(oldPath)).href)) as typeof current;

const data = buildCatalogIndex(catalogPath).data;
const engines = {
  old: { engine: old, index: new old.SearchIndex(data) },
  new: { engine: current, index: new current.SearchIndex(data) },
};
const queries = ['2рм', 'с2-33', 'к50', 'к10-17', 'разъем', 'кт315', 'с2-33 10к'];
const rounds = 60;

const samples = new Map<string, number[]>();
for (let round = 0; round < rounds; round++) {
  const order = round % 2 ? (['old', 'new'] as const) : (['new', 'old'] as const);
  for (const name of order) {
    const { engine, index } = engines[name];
    for (const query of queries) {
      const started = performance.now();
      const match = index.match(engine.parseQuery(query));
      engine.orderResults(index, match, 'main', 'relevance');
      engine.orderResults(index, match, 'special', 'relevance');
      const key = `${name}|${query}`;
      samples.set(key, [...(samples.get(key) ?? []), performance.now() - started]);
    }
  }
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1] ?? 0;
for (const query of queries) {
  const before = median(samples.get(`old|${query}`) ?? []);
  const after = median(samples.get(`new|${query}`) ?? []);
  const change = ((after - before) / before) * 100;
  console.log(
    `${query.padEnd(12)} было ${before.toFixed(2).padStart(6)} мс   стало ${after.toFixed(2).padStart(6)} мс   ${change >= 0 ? '+' : ''}${change.toFixed(0)}%`,
  );
}
