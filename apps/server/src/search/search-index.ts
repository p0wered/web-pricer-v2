// Поисковый индекс в памяти.
//
// Все данные индекса — типизированные массивы: индекс строится в worker_thread и
// передаётся в основной поток без копирования.
//
// Устройство:
// - `text` — нормализованные названия всех позиций без разделителей («сжатые»), подряд, через
//   байт-разделитель. Символы кодируются одним байтом (кириллица а–я → 0xC0–0xDF), поэтому
//   поиск подстроки — это поиск по байтам;
// - `tokenStarts` — битовая маска над `text`: 1 там, где в исходном названии начинался токен
//   (после пробела, дефиса и т. п.). Нужна для правил границ числа и для ранжирования;
// - триграммный индекс: для каждой тройки символов — отсортированный список позиций, где
//   она встречается. Кандидаты находятся пересечением списков, затем проверяются точно.
import { normalizeText } from '@webpricer/shared';

export const ITEM_SEPARATOR = 0x0a;

const CYRILLIC_A = 0x430; // «а»
const CYRILLIC_YA = 0x44f; // «я»
const CYRILLIC_BASE_BYTE = 0xc0;

/** Байт символа нормализованного текста; −1 для пробела (разделителя токенов). */
function encodeChar(code: number): number {
  if (code === 32) return -1;
  if (code >= CYRILLIC_A && code <= CYRILLIC_YA) return code - CYRILLIC_A + CYRILLIC_BASE_BYTE;
  if (code < 128) return code;
  // normalizeText оставляет только [0-9 a-z а-я . %]; сюда попадать не должно.
  return 0x3f;
}

// Коды символов для триграмм: 7 бит на символ.
const SYMBOL_OF_BYTE = new Uint8Array(256);
{
  let next = 1;
  const add = (byte: number) => (SYMBOL_OF_BYTE[byte] = next++);
  for (let byte = 0x30; byte <= 0x39; byte++) add(byte); // 0–9
  add(0x2e); // .
  add(0x25); // %
  add(0x3f); // ?
  for (let byte = 0x61; byte <= 0x7a; byte++) add(byte); // a–z
  for (let byte = 0xc0; byte <= 0xdf; byte++) add(byte); // а–я
}
const SYMBOL_BITS = 7;
export const TRIGRAM_SLOTS = 1 << (SYMBOL_BITS * 3);

function trigramSlot(a: number, b: number, c: number): number {
  const sa = SYMBOL_OF_BYTE[a] ?? 0;
  const sb = SYMBOL_OF_BYTE[b] ?? 0;
  const sc = SYMBOL_OF_BYTE[c] ?? 0;
  if (sa === 0 || sb === 0 || sc === 0) return -1;
  return (sa << (SYMBOL_BITS * 2)) | (sb << SYMBOL_BITS) | sc;
}

export type ItemKind = 'main' | 'special';

export interface IndexItem {
  id: number;
  name: string;
  kind: ItemKind;
  /** Позиция листа в книге: порядок групп стоп-листа. */
  sheetOrder: number;
  price: number | null;
  quantity?: number | null;
}

export interface SearchIndexData {
  count: number;
  text: Uint8Array;
  /** Начало каждой позиции в `text`; `starts[count]` — конец текста. */
  starts: Uint32Array;
  tokenStarts: Uint8Array;
  ids: Uint32Array;
  /** 0 — детали, 1 — стоп-лист. */
  kinds: Uint8Array;
  sheetOrders: Uint16Array;
  /** NaN — цены нет. */
  prices: Float64Array;
  /** NaN — количества нет. Float32: точности хватает для сортировки, памяти вдвое меньше. */
  quantities: Float32Array;
  /** Место позиции в алфавитном порядке названий и обратное отображение. */
  nameRanks: Uint32Array;
  byNameRank: Uint32Array;
  trigramOffsets: Uint32Array;
  trigramItems: Uint32Array;
}

/** Все буферы индекса — для передачи из worker_thread без копирования. */
export function transferList(data: SearchIndexData): ArrayBuffer[] {
  return [
    data.text,
    data.starts,
    data.tokenStarts,
    data.ids,
    data.kinds,
    data.sheetOrders,
    data.prices,
    data.quantities,
    data.nameRanks,
    data.byNameRank,
    data.trigramOffsets,
    data.trigramItems,
  ].map((array) => array.buffer as ArrayBuffer);
}

