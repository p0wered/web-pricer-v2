import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { samplePricerSheets, writeXlsx } from '../test-support/xlsx-fixture.ts';
import { ImportError } from './import-errors.ts';
import type { ImportProgress } from './import-runner.ts';
import { runImportInWorker } from './run-import-in-worker.ts';

const root = mkdtempSync(path.join(tmpdir(), 'webpricer-worker-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('runImportInWorker', () => {
  it('выполняет импорт в отдельном потоке и передаёт прогресс', async () => {
    const file = path.join(root, 'Pricer.xlsm');
    writeXlsx(file, samplePricerSheets());
    const stages = new Set<ImportProgress['stage']>();

    const result = await runImportInWorker(
      { dataDir: path.join(root, 'data'), appSecret: undefined },
      { trigger: 'manual', file },
      (progress) => stages.add(progress.stage),
    );

    expect(result).toMatchObject({ sheets: 2, rowsMain: 5, rowsSpecial: 2 });
    expect([...stages]).toEqual(['parse', 'finalize']);
  });

  it('передаёт код ошибки импорта', async () => {
    const file = path.join(root, 'broken.xlsm');
    writeFileSync(file, 'not a zip');
    const error = await runImportInWorker(
      { dataDir: path.join(root, 'data'), appSecret: undefined },
      { trigger: 'manual', file },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect((error as ImportError).code).toBe('format');
  });
});
