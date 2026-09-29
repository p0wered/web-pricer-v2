// Импорт настоящего Pricer.xlsm. Файл большой и в репозиторий не входит, поэтому тест
// запускается только при заданном пути:
//   PRICER_XLSX=/path/to/Pricer.xlsm npm test
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { openAppDb } from '../db/app-db.ts';
import { dataPaths } from '../paths.ts';
import { runImport } from './import-runner.ts';

const file = process.env.PRICER_XLSX;

describe.skipIf(!file)('импорт реального Pricer.xlsm', () => {
  it('загружает столько же строк, сколько старая версия', { timeout: 300_000 }, async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'webpricer-real-'));
    const paths = dataPaths(path.join(root, 'data'));
    const appDb = openAppDb(':memory:');
    try {
      const result = await runImport(
        { appDb, paths, appSecret: undefined },
        { trigger: 'cli', file: file ?? '' },
      );
      // Эталон — старая версия на файле от 28.09.2026 (docs/benchmarks.md).
      expect(result.rowsMain).toBe(1_604_606);
      expect(result.rowsSpecial).toBe(44_823);
      expect(result.sheets).toBe(155);

      const catalog = new Database(paths.catalogDb, { readonly: true });
      const firstSheets = catalog
        .prepare('SELECT name FROM sheets ORDER BY sort_order LIMIT 3')
        .pluck()
        .all();
      catalog.close();
      expect(firstSheets).toEqual(['>STOP', '>Sklad', '>PI']);
    } finally {
      appDb.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