class ByteBuffer {
  bytes = new Uint8Array(1 << 20);
  length = 0;

  push(byte: number): void {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = byte;
  }
}

/** Накопление позиций и построение индекса. Позиции добавляются в порядке id. */
export class SearchIndexBuilder {
  private readonly text = new ByteBuffer();
  private readonly tokenStartPositions: number[] = [];
  private readonly starts: number[] = [];
  private readonly ids: number[] = [];
  private readonly kinds: number[] = [];
  private readonly sheetOrders: number[] = [];
  private readonly prices: number[] = [];
  private readonly quantities: number[] = [];
  private readonly names: string[] = [];

  add(item: IndexItem): void {
    this.starts.push(this.text.length);
    this.ids.push(item.id);
    this.kinds.push(item.kind === 'special' ? 1 : 0);
    this.sheetOrders.push(item.sheetOrder);
    this.prices.push(item.price ?? Number.NaN);
    this.quantities.push(item.quantity ?? Number.NaN);
    this.names.push(item.name.toLowerCase());

    const normalized = normalizeText(item.name);
    let atTokenStart = true;
    for (let i = 0; i < normalized.length; i++) {
      const byte = encodeChar(normalized.charCodeAt(i));
      if (byte < 0) {
        atTokenStart = true;
        continue;
      }
      if (atTokenStart) this.tokenStartPositions.push(this.text.length);
      atTokenStart = false;
      this.text.push(byte);
    }
    this.text.push(ITEM_SEPARATOR);
  }

  build(): SearchIndexData {
    const count = this.ids.length;
    const text = this.text.bytes.slice(0, this.text.length);
    const starts = new Uint32Array(count + 1);
    starts.set(this.starts);
    starts[count] = text.length;

    const tokenStarts = new Uint8Array((text.length >> 3) + 1);
    for (const position of this.tokenStartPositions) {
      const byte = position >> 3;
      tokenStarts[byte] = (tokenStarts[byte] ?? 0) | (1 << (position & 7));
    }

    const order = Array.from({ length: count }, (_, index) => index);
    const names = this.names;
    order.sort((a, b) => {
      const nameA = names[a] ?? '';
      const nameB = names[b] ?? '';
      return nameA < nameB ? -1 : nameA > nameB ? 1 : a - b;
    });
    const byNameRank = Uint32Array.from(order);
    const nameRanks = new Uint32Array(count);
    byNameRank.forEach((item, rank) => (nameRanks[item] = rank));

    const { trigramOffsets, trigramItems } = buildTrigrams(text, starts, count);

    return {
      count,
      text,
      starts,
      tokenStarts,
      ids: Uint32Array.from(this.ids),
      kinds: Uint8Array.from(this.kinds),
      sheetOrders: Uint16Array.from(this.sheetOrders, (order) => Math.min(order, 65535)),
      prices: Float64Array.from(this.prices),
      quantities: Float32Array.from(this.quantities),
      nameRanks,
      byNameRank,
      trigramOffsets,
      trigramItems,
    };
  }
}

/** Списки позиций по триграммам (формат CSR). Каждая позиция в списке — один раз. */
function buildTrigrams(text: Uint8Array, starts: Uint32Array, count: number) {
  const counts = new Uint32Array(TRIGRAM_SLOTS + 1);
  const lastItem = new Int32Array(TRIGRAM_SLOTS).fill(-1);

  const forEachTrigram = (visit: (slot: number, item: number) => void) => {
    for (let item = 0; item < count; item++) {
      const end = (starts[item + 1] ?? 0) - 1; // байт-разделитель не входит
      for (let p = starts[item] ?? 0; p + 2 < end; p++) {
        const slot = trigramSlot(text[p] ?? 0, text[p + 1] ?? 0, text[p + 2] ?? 0);
        if (slot < 0 || lastItem[slot] === item) continue;
        lastItem[slot] = item;
        visit(slot, item);
      }
    }
  };

  forEachTrigram((slot) => {
    counts[slot + 1] = (counts[slot + 1] ?? 0) + 1;
  });
  for (let slot = 1; slot <= TRIGRAM_SLOTS; slot++) {
    counts[slot] = (counts[slot] ?? 0) + (counts[slot - 1] ?? 0);
  }
  const trigramOffsets = counts;
  const trigramItems = new Uint32Array(trigramOffsets[TRIGRAM_SLOTS] ?? 0);
  const fill = trigramOffsets.slice(0, TRIGRAM_SLOTS);
  lastItem.fill(-1);
  forEachTrigram((slot, item) => {
    const position = fill[slot] ?? 0;
    trigramItems[position] = item;
    fill[slot] = position + 1;
  });
  return { trigramOffsets, trigramItems };
}

