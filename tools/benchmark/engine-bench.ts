// Замер поискового движка в процессе (без HTTP): перебор против триграммного индекса.
//   node tools/benchmark/engine-bench.ts [data/catalog.sqlite] [повторов]
import { readFileSync } from 'node:fs';
import { buildCatalogIndex } from '../../apps/server/src/search/catalog-index.ts';
import {
  orderResults,
  parseQuery,
  SearchIndex,
} from '../../apps/server/src/search/search-index.ts';

const [catalogPath = 'data/catalog.sqlite', repeatsArg = '7'] = process.argv.slice(2);
const repeats = Number(repeatsArg);

const buildStarted = performance.now();
const built = buildCatalogIndex(catalogPath);
const buildMs = performance.now() - buildStarted;
const index = new SearchIndex(built.data);
const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

const queries = JSON.parse(readFileSync(new URL('./queries.json', import.meta.url), 'utf8')) as {
  group: string;
  query: string;
}[];

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
};

function time(query: string, useIndex: boolean): number {
  const samples: number[] = [];
  for (let i = 0; i < repeats; i++) {
    const started = performance.now();
    const match = index.match(parseQuery(query), { useIndex });
    orderResults(index, match, 'main', 'relevance');
    orderResults(index, match, 'special', 'relevance');
    samples.push(performance.now() - started);
  }
  return median(samples);
}

console.log(
  `Индекс: ${built.data.count} позиций, построение ${(buildMs / 1000).toFixed(1)} с, RSS ${memoryMb} МБ`,
);
const rows = queries.map(({ group, query }) => ({
  group,
  query,
  scanMs: time(query, false),
  indexMs: time(query, true),
}));
for (const row of rows) {
  console.log(
    `${row.query.padEnd(22)} перебор ${row.scanMs.toFixed(1).padStart(7)} мс   индекс ${row.indexMs.toFixed(1).padStart(6)} мс`,
  );
}
console.log(
  `Медиана: перебор ${median(rows.map((r) => r.scanMs)).toFixed(1)} мс, индекс ${median(rows.map((r) => r.indexMs)).toFixed(1)} мс; ` +
    `максимум: перебор ${Math.max(...rows.map((r) => r.scanMs)).toFixed(1)} мс, индекс ${Math.max(...rows.map((r) => r.indexMs)).toFixed(1)} мс`,
);
