import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { searchResponseSchema } from '@webpricer/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { testConfig } from '../test-support/test-config.ts';
import { openAppDb } from '../db/app-db.ts';
import { runImport } from '../import/import-runner.ts';
import { dataPaths } from '../paths.ts';
import { CatalogStore } from '../search/catalog-store.ts';
import { SearchService } from '../search/search-service.ts';
import { samplePricerSheets, writeXlsx } from '../test-support/xlsx-fixture.ts';

const root = mkdtempSync(path.join(tmpdir(), 'webpricer-api-'));
const paths = dataPaths(path.join(root, 'data'));
const config = testConfig({ dataDir: paths.dataDir });
const appDb = openAppDb(':memory:');
const catalog = new CatalogStore({ catalogPath: paths.catalogDb });
const app = await buildApp(config, { searchService: new SearchService(catalog) });

async function importSample(extraRow?: string) {
  const sheets = samplePricerSheets();
  if (extraRow) sheets[3]?.rows.push([extraRow, 2020, 1, 100]);
  const file = path.join(root, 'Pricer.xlsm');
  writeXlsx(file, sheets);
  await runImport({ appDb, paths, appSecret: undefined }, { trigger: 'cli', file });
}

async function search(query: Record<string, string>) {
  const response = await app.inject({ method: 'GET', url: '/api/search', query });
  return { status: response.statusCode, headers: response.headers, body: response.json() };
}

beforeAll(async () => {
  await importSample();
});

afterAll(async () => {
  catalog.close();
  await app.close();
  appDb.close();
  rmSync(root, { recursive: true, force: true });
});

describe('GET /api/search', () => {
  it('до загрузки каталога отвечает 503', async () => {
    const { status, body } = await search({ q: 'кт315', list: 'main' });
    expect(status).toBe(503);
    expect(body.error).toContain('Данные загружаются');
  });

  it('ищет по деталям и стоп-листу', async () => {
    await catalog.reload();
    const main = await search({ q: 'KT315', list: 'main' });
    expect(main.status).toBe(200);
    const parsed = searchResponseSchema.parse(main.body);
    expect(parsed).toMatchObject({ total: 1, offset: 0, dataVersion: 1 });
    expect(parsed.items[0]).toEqual({
      id: 3,
      name: 'КТ315Г',
      year: '79-80',
      quantity: '10',
      price: '12.5',
      priceValue: 12.5,
      supplier: 'РадиоКомплект от 21.09.2026',
      description: 'пятница 10-00',
      isStop: false,
    });
    expect(main.headers['server-timing']).toMatch(/search;dur=/);

    const special = searchResponseSchema.parse((await search({ q: 'онц', list: 'special' })).body);
    expect(special.items).toMatchObject([
      { name: 'ОНЦ-БС-2-19/18-Р12-3В', supplier: 'STOP', isStop: true },
    ]);
  });

  it('отдаёт выдачу порциями и сортирует по цене', async () => {
    const all = searchResponseSchema.parse((await search({ q: '', list: 'main' })).body);
    expect(all.total).toBe(0); // пустой запрос — пустая выдача

    // «к»: КТ315Г (12.5), К52-1В (999.99), С2-33Н (36800), Динамик (цена «По запосу»).
    const page = (offset: string) =>
      search({ q: 'к', list: 'main', sort: 'price_desc', limit: '2', offset });
    const first = searchResponseSchema.parse((await page('0')).body);
    const second = searchResponseSchema.parse((await page('2')).body);
    expect(first.total).toBe(4);
    expect([...first.items, ...second.items].map((item) => item.priceValue)).toEqual([
      36800,
      999.99,
      12.5,
      null,
    ]);
    expect(second.offset).toBe(2);
  });

  it('сжимает ответ, если клиент это поддерживает', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/search',
      query: { q: 'к', list: 'main' },
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(response.headers['content-encoding']).toBe('gzip');
  });

  it('отклоняет некорректные параметры', async () => {
    expect((await search({ q: 'кт315', list: 'other' })).status).toBe(400);
    expect((await search({ q: 'кт315', list: 'main', limit: '10000' })).status).toBe(400);
  });

  it('подхватывает новый каталог после импорта', async () => {
    await importSample('Новая деталь КМ-5');
    await catalog.reload();
    const body = searchResponseSchema.parse((await search({ q: 'км5', list: 'main' })).body);
    expect(body).toMatchObject({ total: 1, dataVersion: 2 });
  });
});