// ---------------------------------------------------------------------------
// Запрос
//
// Запрос делится на слова по пробелам; слова ищутся в названии в любом порядке. Внутри слова
// работают операторы (пожелания заказчика, docs/customer-feedback-2026-10.md):
//   ?  — ровно один любой символ: «рс?тв» → РС4ТВ, РС-7ТВ, но не РСТВ;
//   _  — любые символы, в том числе ни одного. Части слова между «_» идут в названии по порядку:
//        «с2-33_1_10» → «С2-33Н 1 Вт 10 кОм», «С2-33-1-10». Число в части после «_» ищется
//        целиком: «1» находит «1Вт», «1 кОм», «-1-», но не 15, 1.2, 0.125;
//   ^  — в начале части: совпадение начинается с начала слова в названии («^кнр» ≠ 2КНР);
//   $  — в конце части: совпадение заканчивается концом слова («140уд6$» ≠ 140УД601, но находит
//        «140УД6 (87г)»).
// В названиях эти символы — разделители, поэтому как операторы в запросе ничего не теряют.

/** Байт `?` в части запроса: совпадает с любым символом названия (в тексте индекса нулей нет). */
const WILDCARD = 0x00;
const DOT = 0x2e;

/** Часть слова запроса (между `_`): ищется в названии сплошным куском. */
export interface QueryPart {
  /** Сжатая форма: без разделителей, в байтах индекса; `?` — `WILDCARD`. */
  bytes: Uint8Array;
  /** `separatorBefore[k]` — в запросе перед k-м символом сжатой формы был разделитель. */
  separatorBefore: Uint8Array;
  /** Есть `?` — без них сравнение идёт быстрым путём, как до операторов. */
  hasWildcard: boolean;
  /** Число в начале: перед совпадением не должно быть цифры или точки («15пф» ≠ «115пф»). */
  startsWithDigit: boolean;
  /**
   * Часть — значение с единицей («10к», «33мкф», «16вт»): после совпадения не должна идти
   * буква («10к» ≠ «10кв»).
   */
  valueWithUnit: boolean;
  /** Число после `_`: ищется целиком — после совпадения число не продолжается («1» ≠ «15», «1.2»). */
  wholeNumber: boolean;
  /** `^` — совпадение начинается с начала слова в названии. */
  atWordStart: boolean;
  /** `$` — совпадение заканчивается концом слова в названии. */
  atWordEnd: boolean;
}

/** Слово запроса: части по порядку; без `_` — одна часть. */
export interface QueryTerm {
  parts: QueryPart[];
}

// Единицы и множители, после которых буква означает уже другое значение. Одиночные «в», «а»,
// «м», «г» сюда не входят: в названиях это часто буква типа («К52-1В», «К10-17А»).
const VALUE_WITH_UNIT = /^\d+(?:\.\d+)?(?:к|мкф|пф|нф|вт|ом|гц|кгц|мгц|кв|мв|ма|мка)$/;
const NUMBER = /^\d+(?:\.\d+)?$/;

// Единица, написанная отдельным словом после числа: «33 мкФ», «1,5 кОм», «50 V».
const UNIT_WORD =
  /^(?:мкф|мк|пф|нф|ком|мом|ом|в|вт|ма|мка|гц|кгц|мгц|кв|мв|uf|µf|μf|pf|nf|kohm|mohm|ohm|v|w|hz|khz|mhz)\.?$/i;

