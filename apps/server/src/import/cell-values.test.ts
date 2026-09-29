import { describe, expect, it } from 'vitest';
import {
  cellText,
  cleanText,
  excelSerialToDate,
  formatNumber,
  parsePrice,
  parseQuantity,
} from './cell-values.ts';

const text = (value: string) => ({ type: 'string', value }) as const;

describe('cleanText', () => {
  it('убирает невидимые символы и нормализует пробелы', () => {
    expect(cleanText('\uFEFF К52-1В\u00A050В\u200B  33мкФ\n ')).toBe('К52-1В 50В 33мкФ');
    expect(cleanText('\u00AD\t')).toBe('');
  });
});

describe('formatNumber / excelSerialToDate', () => {
  it('убирает артефакты двоичной арифметики', () => {
    expect(formatNumber(145.79999999999998)).toBe('145.8');
    expect(formatNumber(0.09)).toBe('0.09');
    expect(formatNumber(487305)).toBe('487305');
  });

  it('переводит правдоподобные серийные даты и отвергает остальные', () => {
    expect(excelSerialToDate(46307)).toBe('12.10.2026');
    expect(excelSerialToDate(89)).toBeNull(); // год «89» с форматом даты
    expect(excelSerialToDate(46307.5)).toBeNull();
  });
});

describe('cellText', () => {
  it('показывает дату только там, где это разрешено', () => {
    const cell = { type: 'number', value: 46307, isDate: true } as const;
    expect(cellText(cell, true)).toBe('12.10.2026');
    expect(cellText(cell, false)).toBe('46307');
    expect(cellText({ type: 'number', value: 89, isDate: true }, true)).toBe('89');
  });

  it('возвращает null для пустых значений', () => {
    expect(cellText(undefined, false)).toBeNull();
    expect(cellText(text('  \u00A0'), false)).toBeNull();
  });
});

describe('parsePrice', () => {
  it.each([
    ['320,00', 320],
    ['1 600', 1600],
    ['999-99', 999.99],
    ['700-00', 700],
    ['180р', 180],
    ['180 р.', 180],
    ['3000руб', 3000],
    ['250 руб.', 250],
    ['415 ₽', 415],
    ['0.09', 0.09],
  ])('«%s» → %s', (input, expected) => {
    expect(parsePrice(text(input), input)).toBe(expected);
  });

  it.each([
    'По запосу',
    'звоните',
    'дог.',
    '29 $',
    '190 Rs.',
    'D55501.1',
    '5140р/шт. без НДС',
    '.',
  ])('«%s» → null', (input) => {
    expect(parsePrice(text(input), input)).toBeNull();
  });

  it('берёт число из числовой ячейки как есть', () => {
    expect(parsePrice({ type: 'number', value: 36800, isDate: true }, '36800')).toBe(36800);
  });
});

describe('parseQuantity', () => {
  it.each([
    ['199шт', 199],
    ['9000 шт', 9000],
    ['6 шт.', 6],
    ['>1000', 1000],
    ['<10', 10],
  ])('«%s» → %s', (input, expected) => {
    expect(parseQuantity(text(input), input)).toBe(expected);
  });

  it.each(['много', 'n/a', '3 месяца'])('«%s» → null', (input) => {
    expect(parseQuantity(text(input), input)).toBeNull();
  });
});
