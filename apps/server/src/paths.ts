import { mkdirSync } from 'node:fs';
import path from 'node:path';

export interface DataPaths {
  dataDir: string;
  /** Служебная БД: настройки, журнал импортов (позже — пароль и сессии). */
  appDb: string;
  /** Каталог позиций из последнего успешного импорта; заменяется целиком. */
  catalogDb: string;
  /** Временные файлы импорта: скачанная книга и собираемый каталог. */
  tmpDir: string;
}

export function dataPaths(dataDir: string): DataPaths {
  return {
    dataDir,
    appDb: path.join(dataDir, 'app.sqlite'),
    catalogDb: path.join(dataDir, 'catalog.sqlite'),
    tmpDir: path.join(dataDir, 'tmp'),
  };
}

export function ensureDataDirs(paths: DataPaths): void {
  mkdirSync(paths.tmpDir, { recursive: true });
}
