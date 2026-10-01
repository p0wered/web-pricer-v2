// Минимальный потоковый токенизатор XML для файлов внутри XLSX.
//
// Полноценный SAX-парсер здесь не нужен: XML в книге Excel машинно сгенерирован и прост
// (элементы, атрибуты, текст, сущности). Собственный токенизатор примерно вдвое быстрее
// saxes и втрое быстрее ExcelJS на полном файле.
//
// Поддерживается: открывающие / закрывающие / самозакрывающиеся теги, атрибуты в двойных
// и одинарных кавычках (в том числе со знаком «>» внутри значения), текст с сущностями,
// префиксы пространств имён (отбрасываются), пропуск <?…?>, <!--…-->, <![CDATA[…]]>.

export interface XmlHandlers {
  /** `attrs` — сырой текст атрибутов, разбирается функцией {@link getAttribute} по требованию. */
  onOpen?(name: string, attrs: string, selfClosing: boolean): void;
  onClose?(name: string): void;
  /** Текст уже раскодирован от сущностей; может приходить несколькими частями. */
  onText?(text: string): void;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const code = isHex ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

const attributePatterns = new Map<string, RegExp>();

/** Значение атрибута (раскодированное) или `undefined`. Имя — без префикса пространства имён. */
export function getAttribute(attrs: string, name: string): string | undefined {
  let pattern = attributePatterns.get(name);
  if (!pattern) {
    pattern = new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}\\s*=\\s*("([^"]*)"|'([^']*)')`);
    attributePatterns.set(name, pattern);
  }
  const match = pattern.exec(attrs);
  if (!match) return undefined;
  return decodeEntities(match[2] ?? match[3] ?? '');
}

const GT = 62; // >
const SLASH = 47; // /
const QUESTION = 63; // ?
const BANG = 33; // !
const DQUOTE = 34; // "
const SQUOTE = 39; // '

function localName(qualified: string): string {
  const colon = qualified.indexOf(':');
  return colon < 0 ? qualified : qualified.slice(colon + 1);
}

/** Позиция «>», закрывающего тег, начатый в `start`, с учётом кавычек; −1, если тег не закончен. */
function findTagEnd(buffer: string, start: number): number {
  let quote = 0;
  for (let i = start; i < buffer.length; i++) {
    const code = buffer.charCodeAt(i);
    if (quote !== 0) {
      if (code === quote) quote = 0;
    } else if (code === DQUOTE || code === SQUOTE) {
      quote = code;
    } else if (code === GT) {
      return i;
    }
  }
  return -1;
}

export class XmlScanner {
  private rest = '';
  private readonly handlers: XmlHandlers;

  constructor(handlers: XmlHandlers) {
    this.handlers = handlers;
  }

  write(chunk: string): void {
    const buffer = this.rest + chunk;
    this.rest = '';
    const { onOpen, onClose, onText } = this.handlers;
    let i = 0;

    while (i < buffer.length) {
      const lt = buffer.indexOf('<', i);
      if (lt < 0) {
        // Текст до конца чанка: он может продолжиться в следующем, поэтому придерживаем.
        this.rest = buffer.slice(i);
        return;
      }
      if (lt > i && onText) onText(decodeEntities(buffer.slice(i, lt)));

      const next = buffer.charCodeAt(lt + 1);
      if (Number.isNaN(next)) {
        this.rest = buffer.slice(lt);
        return;
      }

      if (next === BANG) {
        const end = this.skipSpecial(buffer, lt);
        if (end < 0) {
          this.rest = buffer.slice(lt);
          return;
        }
        i = end;
        continue;
      }

      const gt = next === SLASH ? buffer.indexOf('>', lt) : findTagEnd(buffer, lt + 1);
      if (gt < 0) {
        this.rest = buffer.slice(lt);
        return;
      }

      if (next === SLASH) {
        onClose?.(localName(buffer.slice(lt + 2, gt).trim()));
      } else if (next !== QUESTION) {
        const selfClosing = buffer.charCodeAt(gt - 1) === SLASH;
        const body = buffer.slice(lt + 1, selfClosing ? gt - 1 : gt);
        const space = body.search(/\s/);
        const name = localName(space < 0 ? body : body.slice(0, space));
        onOpen?.(name, space < 0 ? '' : body.slice(space), selfClosing);
        if (selfClosing) onClose?.(name);
      }
      i = gt + 1;
    }
  }

  /** Сообщает об ошибке, если документ закончился посреди тега. */
  end(): void {
    const rest = this.rest;
    this.rest = '';
    if (rest.includes('<')) throw new Error('XML оборван посреди тега');
    if (rest && this.handlers.onText) this.handlers.onText(decodeEntities(rest));
  }

  /** Пропускает комментарий, CDATA или DOCTYPE. Возвращает позицию после него или −1. */
  private skipSpecial(buffer: string, lt: number): number {
    if (buffer.startsWith('<!--', lt)) {
      const end = buffer.indexOf('-->', lt + 4);
      return end < 0 ? -1 : end + 3;
    }
    if (buffer.startsWith('<![CDATA[', lt)) {
      const end = buffer.indexOf(']]>', lt + 9);
      if (end < 0) return -1;
      this.handlers.onText?.(buffer.slice(lt + 9, end));
      return end + 3;
    }
    if (buffer.length - lt < 9) return -1;
    const end = buffer.indexOf('>', lt);
    return end < 0 ? -1 : end + 1;
  }
}

/** Прогоняет поток текста через сканер. */
export async function scanXml(source: AsyncIterable<string>, handlers: XmlHandlers): Promise<void> {
  const scanner = new XmlScanner(handlers);
  for await (const chunk of source) scanner.write(chunk);
  scanner.end();
}
