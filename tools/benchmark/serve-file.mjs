// Отдаёт один файл по HTTP с Basic Auth — имитация DAV-сервера для замеров импорта.
// Использование:
//   BENCH_USER=u BENCH_PASS=p node tools/benchmark/serve-file.mjs /path/to/Pricer.xlsm [port]
// Файл доступен по любому пути: http://host:port/Pricer.xlsm
// BENCH_RATE=5 — отдавать не быстрее 5 МБ/с: чтобы разглядеть этап скачивания в настройках
// (без ограничения локальный файл скачивается мгновенно). Для замеров не задавать.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const [filePath, portArg = '8089'] = process.argv.slice(2);
const { BENCH_USER: user, BENCH_PASS: pass, BENCH_RATE: rateArg } = process.env;
const bytesPerSecond = rateArg ? Number(rateArg) * 1024 * 1024 : null;

if (bytesPerSecond !== null && !(bytesPerSecond > 0)) {
  console.error('BENCH_RATE — скорость в МБ/с, больше нуля');
  process.exit(1);
}

/** Чанки файла не быстрее заданной скорости: каждый ждёт своего момента от начала отдачи. */
async function* throttled(stream, rate) {
  const startedAt = Date.now();
  let sent = 0;
  for await (const chunk of stream) {
    sent += chunk.length;
    const wait = startedAt + (sent / rate) * 1000 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    yield chunk;
  }
}

if (!filePath || !user || !pass) {
  console.error('Нужны путь к файлу и переменные BENCH_USER / BENCH_PASS');
  process.exit(1);
}

const expectedAuth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const { size } = statSync(filePath);

const server = createServer((request, response) => {
  if (request.headers.authorization !== expectedAuth) {
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="bench"' }).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'application/vnd.ms-excel.sheet.macroEnabled.12',
    'Content-Length': size,
    'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const file = createReadStream(filePath);
  const body = bytesPerSecond ? Readable.from(throttled(file, bytesPerSecond)) : file;
  // Клиент оборвал скачивание — просто закрываем поток файла.
  pipeline(body, response).catch(() => file.destroy());
});

server.listen(Number(portArg), () => {
  const limit = bytesPerSecond ? `, не быстрее ${rateArg} МБ/с` : '';
  console.log(`Отдаю ${filePath} (${size} байт) на порту ${portArg}${limit}`);
});
