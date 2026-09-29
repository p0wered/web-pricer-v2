import { describe, expect, it } from 'vitest';
import { decodeEntities, getAttribute, XmlScanner } from './xml-scanner.ts';

function events(chunks: string[]): string[] {
  const out: string[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push(`text:${text}`);
    text = '';
  };
  const scanner = new XmlScanner({
    onOpen(name, attrs, selfClosing) {
      flush();
      out.push(`open:${name}${selfClosing ? '/' : ''}|${attrs.trim()}`);
    },
    onClose(name) {
      flush();
      out.push(`close:${name}`);
    },
    onText(chunk) {
      text += chunk;
    },
  });
  for (const chunk of chunks) scanner.write(chunk);
  scanner.end();
  flush();
  return out;
}

const SAMPLE =
  '<?xml version="1.0"?>\n<!-- комментарий -->' +
  '<x:root xmlns:x="ns"><sheet name="&gt;STOP" r:id="rId3"/>' +
  '<c r="A1" t="s" note="a>b"><v>12</v></c>' +
  '<t xml:space="preserve"> К52 &amp; «С2-33» &#1071;&#x44F; </t>' +
  '<![CDATA[<сырой>]]><empty></empty></x:root>';

describe('XmlScanner', () => {
  it('разбирает теги, атрибуты, текст, сущности, комментарии и CDATA', () => {
    expect(events([SAMPLE])).toEqual([
      'text:\n',
      'open:root|xmlns:x="ns"',
      'open:sheet/|name="&gt;STOP" r:id="rId3"',
      'close:sheet',
      'open:c|r="A1" t="s" note="a>b"',
      'open:v|',
      'text:12',
      'close:v',
      'close:c',
      'open:t|xml:space="preserve"',
      'text: К52 & «С2-33» Яя ',
      'close:t',
      'text:<сырой>',
      'open:empty|',
      'close:empty',
      'close:root',
    ]);
  });

  it('даёт тот же результат при любом разбиении потока на чанки', () => {
    const whole = events([SAMPLE]);
    for (let cut = 1; cut < SAMPLE.length; cut++) {
      expect(events([SAMPLE.slice(0, cut), SAMPLE.slice(cut)]), `разрез на ${cut}`).toEqual(whole);
    }
    expect(events([...SAMPLE])).toEqual(whole); // по одному символу
  });

  it('сообщает об оборванном документе', () => {
    const scanner = new XmlScanner({});
    scanner.write('<root><c r="A1"');
    expect(() => scanner.end()).toThrow('оборван');
  });
});

describe('getAttribute / decodeEntities', () => {
  it('находит атрибут по имени без префикса и раскодирует его', () => {
    const attrs = ' name="&gt;STOP" sheetId="3" r:id="rId3" other=\'x\'';
    expect(getAttribute(attrs, 'name')).toBe('>STOP');
    expect(getAttribute(attrs, 'id')).toBe('rId3');
    expect(getAttribute(attrs, 'other')).toBe('x');
    expect(getAttribute(attrs, 'Id')).toBeUndefined();
    expect(getAttribute(' sheetId="3"', 'Id')).toBeUndefined();
  });

  it('оставляет неизвестные сущности как есть', () => {
    expect(decodeEntities('a &nbsp; &amp; b')).toBe('a &nbsp; & b');
  });
});
