import { describe, it, expect } from 'vitest';
import { taWrap, taPre, taIns, doMd, SYMBOLS, MD_BUTTONS, COLOR_KEYS } from './mdbar';

function makeTa(value: string, start: number, end = start): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  document.body.appendChild(ta);
  ta.value = value;
  ta.selectionStart = start;
  ta.selectionEnd = end;
  return ta;
}

function captureInput(ta: HTMLTextAreaElement): { count: number; bubbled: boolean } {
  const seen = { count: 0, bubbled: false };
  ta.addEventListener('input', () => seen.count++);
  document.body.addEventListener('input', (e) => {
    if (e.target === ta) seen.bubbled = true;
  });
  return seen;
}

describe('taWrap', () => {
  it('wraps the selection and selects the inner text', () => {
    const ta = makeTa('hello world', 6, 11);
    taWrap(ta, '**', '**', 'bold');
    expect(ta.value).toBe('hello **world**');
    expect(ta.selectionStart).toBe(8);
    expect(ta.selectionEnd).toBe(13);
    expect(ta.value.slice(ta.selectionStart, ta.selectionEnd)).toBe('world');
  });

  it('inserts the placeholder when the selection is empty', () => {
    const ta = makeTa('hello ', 6);
    taWrap(ta, '**', '**', 'bold');
    expect(ta.value).toBe('hello **bold**');
    expect(ta.value.slice(ta.selectionStart, ta.selectionEnd)).toBe('bold');
  });

  it('defaults the placeholder to empty', () => {
    const ta = makeTa('ab', 1);
    taWrap(ta, '$', '$');
    expect(ta.value).toBe('a$$b');
    expect(ta.selectionStart).toBe(2);
    expect(ta.selectionEnd).toBe(2);
  });

  it('dispatches a bubbling input event', () => {
    const ta = makeTa('x', 0, 1);
    const seen = captureInput(ta);
    taWrap(ta, '*', '*', 'italic');
    expect(seen.count).toBe(1);
    expect(seen.bubbled).toBe(true);
  });
});

describe('taPre', () => {
  it('prefixes the start of the current line', () => {
    const ta = makeTa('line1\nline2', 8);
    taPre(ta, '## ');
    expect(ta.value).toBe('line1\n## line2');
    expect(ta.selectionStart).toBe(11);
    expect(ta.selectionEnd).toBe(11);
  });

  it('prefixes the first line when the caret is on it', () => {
    const ta = makeTa('alpha', 3);
    taPre(ta, '- ');
    expect(ta.value).toBe('- alpha');
    expect(ta.selectionStart).toBe(5);
  });

  it('dispatches a bubbling input event', () => {
    const ta = makeTa('x', 0);
    const seen = captureInput(ta);
    taPre(ta, '## ');
    expect(seen.count).toBe(1);
    expect(seen.bubbled).toBe(true);
  });
});

describe('taIns', () => {
  it('inserts at the caret', () => {
    const ta = makeTa('abdef', 2);
    taIns(ta, 'c');
    expect(ta.value).toBe('abcdef');
    expect(ta.selectionStart).toBe(3);
    expect(ta.selectionEnd).toBe(3);
  });

  it('replaces the selection', () => {
    const ta = makeTa('abcdef', 2, 4);
    taIns(ta, 'α');
    expect(ta.value).toBe('abαef');
    expect(ta.selectionStart).toBe(3);
  });

  it('dispatches a bubbling input event', () => {
    const ta = makeTa('x', 1);
    const seen = captureInput(ta);
    taIns(ta, 'π');
    expect(seen.count).toBe(1);
    expect(seen.bubbled).toBe(true);
  });
});

describe('doMd', () => {
  it('maps every button key to its v1 action', () => {
    const cases: Array<[key: (typeof MD_BUTTONS)[number][0], input: string, expected: string]> = [
      ['b', 'w', '**w**'],
      ['i', 'w', '*w*'],
      ['code', 'w', '`w`'],
      ['hl', 'w', '==w=='],
      ['h', 'w', '## w'],
      ['ul', 'w', '- w'],
      ['math', 'w', '$w$'],
      ['mathb', 'w', '\n$$\nw\n$$\n'],
    ];
    for (const [key, input, expected] of cases) {
      const ta = makeTa(input, 0, input.length);
      doMd(ta, key);
      expect(ta.value, key).toBe(expected);
    }
  });

  it('uses v1 placeholders on empty selections', () => {
    const ta = makeTa('', 0);
    doMd(ta, 'b');
    expect(ta.value).toBe('**bold**');
    const ta2 = makeTa('', 0);
    doMd(ta2, 'math');
    expect(ta2.value).toBe('$x$');
  });
});

describe('button data', () => {
  it('SYMBOLS matches the v1 list', () => {
    expect(SYMBOLS).toHaveLength(46);
    expect(SYMBOLS[0]).toBe('α');
    expect(SYMBOLS).toContain('𝔼');
    expect(SYMBOLS[SYMBOLS.length - 1]).toBe('⚠️');
  });

  it('MD_BUTTONS and COLOR_KEYS match v1', () => {
    expect(MD_BUTTONS.map(([k]) => k)).toEqual(['b', 'i', 'code', 'hl', 'h', 'ul', 'math', 'mathb']);
    expect(COLOR_KEYS).toEqual(['accent', 'accent2', 'good', 'warn', 'muted']);
  });
});
