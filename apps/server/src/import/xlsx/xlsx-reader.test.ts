import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { samplePricerSheets, writeXlsx } from '../../test-support/xlsx-fixture.ts';
import { isDateFormatCode, XlsxFormatError, XlsxReader, type XlsxRow } from './xlsx-reader.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'webpricer-xlsx-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function readAll(file: string): Promise<Map<string, XlsxRow[]>> {
  const reader = await XlsxReader.open(file);
  const result = new Map<string, XlsxRow[]>();
  try {
    for (const sheet of reader.sheets) {
      const rows: XlsxRow[] = [];
      for await (const row of reader.rows(sheet, 5)) rows.push(row);
      result.set(sheet.name, rows);
    }
  } finally {
    reader.close();
  }
  return result;
}

describe('XlsxReader', () => {
  it('читает листы по порядку, в том числе с «>» в имени', async () => {
    const file = path.join(dir, 'sample.xlsx');
    writeXlsx(file, samplePricerSheets());
    const reader = await XlsxReader.open(file);
    expect(reader.sheets.map((sheet) => sheet.name)).toEqual([
      'Request',
      'Suppliers',
      '>STOP',
      'Ркомп',
    ]);
    reader.close();
  });

  it('распознаёт типы ячеек и формат даты', async () => {
    const file = path.join(dir, 'types.xlsx');
    writeXlsx(file, samplePricerSheets());
    const rows = (await readAll(file)).get('Ркомп') ?? [];
    const byRow = new Map(rows.map((row) => [row.rowNumber, row.cells]));

    expect(byRow.get(3)).toEqual([
      { type: 'string', value: 'КТ315Г' },
      { type: 'string', value: '79-80' },
      { type: 'number', value: 10, isDate: false },
      { type: 'number', value: 12.5, isDate: false },
      { type: 'string', value: 'пятница 10-00' },
    ]);
    expect(byRow.get(4)?.[0]).toEqual({ type: 'string', value: 'К52-1В\u00A050В  33мкФ' });
    expect(byRow.get(6)?.[1]).toEqual({ type: 'number', value: 46307, isDate: true });
    expect(byRow.get(7)?.[4]).toEqual({ type: 'string', value: 'формула' });
    expect(byRow.get(8)?.[4]).toEqual({ type: 'error', value: '#N/A' });
  });

  it('склеивает rich text и игнорирует фонетические подсказки в общих строках', async () => {
    const file = path.join(dir, 'rich.xlsx');
    writeXlsx(file, [{ name: 'Лист', rows: [[{ sharedIndex: 0 }]] }], {
      extraSharedStrings: [
        '<si><r><rPr><b/></rPr><t>К52</t></r><r><t xml:space="preserve">-1 &amp; ок</t></r>' +
          '<rPh sb="0" eb="1"><t>фонетика</t></rPh></si>',
      ],
    });
    const rows = (await readAll(file)).get('Лист') ?? [];
    expect(rows[0]?.cells[0]).toEqual({ type: 'string', value: 'К52-1 & ок' });
  });

  it('учитывает пропуски строк и отбрасывает колонки правее лимита', async () => {
    const file = path.join(dir, 'gaps.xlsx');
    writeXlsx(file, [
      { name: 'Лист', rows: [['a', 1, 2, 3, 4, 'лишняя'], ['b']], rowNumbers: [1, 10] },
    ]);
    const rows = (await readAll(file)).get('Лист') ?? [];
    expect(rows.map((row) => row.rowNumber)).toEqual([1, 10]);
    expect(rows[0]?.cells).toHaveLength(5);
  });

  it('сообщает, что файл не является книгой Excel', async () => {
    const file = path.join(dir, 'not-zip.xlsx');
    writeFileSync(file, '<html>Страница входа</html>');
    await expect(XlsxReader.open(file)).rejects.toBeInstanceOf(XlsxFormatError);
  });
});

describe('isDateFormatCode', () => {
  it.each([
    ['dd.mm.yyyy', true],
    ['[$-419]mmm-yy', true],
    ['h:mm', true],
    ['#,##0.00"р."', false],
    ['_-* #,##0.00_р_._-;\\-* #,##0.00_р_._-', false],
    ['0.00', false],
  ])('%s → %s', (code, expected) => {
    expect(isDateFormatCode(code)).toBe(expected);
  });
});
