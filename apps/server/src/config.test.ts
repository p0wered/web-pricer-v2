import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUSTED_PROXIES, loadConfig } from './config.ts';

const trustProxy = (value: string | undefined) => loadConfig({ TRUST_PROXY: value }).trustProxy;

describe('TRUST_PROXY', () => {
  it('по умолчанию и при true доверяет только прокси с этого хоста и из частных сетей', () => {
    for (const value of [undefined, '', 'true', '1']) {
      expect(trustProxy(value), String(value)).toEqual(DEFAULT_TRUSTED_PROXIES);
    }
  });

  it('false — не доверять никому', () => {
    expect(trustProxy('false')).toBe(false);
    expect(trustProxy('0')).toBe(false);
  });

  it('принимает список адресов и подсетей', () => {
    expect(trustProxy('10.0.0.5, 192.168.0.0/16,::1,loopback')).toEqual([
      '10.0.0.5',
      '192.168.0.0/16',
      '::1',
      'loopback',
    ]);
  });

  it('отклоняет нераспознанные значения', () => {
    for (const value of ['yes', '10.0.0.0/33', '10.0.0.0/8/1', 'example.com', '10.0.0.5,']) {
      expect(() => trustProxy(value), value).toThrow(/TRUST_PROXY/);
    }
  });
});