/** Слова запроса; единица после числа присоединяется к нему: «33 uF» → «33uF». */
function queryWords(query: string): string[] {
  const words: string[] = [];
  for (const word of query.split(/\s+/)) {
    if (!word) continue;
    const previous = words.at(-1);
    if (previous !== undefined && /\d$/.test(previous) && UNIT_WORD.test(word)) {
      words[words.length - 1] = previous + word;
    } else {
      words.push(word);
    }
  }
  return words;
}

/** Символ, который нормализация превращает в разделитель (дефис, скобка, запятая…). */
const isSeparatorChar = (char: string | undefined) =>
  char !== undefined && normalizeText(char) === '';

/** Часть слова между `_`; `null`, если в ней нет ни одного символа. */
function parsePart(raw: string, afterGap: boolean): QueryPart | null {
  const atWordStart = raw.startsWith('^');
  const atWordEnd = raw.endsWith('$');
  // `^` и `$` не на краю части смысла не имеют — там они просто разделители.
  const text = raw.replace(/^\^+/, '').replace(/\$+$/, '').replace(/[\^$]/g, ' ');

  // Куски между `?` нормализуются по отдельности, между ними — WILDCARD.
  const bytes: number[] = [];
  const separatorBefore: number[] = [];
  let separator = false;
  const push = (byte: number) => {
    separatorBefore.push(separator && bytes.length > 0 ? 1 : 0);
    separator = false;
    bytes.push(byte);
  };
  text.split('?').forEach((segment, s) => {
    if (s > 0) push(WILDCARD);
    if (isSeparatorChar(segment[0])) separator = true;
    const normalized = normalizeText(segment);
    for (let i = 0; i < normalized.length; i++) {
      const byte = encodeChar(normalized.charCodeAt(i));
      if (byte < 0) separator = true;
      else push(byte);
    }
    if (isSeparatorChar(segment.at(-1))) separator = true;
  });
  if (bytes.length === 0) return null;

  const hasWildcard = bytes.includes(WILDCARD);
  const normalized = hasWildcard ? '' : normalizeText(text);
  const singleToken = !hasWildcard && !normalized.includes(' ');
  return {
    bytes: Uint8Array.from(bytes),
    separatorBefore: Uint8Array.from(separatorBefore),
    hasWildcard,
    startsWithDigit: isDigit(bytes[0] ?? 0),
    valueWithUnit: singleToken && VALUE_WITH_UNIT.test(normalized),
    wholeNumber: afterGap && singleToken && NUMBER.test(normalized),
    atWordStart,
    atWordEnd,
  };
}

export function parseQuery(query: string): QueryTerm[] {
  const terms: QueryTerm[] = [];
  for (const word of queryWords(query)) {
    const parts: QueryPart[] = [];
    word.split('_').forEach((raw, i) => {
      const part = parsePart(raw, i > 0);
      if (part) parts.push(part);
    });
    // Слово из одних операторов («?», «^_») нашло бы весь каталог — пропускаем.
    if (parts.some((part) => part.bytes.some((byte) => byte !== WILDCARD))) terms.push({ parts });
  }
  return terms;
}

function partKey(part: QueryPart): string {
  let key = part.wholeNumber ? '#' : '';
  if (part.atWordStart) key += '^';
  part.bytes.forEach((byte, k) => {
    if (part.separatorBefore[k]) key += '-';
    key += byte === WILDCARD ? '?' : String.fromCharCode(byte);
  });
  return part.atWordEnd ? `${key}$` : key;
}

/**
 * Ключ кэша: одинаковые после нормализации запросы дают одну выдачу. Разделители внутри слова
 * входят в ключ — они влияют на склейку токенов («мп-0» находит больше, чем «мп0»).
 */
export function queryKey(terms: QueryTerm[]): string {
  return terms.map((term) => term.parts.map(partKey).join('_')).join(' ');
}

