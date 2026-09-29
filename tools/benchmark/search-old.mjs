// Замер поиска старой версии (Laravel + Inertia) на регрессионном наборе запросов.
// Воспроизводит тот же XHR, что делает страница поиска при нажатии Enter.
//
// Использование:
//   OLD_PASSWORD=... node tools/benchmark/search-old.mjs http://localhost:9090 [rounds] [out.json]
//
// Кэш выдачи старой версии (15 минут, CACHE_STORE=database) сбрасывается перед каждым
// раундом через `docker exec <container> php artisan cache:clear`, поэтому для каждого
// запроса есть «холодный» (без кэша) и «тёплый» (повторный) замер.
// Если запрос завершился ошибкой (status ≠ 200), время всё равно записывается — до ответа с ошибкой.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [baseUrl = 'http://localhost:9090', roundsArg = '3', outFile] = process.argv.slice(2);
const rounds = Number(roundsArg);
const password = process.env.OLD_PASSWORD;
const appContainer = process.env.OLD_APP_CONTAINER ?? 'app';
if (!password) {
  console.error('Нужна переменная OLD_PASSWORD');
  process.exit(1);
}

const queries = JSON.parse(readFileSync(new URL('./queries.json', import.meta.url), 'utf8'));

const cookies = new Map();
function storeCookies(response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const index = pair.indexOf('=');
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
}
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
const xsrf = () => decodeURIComponent(cookies.get('XSRF-TOKEN') ?? '');

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    ...init,
    headers: { Cookie: cookieHeader(), ...init.headers },
  });
  storeCookies(response);
  return response;
}

async function login() {
  await request('/login');
  const response = await request('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/html, application/xhtml+xml',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrf(),
    },
    body: JSON.stringify({ password }),
  });
  if (response.status !== 302 || !response.headers.get('location')?.includes('/search')) {
    throw new Error(`Не удалось войти: HTTP ${response.status}`);
  }
}

async function inertiaVersion() {
  const html = await (await request('/search')).text();
  const match = html.match(/data-page="([^"]+)"/);
  if (!match) throw new Error('Не найден data-page на странице поиска');
  const page = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
  return page.version;
}

async function search(query, version) {
  const url = `/search?${new URLSearchParams({ search: query })}`;
  const started = performance.now();
  const response = await request(url, {
    headers: {
      Accept: 'text/html, application/xhtml+xml',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Inertia': 'true',
      'X-Inertia-Version': version,
      'X-Inertia-Partial-Component': 'Search',
      'X-Inertia-Partial-Data': 'mainProducts,specialProducts,search,allData',
      'X-XSRF-TOKEN': xsrf(),
    },
  });
  const body = await response.text();
  const ms = performance.now() - started;
  const result = { ms, status: response.status, bytes: Buffer.byteLength(body) };
  // Ошибки старой версии (например, HTTP 500 на широких запросах) — тоже результат замера.
  if (response.status !== 200) return { ...result, main: null, special: null };
  const props = JSON.parse(body).props;
  return { ...result, main: props.mainProducts.total, special: props.specialProducts.total };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

await login();
const version = await inertiaVersion();
const samples = new Map(queries.map(({ query }) => [query, { cold: [], warm: [], last: null }]));

for (let round = 1; round <= rounds; round++) {
  execFileSync('docker', ['exec', appContainer, 'php', 'artisan', 'cache:clear'], {
    stdio: 'ignore',
  });
  for (const { query } of queries) {
    const cold = await search(query, version);
    const warm = await search(query, version);
    const entry = samples.get(query);
    entry.cold.push(cold.ms);
    entry.warm.push(warm.ms);
    entry.last = cold;
  }
  console.error(`раунд ${round}/${rounds} готов`);
}

const results = queries.map(({ group, query }) => {
  const { cold, warm, last } = samples.get(query);
  return {
    group,
    query,
    status: last.status,
    coldMs: Math.round(median(cold)),
    warmMs: Math.round(median(warm)),
    bytes: last.bytes,
    main: last.main,
    special: last.special,
  };
});

const report = { baseUrl, rounds, measuredAt: new Date().toISOString(), results };
if (outFile) writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.table(results);
