// Перевод текста, набранного в английской раскладке, в русскую (кнопка EN→RU, как в старой
// версии: «rn315» → «кт315»). Символы, которых нет в раскладке (цифры, дефис), не меняются.

const EN_TO_RU: Record<string, string> = {
  q: 'й',
  w: 'ц',
  e: 'у',
  r: 'к',
  t: 'е',
  y: 'н',
  u: 'г',
  i: 'ш',
  o: 'щ',
  p: 'з',
  '[': 'х',
  ']': 'ъ',
  a: 'ф',
  s: 'ы',
  d: 'в',
  f: 'а',
  g: 'п',
  h: 'р',
  j: 'о',
  k: 'л',
  l: 'д',
  ';': 'ж',
  "'": 'э',
  z: 'я',
  x: 'ч',
  c: 'с',
  v: 'м',
  b: 'и',
  n: 'т',
  m: 'ь',
  ',': 'б',
  '.': 'ю',
  '`': 'ё',
  '/': '.',
  '?': ',',
};

export function enToRu(text: string): string {
  let result = '';
  for (const char of text) {
    const lower = char.toLowerCase();
    const converted = EN_TO_RU[lower];
    if (converted === undefined) result += char;
    else result += char === lower ? converted : converted.toUpperCase();
  }
  return result;
}

/**
 * Новое значение поля с учётом режима EN→RU: переводится только дописанная в конец часть
 * (набор и вставка), правка в середине остаётся как есть — как в старой версии.
 */
export function applyLayoutConversion(previous: string, next: string, enabled: boolean): string {
  if (!enabled || next.length <= previous.length || !next.startsWith(previous)) return next;
  return previous + enToRu(next.slice(previous.length));
}
