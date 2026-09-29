import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = await buildApp(config);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Остановка сервера');
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