/** Самый длинный кусок запроса без `?` — для поиска перебором. */
function longestLiteral(terms: QueryTerm[]): Uint8Array {
  let best: Uint8Array = new Uint8Array(0);
  for (const term of terms) {
    for (const { bytes } of term.parts) {
      let runStart = 0;
      for (let i = 0; i <= bytes.length; i++) {
        if (i < bytes.length && bytes[i] !== WILDCARD) continue;
        if (i - runStart > best.length) best = bytes.subarray(runStart, i);
        runStart = i + 1;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Сопоставление и ранжирование

export interface MatchResult {
  /** Номера совпавших позиций в индексе (не id каталога), по возрастанию. */
  items: Uint32Array;
  scores: Uint16Array;
}

function isDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39;
}

function isLetter(byte: number): boolean {
  return (byte >= 0x61 && byte <= 0x7a) || byte >= CYRILLIC_BASE_BYTE;
}

export class SearchIndex {
  readonly data: SearchIndexData;

  constructor(data: SearchIndexData) {
    this.data = data;
  }

  get count(): number {
    return this.data.count;
  }

  /** Номер позиции, которой принадлежит байт `position` текста (двоичный поиск). */
  private itemAt(position: number): number {
    const { starts, count } = this.data;
    let low = 0;
    let high = count - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((starts[middle] ?? 0) <= position) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  private isTokenStart(position: number): boolean {
    return ((this.data.tokenStarts[position >> 3] ?? 0) & (1 << (position & 7))) !== 0;
  }

  /**
   * Первое вхождение части в позицию (не раньше `from`), удовлетворяющее правилам границ;
   * −1, если нет. `start`/`end` — границы позиции в тексте.
   *
   * Цикл по байтам — самое горячее место поиска, поэтому для частей без `?` он отдельный и такой
   * же простой, как до операторов; правила границ проверяются только на совпавших байтах.
   */
  private findPart(part: QueryPart, from: number, start: number, end: number): number {
    const { text } = this.data;
    const { bytes } = part;
    const length = bytes.length;
    const first = bytes[0];
    if (!part.hasWildcard) {
      outer: for (let p = from; p + length <= end; p++) {
        if (text[p] !== first) continue;
        for (let k = 1; k < length; k++) if (text[p + k] !== bytes[k]) continue outer;
        if (this.fitsBounds(part, p, start, end)) return p;
      }
      return -1;
    }
    outer: for (let p = from; p + length <= end; p++) {
      if (first !== WILDCARD && text[p] !== first) continue;
      for (let k = 1; k < length; k++) {
        const byte = bytes[k];
        if (byte !== WILDCARD && text[p + k] !== byte) continue outer;
      }
      if (this.fitsBounds(part, p, start, end)) return p;
    }
    return -1;
  }

  /** Правила границ для совпадения части в позиции `p` (байты уже совпали). */
  private fitsBounds(part: QueryPart, p: number, start: number, end: number): boolean {
    const { text } = this.data;
    const length = part.bytes.length;
    const startsToken = p === start || this.isTokenStart(p);
    if (part.atWordStart && !startsToken) return false;
    if (!startsToken) {
      // Разделитель в названии внутри совпадения, которого не было в запросе, допустим только
      // если совпадение начинается с начала токена: «кт315» ↔ «КТ 315», но «мп0» ≠ «8МП 0.125».
      for (let k = 1; k < length; k++) {
        if (this.isTokenStart(p + k) && part.separatorBefore[k] === 0) return false;
      }
      if (part.startsWithDigit) {
        const before = text[p - 1] ?? 0;
        if (isDigit(before) || before === DOT) return false;
      }
    }

    // Правила конца совпадения есть не у каждой части — проверяем, только если нужно.
    if (part.atWordEnd || part.valueWithUnit || part.wholeNumber) {
      const after = p + length;
      const endsToken = after >= end || this.isTokenStart(after);
      if (part.atWordEnd && !endsToken) return false;
      if (!endsToken) {
        const next = text[after] ?? 0;
        if (part.valueWithUnit && isLetter(next)) return false;
        if (part.wholeNumber && (isDigit(next) || next === DOT)) return false;
      }
    }
    return true;
  }

  /**
   * Вхождение слова: части по порядку, каждая — первое подходящее вхождение после предыдущей
   * (для шаблонов с `_` это точный ответ: правила границ зависят только от места самой части).
   * Возвращает начало первой части, конец последней пишет в `ends[t]`; −1, если слова нет.
   */
  private findTerm(term: QueryTerm, start: number, end: number, ends: Int32Array, t: number) {
    const { parts } = term;
    let from = start;
    let first = -1;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as QueryPart;
      const position = this.findPart(part, from, start, end);
      if (position < 0) return -1;
      if (first < 0) first = position;
      from = position + part.bytes.length;
    }
    ends[t] = from;
    return first;
  }

  /** Позиции-кандидаты: пересечение списков по триграммам всех кусков запроса без `?`. */
  private candidates(terms: QueryTerm[]): Uint32Array | null {
    const { trigramOffsets, trigramItems } = this.data;
    const slots = new Set<number>();
    for (const term of terms) {
      for (const { bytes } of term.parts) {
        for (let i = 0; i + 2 < bytes.length; i++) {
          const a = bytes[i] ?? 0;
          const b = bytes[i + 1] ?? 0;
          const c = bytes[i + 2] ?? 0;
          if (a === WILDCARD || b === WILDCARD || c === WILDCARD) continue;
          slots.add(trigramSlot(a, b, c));
        }
      }
    }
    if (slots.size === 0) return null; // нет кусков от 3 символов
    if (slots.has(-1)) return new Uint32Array(0);

    const lists = [...slots]
      .map((slot) => trigramItems.subarray(trigramOffsets[slot], trigramOffsets[slot + 1]))
      .sort((a, b) => a.length - b.length);

    let result: Uint32Array = lists[0] ?? new Uint32Array(0);
    for (let l = 1; l < lists.length && result.length > 0; l++) {
      const other = lists[l] ?? new Uint32Array(0);
      const next = new Uint32Array(result.length);
      let size = 0;
      let j = 0;
      for (let i = 0; i < result.length; i++) {
        const value = result[i] ?? 0;
        while (j < other.length && (other[j] ?? 0) < value) j++;
        if (j >= other.length) break;
        if (other[j] === value) next[size++] = value;
      }
      result = next.subarray(0, size);
    }
    return result;
  }

  /**
   * Все позиции, в которых найдены все слова запроса, с оценкой релевантности.
   * `useIndex: false` — без триграммного индекса (для тестов и замеров).
   */
  match(terms: QueryTerm[], { useIndex = true }: { useIndex?: boolean } = {}): MatchResult {
    if (terms.length === 0) return { items: new Uint32Array(0), scores: new Uint16Array(0) };
    const { starts } = this.data;
    const candidates = useIndex ? this.candidates(terms) : null;

    const items: number[] = [];
    const scores: number[] = [];
    const positions = new Int32Array(terms.length);
    const ends = new Int32Array(terms.length);

    const check = (item: number) => {
      const start = starts[item] ?? 0;
      const end = (starts[item + 1] ?? 0) - 1;
      for (let t = 0; t < terms.length; t++) {
        const term = terms[t];
        if (!term) return;
        // Слово из одной части (без `_`) — почти все запросы: ищем часть напрямую, без
        // промежуточного вызова (на широких запросах это заметно по времени).
        let position: number;
        const single = term.parts.length === 1 ? term.parts[0] : undefined;
        if (single) {
          position = this.findPart(single, start, start, end);
          ends[t] = position + single.bytes.length;
        } else {
          position = this.findTerm(term, start, end, ends, t);
        }
        if (position < 0) return;
        positions[t] = position;
      }
      items.push(item);
      scores.push(this.score(positions, ends, start, end));
    };

    if (candidates) {
      for (let i = 0; i < candidates.length; i++) check(candidates[i] ?? 0);
    } else {
      // Нет кусков от 3 символов: ищем самый длинный кусок по всему тексту и проверяем позиции,
      // в которых он встретился.
      const literal = longestLiteral(terms);
      const text = Buffer.from(
        this.data.text.buffer,
        this.data.text.byteOffset,
        this.data.text.length,
      );
      let last = -1;
      for (let p = text.indexOf(literal); p >= 0; p = text.indexOf(literal, p + 1)) {
        const item = this.itemAt(p);
        if (item === last) continue;
        last = item;
        check(item);
        p = (starts[item + 1] ?? 0) - 1;
      }
    }
    return { items: Uint32Array.from(items), scores: Uint16Array.from(scores) };
  }

  private score(positions: Int32Array, ends: Int32Array, start: number, end: number): number {
    let score = 0;
    const first = positions[0] ?? 0;
    // Первое слово — обычно семейство детали («к52» в «к52 15пф 33ом»).
    if (first === start) score += 1000;
    else if (this.isTokenStart(first)) score += 400;

    let inOrder = true;
    for (let t = 0; t < positions.length; t++) {
      const position = positions[t] ?? 0;
      if (t > 0 && position <= (positions[t - 1] ?? 0)) inOrder = false;
      if (position === start || this.isTokenStart(position)) score += 20;
      // Конец слова: совпал с концом токена — +40; дальше идёт не цифра — +20; дальше цифра
      // (число «продолжается») — 0. Так «кт315» → «КТ315», «КТ315Г» выше, чем «КТ3151Б9».
      const after = ends[t] ?? 0;
      if (after >= end || this.isTokenStart(after)) score += 40;
      else if (!isDigit(this.data.text[after] ?? 0)) score += 20;
    }
    if (inOrder && positions.length > 1) score += 200;
    return Math.min(score, MAX_SCORE);
  }
}

const MAX_SCORE = 4095;
const LENGTH_SLOTS = 256;
const MAX_SHEET_ORDER = 4000;

export type ResultList = ItemKind;
export type ResultSort = 'relevance' | 'price_asc' | 'price_desc' | 'qty_asc' | 'qty_desc';

/**
 * Упорядоченные id каталога для одной таблицы выдачи.
 * Релевантность: оценка ↓, длина названия ↑, название по алфавиту. В стоп-листе сначала
 * группа (порядок листов в книге). Сортировка по цене или количеству: позиции без значения —
 * в конце, при равном значении — по релевантности.
 */
export function orderResults(
  index: SearchIndex,
  match: MatchResult,
  list: ResultList,
  sort: ResultSort,
): Uint32Array {
  const { kinds, starts, nameRanks, byNameRank, sheetOrders, prices, quantities, ids, count } =
    index.data;
  const wantKind = list === 'special' ? 1 : 0;
  const total = Math.max(count, 1);

  // Ключ релевантности — одно целое число (< 2^53): сортировка без сравнения строк.
  const keys: number[] = [];
  const itemsOfList: number[] = [];
  for (let i = 0; i < match.items.length; i++) {
    const item = match.items[i] ?? 0;
    if (kinds[item] !== wantKind) continue;
    const length = Math.min((starts[item + 1] ?? 0) - (starts[item] ?? 0), LENGTH_SLOTS - 1);
    let key =
      ((MAX_SCORE - (match.scores[i] ?? 0)) * LENGTH_SLOTS + length) * total +
      (nameRanks[item] ?? 0);
    if (list === 'special') {
      key +=
        Math.min(sheetOrders[item] ?? 0, MAX_SHEET_ORDER) *
        ((MAX_SCORE + 1) * LENGTH_SLOTS * total);
    }
    keys.push(key);
    itemsOfList.push(item);
  }

  const result = new Uint32Array(keys.length);
  if (sort === 'relevance') {
    const sorted = Float64Array.from(keys).sort();
    for (let i = 0; i < sorted.length; i++) {
      const rank = (sorted[i] ?? 0) % total;
      result[i] = ids[byNameRank[rank] ?? 0] ?? 0;
    }
    return result;
  }

  const values = sort === 'price_asc' || sort === 'price_desc' ? prices : quantities;
  const direction = sort === 'price_asc' || sort === 'qty_asc' ? 1 : -1;
  const order = Array.from(keys.keys());
  const groupSize = (MAX_SCORE + 1) * LENGTH_SLOTS * total;
  order.sort((a, b) => {
    const keyA = keys[a] ?? 0;
    const keyB = keys[b] ?? 0;
    if (list === 'special') {
      const groupDiff = Math.floor(keyA / groupSize) - Math.floor(keyB / groupSize);
      if (groupDiff !== 0) return groupDiff;
    }
    const valueA = values[itemsOfList[a] ?? 0] ?? Number.NaN;
    const valueB = values[itemsOfList[b] ?? 0] ?? Number.NaN;
    const missingA = Number.isNaN(valueA);
    const missingB = Number.isNaN(valueB);
    if (missingA !== missingB) return missingA ? 1 : -1;
    if (!missingA && valueA !== valueB) return (valueA - valueB) * direction;
    return keyA - keyB;
  });
  order.forEach((position, i) => (result[i] = ids[itemsOfList[position] ?? 0] ?? 0));
  return result;
}
