// Командная строка администратора (аналог artisan-команд старой версии).
//
//   node apps/server/src/cli.ts import [--file <путь>] | password [--reset] | schedule
//
// В Docker: `docker compose exec webpricer2 webpricer import` (обёртка запускает CLI от
// пользователя node, чтобы файлы данных не оказались принадлежащими root).
import { parseArgs } from 'node:util';
import { PASSWORD_MIN_LENGTH, WEEKDAY_NAMES } from '@webpricer/shared';
import { AuthStore } from './auth/auth-store.ts';
import { PromptCancelledError, promptHidden } from './cli/prompt.ts';
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
  password            Сменить пароль входа (спросит текущий пароль, затем новый)
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
    case 'parse': {
      const percent = progress.bytesTotal
        ? Math.min(100, Math.floor((progress.bytesDone / progress.bytesTotal) * 100))
        : 0;
      return `Разбор листов: ${percent}%, лист ${progress.sheetIndex}/${progress.sheetCount}, строк: ${numberFormat.format(progress.rowsMain + progress.rowsSpecial)}`;
    }
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
    const askCurrent = !values.reset && auth.hasPassword();

    console.log(
      askCurrent ? 'Смена пароля для входа в WebPricer.' : 'Новый пароль для входа в WebPricer.',
    );
    console.log(
      askCurrent
        ? `Сначала введите текущий пароль, затем новый (не короче ${PASSWORD_MIN_LENGTH} символов).`
        : `Текущий пароль не нужен. Придумайте новый (не короче ${PASSWORD_MIN_LENGTH} символов).`,
    );
    console.log('Вводимые символы показываются звёздочками. Отменить — Ctrl+C.\n');

    if (askCurrent && !(await askCurrentPassword(auth))) {
      console.error(
        '\nПароль не изменён: текущий пароль введён неверно.\n' +
          'Если вы его не помните, запустите эту же команду с параметром --reset.',
      );
      return 1;
    }
    const password = await askNewPassword();
    if (password === null) {
      console.error('\nПароль не изменён: слишком много неудачных попыток.');
      return 1;
    }
    await auth.setPassword(password);
    auth.deleteAllSessions();
    console.log('\nГотово: пароль изменён. Все, кто был в приложении, должны войти заново.');
    return 0;
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      console.error('\nОтменено, пароль не изменён.');
      return 130;
    }
    throw error;
  } finally {
    appDb.close();
  }
}

const PASSWORD_ATTEMPTS = 3;

async function askCurrentPassword(auth: AuthStore): Promise<boolean> {
  for (let attempt = 1; attempt <= PASSWORD_ATTEMPTS; attempt++) {
    if (await auth.verifyPassword(await promptHidden('Текущий пароль: '))) return true;
    if (attempt < PASSWORD_ATTEMPTS) console.error('Неверный пароль, попробуйте ещё раз.');
  }
  return false;
}

/** Новый пароль с повтором; `null` — все попытки неудачные. */
async function askNewPassword(): Promise<string | null> {
  for (let attempt = 1; attempt <= PASSWORD_ATTEMPTS; attempt++) {
    const retry = attempt < PASSWORD_ATTEMPTS ? ' Попробуйте ещё раз.' : '';
    const password = await promptHidden('Новый пароль: ');
    if (password.length < PASSWORD_MIN_LENGTH) {
      console.error(
        `Слишком короткий: ${password.length} из ${PASSWORD_MIN_LENGTH} символов.${retry}`,
      );
      continue;
    }
    if ((await promptHidden('Повторите новый пароль: ')) !== password) {
      console.error(`Пароли не совпадают.${retry}`);
      continue;
    }
    return password;
  }
  return null;
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
