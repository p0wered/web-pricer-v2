import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { healthResponseSchema } from '@webpricer/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import type { AppConfig } from './config.ts';

const webDistDir = mkdtempSync(path.join(tmpdir(), 'webpricer-dist-'));
writeFileSync(path.join(webDistDir, 'index.html'), '<!doctype html><title>WebPricer</title>');

const config: AppConfig = {
  host: '127.0.0.1',
  port: 0,
  logLevel: 'silent',
  trustProxy: true,
  webDistDir,
  dataDir: path.join(webDistDir, 'data'),
  appSecret: undefined,
};

afterAll(() => rmSync(webDistDir, { recursive: true, force: true }));

describe('app', () => {
  it('отвечает на /api/health', async () => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json()).status).toBe('ok');
    await app.close();
  });

  it('отдаёт 404 в JSON для неизвестных API-маршрутов', async () => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'GET', url: '/api/unknown' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Не найдено' });
    await app.close();
  });

  it('отдаёт index.html для страниц SPA', async () => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'GET', url: '/search?q=кт315' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<title>WebPricer</title>');
    await app.close();
  });
});
