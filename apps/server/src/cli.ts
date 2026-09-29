// Командная строка администратора (аналог artisan-команд старой версии).
//
//   node apps/server/src/cli.ts import [--file <путь>]
//
// В Docker: `docker compose exec webpricer2 webpricer import` (обёртка запускает CLI от
// пользователя node, чтобы файлы данных не оказались принадлежащими root).
import { parseArgs } from 'node:util';
import { loadConfig } from './config.ts';
import { openAppDb } from './db/app-db.ts';
import { ImportError } from './import/import-errors.ts';
import { type ImportProgress, runImport } from './import/import-runner.ts';
import { dataPaths, ensureDataDirs } from './paths.ts';

const HELP = `Использование: webpricer <команда> [параметры]

Команды:
  import              Скачать файл по настройкам импорта и загрузить данные
  import --file <п>   Загрузить данные из локального файла (без скачивания)
  help                Показать эту справку
`;

const numberFormat = new Intl.NumberFormat('ru-RU');

function describeProgress(progress: ImportProgress): string {
  switch (progress.stage) {
    case 'download': {
      const mb = (progress.bytes / 1024 / 1024).toFixed(1);
      const total = progress.totalBytes
        ? ` из ${(progress.totalBytes / 1024 / 1024).toFixed(1)}`
        : '';
      return `Скачивание: ${mb}${total} МБ`;
    }
    case 'parse':
      return `Разбор листов: ${progress.sheetIndex}/${progress.sheetCount}, строк: ${numberFormat.format(progress.rowsMain + progress.rowsSpecial)}`;
    case 'finalize':
      return 'Завершение…';
  }
}

async function importCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { file: { type: 'string' } } });
  const config = loadConfig();
  const paths = dataPaths(config.dataDir);
  ensureDataDirs(paths);
  const appDb = openAppDb(paths.appDb);

  const interactive = process.stdout.isTTY;
  let lastLine = '';
  let lastPrinted = 0;
  const report = (progress: ImportProgress) => {
    const line = describeProgress(progress);
    if (interactive) {
      process.stdout.write(`\r${line.padEnd(lastLine.length)}`);
      lastLine = line;
    } else if (Date.now() - lastPrinted > 5000 || progress.stage === 'finalize') {
      console.log(line);
      lastPrinted = Date.now();
    }
  };

  try {
    const result = await runImport(
      { appDb, paths, appSecret: config.appSecret },
      { trigger: 'cli', ...(values.file ? { file: values.file } : {}) },
      report,
    );
    if (interactive) process.stdout.write('\n');
    console.log(
      [
        'Импорт завершён успешно.',
        `Листов: ${result.sheets}.`,
        `Детали: ${numberFormat.format(result.rowsMain)} строк, стоп-лист: ${numberFormat.format(result.rowsSpecial)} строк.`,
        `Время: ${(result.durationMs / 1000).toFixed(1)} с.`,
      ].join('\n'),
    );
    return 0;
  } catch (error) {
    if (interactive) process.stdout.write('\n');
    if (error instanceof ImportError) {
      console.error(`Ошибка импорта (${error.code}): ${error.message}`);
      if (error.cause instanceof Error) console.error(`Подробности: ${error.cause.message}`);
    } else {
      console.error(error);
    }
    return 1;
  } finally {
    appDb.close();
  }
}

const [command, ...rest] = process.argv.slice(2);
let exitCode: number;
switch (command) {
  case 'import':
    exitCode = await importCommand(rest);
    break;
  case undefined:
  case 'help':
  case '--help':
    console.log(HELP);
    exitCode = 0;
    break;
  default:
    console.error(`Неизвестная команда: ${command}\n\n${HELP}`);
    exitCode = 1;
}
process.exit(exitCode);
