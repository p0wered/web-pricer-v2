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

/** Слово запроса после нормализации. */
export interface QueryTerm {
  /** Сжатая форма: без разделителей, в байтах индекса. */
  bytes: Uint8Array;
  /** `separatorBefore[k]` — в запросе перед k-м символом сжатой формы был разделитель. */
  separatorBefore: Uint8Array;
  /** Число в начале: перед совпадением не должно быть цифры или точки («15пф» ≠ «115пф»). */
  startsWithDigit: boolean;
  /**
   * Слово — значение с единицей («10к», «33мкф», «16вт»): после совпадения не должна идти
   * буква («10к» ≠ «10кв»).
   */
  valueWithUnit: boolean;
}

// Единицы и множители, после которых буква означает уже другое значение. Одиночные «в», «а»,
// «м», «г» сюда не входят: в названиях это часто буква типа («К52-1В», «К10-17А»).
const VALUE_WITH_UNIT = /^\d+(?:\.\d+)?(?:к|мкф|пф|нф|вт|ом|гц|кгц|мгц|кв|мв|ма|мка)$/;

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

export function parseQuery(query: string): QueryTerm[] {
  const terms: QueryTerm[] = [];
  for (const word of queryWords(query)) {
    const normalized = normalizeText(word);
    if (!normalized) continue;
    const compact = normalized.replace(/ /g, '');
    const bytes = new Uint8Array(compact.length);
    const separatorBefore = new Uint8Array(compact.length);
    for (let i = 0, k = 0; i < normalized.length; i++) {
      const byte = encodeChar(normalized.charCodeAt(i));
      if (byte < 0) {
        separatorBefore[k] = 1;
        continue;
      }
      bytes[k++] = byte;
    }
    terms.push({
      bytes,
      separatorBefore,
      startsWithDigit: /^\d/.test(compact),
      valueWithUnit: !normalized.includes(' ') && VALUE_WITH_UNIT.test(compact),
    });
  }
  return terms;
}

/** Ключ кэша: одинаковые после нормализации запросы дают одну выдачу. */
export function queryKey(terms: QueryTerm[]): string {
  return terms.map((term) => Buffer.from(term.bytes).toString('latin1')).join(' ');
}

// ---------------------------------------------------------------------------
// Сопоставление и ранжирование

export interface MatchResult {
  /** Номера совпавших позиций в индексе (не id каталога), по возрастанию. */
  items: Uint32Array;
  scores: Uint16Array;
}

const isDigit = (byte: number) => byte >= 0x30 && byte <= 0x39;
const isLetter = (byte: number) => (byte >= 0x61 && byte <= 0x7a) || byte >= CYRILLIC_BASE_BYTE;

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

  /** Первое вхождение слова в позицию, удовлетворяющее правилам границ; −1, если нет. */
  private findTerm(term: QueryTerm, start: number, end: number): number {
    const { text } = this.data;
    const bytes = term.bytes;
    const length = bytes.length;
    const first = bytes[0];
    outer: for (let p = start; p + length <= end; p++) {
      if (text[p] !== first) continue;
      for (let k = 1; k < length; k++) if (text[p + k] !== bytes[k]) continue outer;

      // Разделитель в названии внутри совпадения, которого не было в запросе, допустим только
      // если совпадение начинается с начала токена: «кт315» ↔ «КТ 315», но «мп0» ≠ «8МП 0.125».
      const startsToken = p === start || this.isTokenStart(p);
      if (!startsToken) {
        for (let k = 1; k < length; k++) {
          if (this.isTokenStart(p + k) && term.separatorBefore[k] === 0) continue outer;
        }
      }

      if (term.startsWithDigit && p > start && !this.isTokenStart(p)) {
        const before = text[p - 1] ?? 0;
        if (isDigit(before) || before === 0x2e) continue;
      }
      const after = p + length;
      if (term.valueWithUnit && after < end && !this.isTokenStart(after)) {
        if (isLetter(text[after] ?? 0)) continue;
      }
      return p;
    }
    return -1;
  }

  /** Позиции-кандидаты: пересечение списков по триграммам всех слов длиной от 3 символов. */
  private candidates(terms: QueryTerm[]): Uint32Array | null {
    const { trigramOffsets, trigramItems } = this.data;
    const slots = new Set<number>();
    for (const { bytes } of terms) {
      for (let i = 0; i + 2 < bytes.length; i++) {
        slots.add(trigramSlot(bytes[i] ?? 0, bytes[i + 1] ?? 0, bytes[i + 2] ?? 0));
      }
    }
    if (slots.size === 0) return null; // все слова короче 3 символов
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

    const check = (item: number) => {
      const start = starts[item] ?? 0;
      const end = (starts[item + 1] ?? 0) - 1;
      for (let t = 0; t < terms.length; t++) {
        const term = terms[t];
        if (!term) return;
        const position = this.findTerm(term, start, end);
        if (position < 0) return;
        positions[t] = position;
      }
      items.push(item);
      scores.push(this.score(terms, positions, start, end));
    };

    if (candidates) {
      for (let i = 0; i < candidates.length; i++) check(candidates[i] ?? 0);
    } else {
      // Все слова короче 3 символов: ищем самое длинное по всему тексту и проверяем позиции,
      // в которых оно встретилось.
      const longest = terms.reduce((a, b) => (b.bytes.length > a.bytes.length ? b : a));
      const text = Buffer.from(
        this.data.text.buffer,
        this.data.text.byteOffset,
        this.data.text.length,
      );
      let last = -1;
      for (let p = text.indexOf(longest.bytes); p >= 0; p = text.indexOf(longest.bytes, p + 1)) {
        const item = this.itemAt(p);
        if (item === last) continue;
        last = item;
        check(item);
        p = (starts[item + 1] ?? 0) - 1;
      }
    }
    return { items: Uint32Array.from(items), scores: Uint16Array.from(scores) };
  }

  private score(terms: QueryTerm[], positions: Int32Array, start: number, end: number): number {
    let score = 0;
    const first = positions[0] ?? 0;
    // Первое слово — обычно семейство детали («к52» в «к52 15пф 33ом»).
    if (first === start) score += 1000;
    else if (this.isTokenStart(first)) score += 400;

    let inOrder = true;
    for (let t = 0; t < terms.length; t++) {
      const position = positions[t] ?? 0;
      if (t > 0 && position <= (positions[t - 1] ?? 0)) inOrder = false;
      if (position === start || this.isTokenStart(position)) score += 20;
      // Конец слова: совпал с концом токена — +40; дальше идёт не цифра — +20; дальше цифра
      // (число «продолжается») — 0. Так «кт315» → «КТ315», «КТ315Г» выше, чем «КТ3151Б9».
      const after = position + (terms[t]?.bytes.length ?? 0);
      if (after >= end || this.isTokenStart(after)) score += 40;
      else if (!isDigit(this.data.text[after] ?? 0)) score += 20;
    }
    if (inOrder && terms.length > 1) score += 200;
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
