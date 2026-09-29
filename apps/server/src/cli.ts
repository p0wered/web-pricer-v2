// Командная строка администратора (аналог artisan-команд старой версии).
//
//   node apps/server/src/cli.ts import [--file <путь>] | password [--reset] | schedule
//
// В Docker: `docker compose exec webpricer2 webpricer import` (обёртка запускает CLI от
// пользователя node, чтобы файлы данных не оказались принадлежащими root).
import { parseArgs } from 'node:util';
import { PASSWORD_MIN_LENGTH, WEEKDAY_NAMES } from '@webpricer/shared';
import { AuthStore } from './auth/auth-store.ts';
import { promptHidden } from './cli/prompt.ts';
import { loadConfig } from './config.ts';
import { openAppDb } from './db/app-db.ts';
import { ImportError } from './import/import-errors.ts';
import { type ImportProgress, runImport } from './import/import-runner.ts';
import { dataPaths, ensureDataDirs } from './paths.ts';
import { nextRunAt } from './scheduler/schedule.ts';
import { SettingsStore } from './settings/settings-store.ts';

const HELP = `Использование: webpricer <команда> [параметры]

Команды:
  import              Скачать файл по настройкам импорта и загрузить данные
  import --file <п>   Загрузить данные из локального файла (без скачивания)
  password            Сменить пароль входа (спросит текущий, новый и подтверждение)
  password --reset    Задать пароль входа без текущего (если он утерян)
  schedule            Показать расписание импорта и время следующего запуска
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

async function passwordCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { reset: { type: 'boolean', default: false } } });
  const config = loadConfig();
  const paths = dataPaths(config.dataDir);
  ensureDataDirs(paths);
  const appDb = openAppDb(paths.appDb);
  try {
    const auth = new AuthStore(appDb, { sessionTtlMs: config.sessionTtlMs });
    if (!values.reset && auth.hasPassword()) {
      const current = await promptHidden('Введите текущий пароль: ');
      if (!(await auth.verifyPassword(current))) {
        console.error('Неверный текущий пароль! Если пароль утерян, используйте --reset.');
        return 1;
      }
    }
    const password = await promptHidden('Введите новый пароль: ');
    const confirmation = await promptHidden('Подтвердите новый пароль: ');
    if (password !== confirmation) {
      console.error('Пароли не совпадают!');
      return 1;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      console.error(`Пароль должен быть не короче ${PASSWORD_MIN_LENGTH} символов.`);
      return 1;
    }
    await auth.setPassword(password);
    auth.deleteAllSessions();
    console.log('Пароль успешно обновлён. Все пользователи должны войти заново.');
    return 0;
  } finally {
    appDb.close();
  }
}

function scheduleCommand(): number {
  const config = loadConfig();
  const paths = dataPaths(config.dataDir);
  ensureDataDirs(paths);
  const appDb = openAppDb(paths.appDb);
  try {
    // Ключ нужен только для записи пароля DAV; расписание читается без него.
    const schedule = new SettingsStore(appDb, config.appSecret ?? '').schedule();
    if (!schedule) {
      console.log('Расписание не задано: настройки импорта ещё не сохранялись.');
      return 0;
    }
    const when = {
      daily: 'ежедневно',
      weekly: `еженедельно, ${WEEKDAY_NAMES[(schedule.day ?? 1) - 1]?.toLowerCase() ?? ''}`,
      monthly: `ежемесячно, ${schedule.day ?? 1}-го числа (в коротком месяце — в последний день)`,
    }[schedule.frequency];
    const next = nextRunAt(schedule, new Date(), config.scheduleTimeZone);
    const nextText = next
      ? new Intl.DateTimeFormat('ru-RU', {
          timeZone: config.scheduleTimeZone,
          dateStyle: 'full',
          timeStyle: 'short',
        }).format(next)
      : 'не определён';
    console.log(`Импорт по расписанию: ${when} в ${schedule.time} (${config.scheduleTimeZone}).`);
    console.log(`Следующий запуск: ${nextText}.`);
    return 0;
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
  case 'password':
    exitCode = await passwordCommand(rest);
    break;
  case 'schedule':
    exitCode = scheduleCommand();
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
