// Поиск во время импорта: время ответа поиска без импорта и пока идёт ручной импорт
// (скачивание, разбор, запись и перестройка индекса — в отдельных потоках).
//
// Использование (сервер запущен, настройки импорта сохранены):
//   WEBPRICER_PASSWORD=... node tools/benchmark/search-during-import.mjs http://localhost:9091
const base = process.argv[2] ?? 'http://localhost:9091';
const password = process.env.WEBPRICER_PASSWORD;
if (!password) {
  console.error('Нужна переменная WEBPRICER_PASSWORD (пароль входа)');
  process.exit(1);
}

const headers = { 'x-requested-with': 'webpricer', 'content-type': 'application/json' };
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ password }),
});
if (login.status !== 204) throw new Error(`Не удалось войти: HTTP ${login.status}`);
const cookie = login.headers.getSetCookie()[0].split(';')[0];

async function search(query) {
  const started = performance.now();
  const response = await fetch(
    `${base}/api/search?${new URLSearchParams({ q: query, list: 'main' })}`,
    {
      headers: { cookie },
    },
  );
  await response.text();
  return performance.now() - started;
}

const queries = ['кт315', 'к52 33мкф', 'реле', '2рм', 'с2-33н 0.25 10к', 'разъем'];
const idle = [];
for (let i = 0; i < 30; i++) idle.push(await search(queries[i % queries.length]));

const start = await fetch(`${base}/api/import`, {
  method: 'POST',
  headers: { ...headers, cookie },
});
if (start.status !== 202) throw new Error(`Импорт не запустился: HTTP ${start.status}`);
const { runId } = await start.json();

const during = [];
let status = 'running';
while (status === 'running') {
  during.push(await search(queries[during.length % queries.length]));
  if (during.length % 10 === 0) {
    const run = await (await fetch(`${base}/api/import/${runId}`, { headers: { cookie } })).json();
    status = run.status;
  }
}

const describe = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(1);
  return `n=${sorted.length}, медиана ${at(0.5)} мс, p95 ${at(0.95)} мс, максимум ${sorted.at(-1).toFixed(1)} мс`;
};
console.log(`Без импорта:      ${describe(idle)}`);
console.log(`Во время импорта: ${describe(during)} (импорт: ${status})`);
