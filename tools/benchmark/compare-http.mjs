// Сводит HTTP-замеры старой и новой версии в таблицу «было / стало» (markdown).
//   node tools/benchmark/compare-http.mjs docs/benchmark-results/old-search.json \
//     docs/benchmark-results/new-search-cold.json docs/benchmark-results/new-search-warm.json
import { readFileSync } from 'node:fs';

const [oldFile, coldFile, warmFile] = process.argv.slice(2);
const load = (file) => JSON.parse(readFileSync(file, 'utf8')).results;
const old = load(oldFile);
const cold = load(coldFile);
const warm = load(warmFile);

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const number = (value) => String(value).replace('.', ',');
const count = (value) => value.toLocaleString('en').replace(/,/g, ' ');
const size = (bytes) =>
  bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;

const lines = [
  '| Группа | Запрос | Было, мс | Стало, мс | Быстрее | Ответ: было → стало | Найдено: было → стало |',
  '|---|---|---:|---:|---:|---:|---:|',
];
let group = '';
old.forEach((before, i) => {
  const after = cold[i];
  const ok = before.status === 200;
  lines.push(
    [
      '',
      before.group === group ? '' : before.group,
      `\`${before.query}\``,
      ok ? count(before.coldMs) : `${count(before.coldMs)} (HTTP 500)`,
      number(after.ms),
      `${Math.round(before.coldMs / after.ms)}×`,
      `${size(before.bytes)} → ${size(after.bytes)}`,
      `${ok ? count(before.main + before.special) : 'ошибка'} → ${count(after.main + after.special)}`,
      '',
    ]
      .join(' | ')
      .trim(),
  );
  group = before.group;
});
console.log(lines.join('\n'));

const okOld = old.filter((entry) => entry.status === 200);
console.error(
  JSON.stringify({
    oldColdMedian: median(okOld.map((e) => e.coldMs)),
    oldWarmMedian: median(okOld.map((e) => e.warmMs)),
    newColdMedian: median(cold.map((e) => e.ms)),
    newColdMax: Math.max(...cold.map((e) => e.ms)),
    newWarmMedian: median(warm.map((e) => e.ms)),
    newWarmMax: Math.max(...warm.map((e) => e.ms)),
    speedupMedian: median(old.map((e, i) => e.coldMs / cold[i].ms)),
    speedupMin: Math.min(...old.map((e, i) => e.coldMs / cold[i].ms)),
    newMaxBytes: Math.max(...cold.map((e) => e.bytes)),
    oldMaxBytes: Math.max(...old.map((e) => e.bytes)),
  }),
);
