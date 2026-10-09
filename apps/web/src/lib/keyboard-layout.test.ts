import { describe, expect, it } from 'vitest';
import { applyLayoutConversion, enToRu } from './keyboard-layout.ts';

describe('enToRu', () => {
  it('переводит английскую раскладку в русскую', () => {
    expect(enToRu('rn315')).toBe('кт315');
    expect(enToRu('R50-35')).toBe('К50-35');
  });

  it('не трогает операторы поиска', () => {
    expect(enToRu('hc?nd')).toBe('рс?тв');
    expect(enToRu('^ryh_1_10$')).toBe('^кнр_1_10$');
  });
});

describe('applyLayoutConversion', () => {
  it('переводит только дописанное в конец', () => {
    expect(applyLayoutConversion('кт', 'ктr', true)).toBe('ктк');
    expect(applyLayoutConversion('кт', 'ктr', false)).toBe('ктr');
    expect(applyLayoutConversion('кт315', 'кr315', true)).toBe('кr315');
  });
});
