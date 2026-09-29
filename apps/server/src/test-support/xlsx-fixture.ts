// Сборка небольших XLSX-книг для тестов прямо в коде (без бинарных файлов в репозитории).
import { writeFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';

export type FixtureCell =
  | string // общая строка (sharedStrings)
  | number
  | null
  | { inline: string } // встроенная строка (t="inlineStr")
  | { sharedIndex: number } // ссылка на строку из extraSharedStrings
  | { formulaString: string } // результат формулы-строки (t="str")
  | { number: number; style: number } // число с явным стилем (1 — формат даты)
  | { error: string }
  | { boolean: boolean };

export interface FixtureSheet {
  name: string;
  /** Строки подряд с первой; `rowNumbers` позволяет задать номера явно (пропуски строк). */
  rows: FixtureCell[][];
  rowNumbers?: number[];
}

export interface FixtureOptions {
  /** Сырые <si> для sharedStrings, добавляются перед строками из ячеек (rich text, rPh…). */
  extraSharedStrings?: string[];
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnName = (index: number) => String.fromCharCode(65 + index);

export function buildXlsx(sheets: FixtureSheet[], options: FixtureOptions = {}): Uint8Array {
  const shared: string[] = [...(options.extraSharedStrings ?? [])];
  const sharedIndex = new Map<string, number>();
  const sharedRef = (text: string) => {
    let index = sharedIndex.get(text);
    if (index === undefined) {
      index = shared.length;
      shared.push(`<si><t xml:space="preserve">${escapeXml(text)}</t></si>`);
      sharedIndex.set(text, index);
    }
    return index;
  };

  const cellXml = (ref: string, cell: FixtureCell): string => {
    if (cell === null) return '';
    if (typeof cell === 'string') return `<c r="${ref}" t="s"><v>${sharedRef(cell)}</v></c>`;
    if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
    if ('sharedIndex' in cell) return `<c r="${ref}" t="s"><v>${cell.sharedIndex}</v></c>`;
    if ('inline' in cell) {
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell.inline)}</t></is></c>`;
    }
    if ('formulaString' in cell) {
      return `<c r="${ref}" t="str"><f>CONCAT("a","b")</f><v>${escapeXml(cell.formulaString)}</v></c>`;
    }
    if ('number' in cell) return `<c r="${ref}" s="${cell.style}"><v>${cell.number}</v></c>`;
    if ('error' in cell) return `<c r="${ref}" t="e"><v>${escapeXml(cell.error)}</v></c>`;
    return `<c r="${ref}" t="b"><v>${cell.boolean ? 1 : 0}</v></c>`;
  };

  const files: Record<string, Uint8Array> = {};
  const sheetEntries: string[] = [];
  const relationships: string[] = [];

  sheets.forEach((sheet, index) => {
    const rowsXml = sheet.rows
      .map((cells, rowIndex) => {
        const rowNumber = sheet.rowNumbers?.[rowIndex] ?? rowIndex + 1;
        const cellsXml = cells
          .map((cell, column) => cellXml(`${columnName(column)}${rowNumber}`, cell))
          .join('');
        return `<row r="${rowNumber}" spans="1:5">${cellsXml}</row>`;
      })
      .join('');
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData>${rowsXml}</sheetData></worksheet>`,
    );
    sheetEntries.push(
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    );
    relationships.push(
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    );
  });

  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheetEntries.join('')}</sheets></workbook>`,
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `${relationships.join('')}</Relationships>`,
  );
  // Стиль 0 — обычный, 1 — встроенный формат даты 14, 2 — пользовательский формат рублей.
  files['xl/styles.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00&quot;р.&quot;"/></numFmts>` +
      `<cellStyleXfs count="1"><xf numFmtId="14"/></cellStyleXfs>` +
      `<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs>` +
      `</styleSheet>`,
  );
  files['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.join('')}</sst>`,
  );
  return zipSync(files);
}

export function writeXlsx(filePath: string, sheets: FixtureSheet[], options?: FixtureOptions) {
  writeFileSync(filePath, buildXlsx(sheets, options));
}

/** Типичная книга: служебные листы, стоп-лист и лист поставщика — как в Pricer.xlsm. */
export function samplePricerSheets(): FixtureSheet[] {
  return [
    { name: 'Request', rows: [['Ркомп', 1, 'Всего']] },
    {
      name: 'Suppliers',
      rows: [
        [null, 'Full name'],
        [null, 'Радиокомплекс'],
      ],
    },
    {
      name: '>STOP',
      rows: [
        ['СтопЛист от 30.06.2025', null, 'Всего', 2, ' строк.'],
        ['Название', 'Дата', null, null, 'Коммент'],
        ['ОНЦ-БС-2-19/18-Р12-3В ', '!!! STOP !!', null, 'сложная позиция', null],
        ['\uFEFFТВ115-830/400', '!!! STOP !!'],
      ],
    },
    {
      name: 'Ркомп',
      rows: [
        ['РадиоКомплект от 21.09.2026', null, 'Всего', 5, ' строк.'],
        ['Название', 'Дата', 'Колво', 'Цена', 'Описание'],
        ['КТ315Г', '79-80', 10, 12.5, 'пятница 10-00'],
        [{ inline: 'К52-1В\u00A050В  33мкФ' }, 1985, '199шт', '999-99', null],
        [null, 1990, 5, 1],
        ['С2-33Н 0,25 10к', { number: 46307, style: 1 }, '>1000', { number: 36800, style: 1 }, 'x'],
        ['Динамик', 'бг', 3, 'По запосу', { formulaString: 'формула' }],
        ['Реле', null, 1, 145.79999999999998, { error: '#N/A' }],
      ],
    },
  ];
}
