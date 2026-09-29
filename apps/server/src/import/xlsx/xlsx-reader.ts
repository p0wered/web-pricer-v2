// Потоковое чтение XLSX/XLSM: книга не загружается в память целиком.
// В памяти держатся только общие строки (sharedStrings) и форматы ячеек; листы читаются
// построчно прямо из zip-архива.
import type { Readable } from 'node:stream';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { getAttribute, scanXml, XmlScanner } from './xml-scanner.ts';

export type CellValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number; isDate: boolean }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; value: string };

export interface SheetInfo {
  /** Имя листа как в книге (например, `>STOP`). */
  name: string;
  /** Путь XML листа внутри архива. */
  path: string;
  /** Позиция листа в книге, с нуля. */
  index: number;
}

export interface XlsxRow {
  /** Номер строки в Excel, с единицы. */
  rowNumber: number;
  /** Ячейки по номеру колонки (0 — A); отсутствующие — `undefined`. */
  cells: (CellValue | undefined)[];
}

export class XlsxFormatError extends Error {
  override name = 'XlsxFormatError';
}

function openZip(filePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error) reject(new XlsxFormatError(`Файл не является zip-архивом: ${error.message}`));
      else resolve(zip);
    });
  });
}

function readEntries(zip: ZipFile): Promise<Map<string, Entry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Entry>();
    zip.on('entry', (entry: Entry) => {
      entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.once('end', () => resolve(entries));
    zip.once('error', reject);
    zip.readEntry();
  });
}

