// Отдаёт один файл по HTTP с Basic Auth — имитация DAV-сервера для замеров импорта.
// Использование:
//   BENCH_USER=u BENCH_PASS=p node tools/benchmark/serve-file.mjs /path/to/Pricer.xlsm [port]
// Файл доступен по любому пути: http://host:port/Pricer.xlsm
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const [filePath, portArg = '8089'] = process.argv.slice(2);
const { BENCH_USER: user, BENCH_PASS: pass } = process.env;

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
  createReadStream(filePath).pipe(response);
});

server.listen(Number(portArg), () => {
  console.log(`Отдаю ${filePath} (${size} байт) на порту ${portArg}`);
});
