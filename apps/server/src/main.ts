import type { FastifyBaseLogger } from 'fastify';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { dataPaths, ensureDataDirs } from './paths.ts';
import { CatalogStore } from './search/catalog-store.ts';
import { SearchService } from './search/search-service.ts';

const config = loadConfig();
const paths = dataPaths(config.dataDir);
ensureDataDirs(paths);

// Логгер появляется вместе с приложением, а хранилище каталога нужно приложению заранее.
const logger: { current?: FastifyBaseLogger } = {};
const catalog = new CatalogStore({
  catalogPath: paths.catalogDb,
  onReload: (info) => logger.current?.info(info, 'Каталог загружен в поисковый индекс'),
  onError: (error) => logger.current?.error(error, 'Не удалось загрузить каталог'),
});
const searchService = new SearchService(catalog, { cacheSize: config.searchCacheSize });
const app = await buildApp(config, { searchService });
logger.current = app.log;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Остановка сервера');
    catalog.close();
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error(error, 'Ошибка при остановке');
        process.exit(1);
      },
    );
  });
}

await app.listen({ host: config.host, port: config.port });
// Индекс строится после старта: пока он загружается, поиск отвечает 503 «Данные загружаются».
catalog.watch();
await catalog.reload();