function columnIndex(cellRef: string): number {
  let index = 0;
  for (let i = 0; i < cellRef.length; i++) {
    const code = cellRef.charCodeAt(i);
    if (code < 65 || code > 90) break; // A–Z
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/** Встроенные числовые форматы Excel, означающие дату или время. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/"[^"]*"/g, '') // литералы в кавычках
    .replace(/\[[^\]]*\]/g, '') // [Red], [$-419] и т. п.
    .replace(/[_\\*]./g, ''); // экранированные символы и заполнители
  return /[dmyhs]/i.test(stripped);
}

function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `xl/${target}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.') resolved.push(part);
  }
  return resolved.join('/');
}

export class XlsxReader {
  readonly sheets: SheetInfo[] = [];
  private sharedStrings: string[] = [];
  /** Индексы стилей ячеек (атрибут `s`), у которых формат даты/времени. */
  private dateStyles = new Set<number>();
  private readonly zip: ZipFile;
  private readonly entries: Map<string, Entry>;

  private constructor(zip: ZipFile, entries: Map<string, Entry>) {
    this.zip = zip;
    this.entries = entries;
  }

  static async open(filePath: string): Promise<XlsxReader> {
    const zip = await openZip(filePath);
    try {
      const reader = new XlsxReader(zip, await readEntries(zip));
      await reader.loadWorkbook();
      await reader.loadStyles();
      await reader.loadSharedStrings();
      return reader;
    } catch (error) {
      zip.close();
      throw error;
    }
  }

  close(): void {
    this.zip.close();
  }

  /** Строки листа по порядку. Ячейки правее `maxColumns` отбрасываются. */
  async *rows(sheet: SheetInfo, maxColumns: number): AsyncGenerator<XlsxRow> {
    const stream = await this.openText(sheet.path);
    const sharedStrings = this.sharedStrings;
    const dateStyles = this.dateStyles;
    const ready: XlsxRow[] = [];

    let rowNumber = 0;
    let cells: (CellValue | undefined)[] = [];
    let column = -1;
    let cellType: string | undefined;
    let cellStyle = 0;
    let capture = false; // внутри <v> или <t> текущей ячейки
    let inPhonetic = false; // <rPh> — фонетическая подсказка, не часть значения
    let text = '';

    const finishCell = () => {
      if (column < 0 || column >= maxColumns) return;
      let value: CellValue | undefined;
      switch (cellType) {
        case 's': {
          const shared = sharedStrings[Number(text)];
          if (shared === undefined) throw new XlsxFormatError(`Нет общей строки №${text}`);
          value = { type: 'string', value: shared };
          break;
        }
        case 'inlineStr':
        case 'str':
        case 'd':
          value = { type: 'string', value: text };
          break;
        case 'b':
          value = { type: 'boolean', value: text === '1' };
          break;
        case 'e':
          value = { type: 'error', value: text };
          break;
        default: {
          if (text === '') break;
          const number = Number(text);
          value = Number.isFinite(number)
            ? { type: 'number', value: number, isDate: dateStyles.has(cellStyle) }
            : { type: 'string', value: text };
        }
      }
      if (value) cells[column] = value;
    };

    const scanner = new XmlScanner({
      onOpen(name, attrs) {
        switch (name) {
          case 'row': {
            const r = getAttribute(attrs, 'r');
            rowNumber = r ? Number(r) : rowNumber + 1;
            cells = [];
            column = -1;
            break;
          }
          case 'c': {
            const ref = getAttribute(attrs, 'r');
            column = ref ? columnIndex(ref) : column + 1;
            cellType = getAttribute(attrs, 't');
            cellStyle = Number(getAttribute(attrs, 's') ?? 0);
            text = '';
            break;
          }
          case 'v':
            capture = true;
            break;
          case 't':
            capture = !inPhonetic;
            break;
          case 'rPh':
            inPhonetic = true;
            break;
        }
      },
      onClose(name) {
        switch (name) {
          case 'v':
          case 't':
            capture = false;
            break;
          case 'rPh':
            inPhonetic = false;
            break;
          case 'c':
            finishCell();
            break;
          case 'row':
            ready.push({ rowNumber, cells });
            break;
        }
      },
      onText(chunk) {
        if (capture) text += chunk;
      },
    });

    // Готовые строки отдаются после каждого чанка: следующий чанк не читается, пока
    // потребитель не обработал предыдущие строки (естественное противодавление).
    try {
      for await (const chunk of stream) {
        scanner.write(chunk as string);
        if (ready.length > 0) yield* ready.splice(0, ready.length);
      }
      scanner.end();
      yield* ready.splice(0, ready.length);
    } finally {
      stream.destroy();
    }
  }

  private async openText(path: string): Promise<Readable> {
    const entry = this.entries.get(path);
    if (!entry) throw new XlsxFormatError(`В архиве нет ${path}`);
    const stream = await new Promise<Readable>((resolve, reject) => {
      this.zip.openReadStream(entry, (error, readStream) => {
        if (error) reject(new XlsxFormatError(`Не удалось прочитать ${path}: ${error.message}`));
        else resolve(readStream);
      });
    });
    stream.setEncoding('utf8');
    return stream;
  }

  private async loadWorkbook(): Promise<void> {
    const relationships = new Map<string, string>();
    await scanXml(await this.openText('xl/_rels/workbook.xml.rels'), {
      onOpen(name, attrs) {
        if (name !== 'Relationship') return;
        const id = getAttribute(attrs, 'Id');
        const target = getAttribute(attrs, 'Target');
        if (id && target) relationships.set(id, resolveTarget(target));
      },
    });

    const sheets = this.sheets;
    await scanXml(await this.openText('xl/workbook.xml'), {
      onOpen(name, attrs) {
        if (name !== 'sheet') return;
        const sheetName = getAttribute(attrs, 'name');
        const path = relationships.get(getAttribute(attrs, 'id') ?? '');
        if (sheetName === undefined || !path) {
          throw new XlsxFormatError('Не удалось сопоставить лист с его файлом');
        }
        sheets.push({ name: sheetName, path, index: sheets.length });
      },
    });
    if (sheets.length === 0) throw new XlsxFormatError('В книге нет листов');
  }

  private async loadStyles(): Promise<void> {
    if (!this.entries.has('xl/styles.xml')) return;
    const customFormats = new Map<number, string>();
    const xfFormats: number[] = [];
    let inCellXfs = false;
    await scanXml(await this.openText('xl/styles.xml'), {
      onOpen(name, attrs) {
        if (name === 'numFmt') {
          customFormats.set(
            Number(getAttribute(attrs, 'numFmtId')),
            getAttribute(attrs, 'formatCode') ?? '',
          );
        } else if (name === 'cellXfs') {
          inCellXfs = true;
        } else if (name === 'xf' && inCellXfs) {
          xfFormats.push(Number(getAttribute(attrs, 'numFmtId') ?? 0));
        }
      },
      onClose(name) {
        if (name === 'cellXfs') inCellXfs = false;
      },
    });
    xfFormats.forEach((formatId, styleIndex) => {
      const custom = customFormats.get(formatId);
      const isDate =
        custom === undefined ? BUILTIN_DATE_FORMATS.has(formatId) : isDateFormatCode(custom);
      if (isDate) this.dateStyles.add(styleIndex);
    });
  }

  private async loadSharedStrings(): Promise<void> {
    if (!this.entries.has('xl/sharedStrings.xml')) return;
    const strings = this.sharedStrings;
    let text = '';
    let capture = false;
    let inPhonetic = false;
    await scanXml(await this.openText('xl/sharedStrings.xml'), {
      onOpen(name) {
        if (name === 'si') text = '';
        else if (name === 't') capture = !inPhonetic;
        else if (name === 'rPh') inPhonetic = true;
      },
      onClose(name) {
        if (name === 't') capture = false;
        else if (name === 'rPh') inPhonetic = false;
        else if (name === 'si') strings.push(text);
      },
      onText(chunk) {
        if (capture) text += chunk;
      },
    });
  }
}
