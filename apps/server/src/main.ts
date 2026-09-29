import pino from 'pino';
import { buildApp } from './app.ts';
import { AuthStore, ensureInitialPassword, InitialPasswordError } from './auth/auth-store.ts';
import { loadConfig } from './config.ts';
import { openAppDb } from './db/app-db.ts';
import { ImportService } from './import/import-service.ts';
import { dataPaths, ensureDataDirs } from './paths.ts';
import { ImportScheduler } from './scheduler/import-scheduler.ts';
import { CatalogStore } from './search/catalog-store.ts';
import { SearchService } from './search/search-service.ts';
import { SettingsStore } from './settings/settings-store.ts';

const config = loadConfig();
const log = pino({ level: config.logLevel });

function fail(message: string): never {
  log.fatal(message);
  process.exit(1);
}

if (!config.appSecret) {
  fail(
    'Не задан APP_SECRET (ключ шифрования пароля DAV, не короче 16 символов). ' +
      'Сгенерировать: openssl rand -hex 32',
  );
}

const paths = dataPaths(config.dataDir);
ensureDataDirs(paths);
const appDb = openAppDb(paths.appDb);

const auth = new AuthStore(appDb, { sessionTtlMs: config.sessionTtlMs });
try {
  if ((await ensureInitialPassword(auth, config.initialPassword)) === 'created') {
    log.info('Пароль входа задан из APP_INITIAL_PASSWORD');
  }
} catch (error) {
  if (error instanceof InitialPasswordError) fail(error.message);
  throw error;
}

const catalog = new CatalogStore({
  catalogPath: paths.catalogDb,
  onReload: (info) => log.info(info, 'Каталог загружен в поисковый индекс'),
  onError: (error) => log.error(error, 'Не удалось загрузить каталог'),
});
const settings = new SettingsStore(appDb, config.appSecret);
const imports = new ImportService({
  appDb,
  dataDir: config.dataDir,
  appSecret: config.appSecret,
  catalog,
  onFinished: (runId, outcome) =>
    outcome instanceof Error
      ? log.warn(
          { runId, code: outcome.code, message: outcome.message },
          'Импорт завершился ошибкой',
        )
      : log.info(outcome, 'Импорт завершён'),
});
imports.recoverInterruptedRuns();
const scheduler = new ImportScheduler({
  settings,
  imports,
  timeZone: config.scheduleTimeZone,
  log,
});

const app = await buildApp(config, {
  logger: log,
  auth,
  searchService: new SearchService(catalog, { cacheSize: config.searchCacheSize }),
  settings,
  scheduler,
  imports,
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'Остановка сервера');
    scheduler.stop();
    catalog.close();
    app.close().then(
      () => {
        appDb.close();
        process.exit(0);
      },
      (error: unknown) => {
        log.error(error, 'Ошибка при остановке');
        process.exit(1);
      },
    );
  });
}

await app.listen({ host: config.host, port: config.port });
scheduler.reschedule();
// Индекс строится после старта: пока он загружается, поиск отвечает 503 «Данные загружаются».
catalog.watch();
await catalog.reload();
