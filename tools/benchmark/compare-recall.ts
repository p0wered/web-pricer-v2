// Сравнение выдачи нового поиска со старым алгоритмом на одном каталоге.
//
// Старый алгоритм (SearchController старой версии) воспроизведён дословно: первое слово —
// подстрока названия, остальные — подстроки (для чисел — варианты с точкой и запятой),
// без учёта регистра (MySQL utf8mb4_0900_ai_ci: также ё = е).
//
// Использование (после импорта в data/):
//   node tools/benchmark/compare-recall.ts [data/catalog.sqlite] [--samples 5] [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import {
  orderResults,
  parseQuery,
  SearchIndex,
  SearchIndexBuilder,
} from '../../apps/server/src/search/search-index.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { samples: { type: 'string', default: '5' }, json: { type: 'string' } },
});
const catalogPath = positionals[0] ?? 'data/catalog.sqlite';
const sampleSize = Number(values.samples);

interface Row {
  id: number;
  name: string;
  kind: 'main' | 'special';
  sort_order: number;
  price_num: number | null;
}

const db = new Database(catalogPath, { readonly: true });
const rows = db
  .prepare(
    `SELECT i.id, i.name, s.kind, s.sort_order, i.price_num
     FROM items i JOIN sheets s ON s.id = i.sheet_id ORDER BY i.id`,
  )
  .all() as Row[];

const builder = new SearchIndexBuilder();
for (const row of rows) {
  builder.add({
    id: row.id,
    name: row.name,
    kind: row.kind,
    sheetOrder: row.sort_order,
    price: row.price_num,
  });
}
const index = new SearchIndex(builder.build());
const lowered = rows.map((row) => row.name.toLowerCase().replace(/ё/g, 'е'));
const nameById = new Map(rows.map((row) => [row.id, row.name]));

function oldSearch(query: string): Set<number> {
  const [base = '', ...rest] = query
    .trim()
    .split(/\s+/)
    .map((token) => token.toLowerCase());
  const conditions = rest.map((token) => {
    if (
      /^[\d.,]+$/.test(token.replace(',', '.')) &&
      !Number.isNaN(Number(token.replace(',', '.')))
    ) {
      const withDot = token.replace(',', '.');
      const withComma = token.replace('.', ',');
      return (name: string) => name.includes(withDot) || name.includes(withComma);
    }
    return (name: string) => name.includes(token);
  });
  const result = new Set<number>();
  lowered.forEach((name, i) => {
    if (name.includes(base) && conditions.every((matches) => matches(name))) {
      result.add(rows[i]?.id ?? 0);
    }
  });
  return result;
}

function newSearch(query: string): Set<number> {
  const match = index.match(parseQuery(query));
  return new Set([
    ...orderResults(index, match, 'main', 'relevance'),
    ...orderResults(index, match, 'special', 'relevance'),
  ]);
}

const sample = (ids: number[]) => ids.slice(0, sampleSize).map((id) => nameById.get(id) ?? '');

const queries = JSON.parse(readFileSync(new URL('./queries.json', import.meta.url), 'utf8')) as {
  group: string;
  query: string;
}[];

const report = queries.map(({ group, query }) => {
  const before = oldSearch(query);
  const after = newSearch(query);
  const lost = [...before].filter((id) => !after.has(id));
  const gained = [...after].filter((id) => !before.has(id));
  return {
    group,
    query,
    old: before.size,
    new: after.size,
    lost: lost.length,
    gained: gained.length,
    lostSamples: sample(lost),
    gainedSamples: sample(gained),
  };
});

for (const entry of report) {
  console.log(
    `${entry.query.padEnd(22)} было ${String(entry.old).padStart(6)}  стало ${String(entry.new).padStart(6)}  ` +
      `−${entry.lost} +${entry.gained}`,
  );
  if (entry.lost) console.log(`    потеряно:  ${entry.lostSamples.join(' | ')}`);
  if (entry.gained) console.log(`    добавлено: ${entry.gainedSamples.join(' | ')}`);
}
if (values.json) writeFileSync(values.json, `${JSON.stringify(report, null, 2)}\n`);
