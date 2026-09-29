// Замер поиска новой версии по HTTP на регрессионном наборе запросов.
// Воспроизводит то, что делает страница поиска по Enter: параллельно запрашивает первые
// порции обеих таблиц (детали и стоп-лист). Время — до получения обоих ответов целиком.
//
// Использование:
//   node tools/benchmark/search-new.mjs http://localhost:9091 cold 3 docs/benchmark-results/new-search-cold.json
//   node tools/benchmark/search-new.mjs http://localhost:9091 warm 3 docs/benchmark-results/new-search-warm.json
//
// cold — сервер запущен с SEARCH_CACHE_SIZE=0: каждый запрос считается заново;
// warm — кэш включён: замеряется повторный запрос.
import { readFileSync, writeFileSync } from 'node:fs';

const [baseUrl = 'http://localhost:9091', mode = 'cold', roundsArg = '3', outFile] =
  process.argv.slice(2);
const rounds = Number(roundsArg);
const queries = JSON.parse(readFileSync(new URL('./queries.json', import.meta.url), 'utf8'));

async function fetchList(query, list) {
  const url = new URL('/api/search', baseUrl);
  url.search = new URLSearchParams({ q: query, list }).toString();
  const response = await fetch(url);
  const body = await response.text();
  if (response.status !== 200) throw new Error(`«${query}» (${list}): HTTP ${response.status}`);
  return { bytes: Buffer.byteLength(body), total: JSON.parse(body).total };
}

async function search(query) {
  const started = performance.now();
  const [main, special] = await Promise.all([
    fetchList(query, 'main'),
    fetchList(query, 'special'),
  ]);
  return {
    ms: performance.now() - started,
    bytes: main.bytes + special.bytes,
    main: main.total,
    special: special.total,
  };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Прогрев соединения и JIT.
await search('кт315');

const samples = new Map(queries.map(({ query }) => [query, []]));
let last = new Map();
for (let round = 1; round <= rounds; round++) {
  for (const { query } of queries) {
    if (mode === 'warm') await search(query);
    const result = await search(query);
    samples.get(query).push(result.ms);
    last.set(query, result);
  }
  console.error(`раунд ${round}/${rounds} готов`);
}

const results = queries.map(({ group, query }) => ({
  group,
  query,
  ms: Math.round(median(samples.get(query)) * 10) / 10,
  bytes: last.get(query).bytes,
  main: last.get(query).main,
  special: last.get(query).special,
}));

const report = { baseUrl, mode, rounds, measuredAt: new Date().toISOString(), results };
if (outFile) writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.table(results);
