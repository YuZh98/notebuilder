import { describe, it, expect } from 'vitest';
import { taWrap, taPre, taIns, doMd, barPosition, SYMBOLS, MD_BUTTONS, COLOR_KEYS } from './mdbar';

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

// #mdbar is position:fixed inside the zoomed <body>, so the field's client rect has to be
// converted before it becomes left/top — otherwise the bar renders `zoom`x away from its field.
describe('barPosition', () => {
  const field = (left: number, top: number) => ({ left, top }) as DOMRect;

  it('sits at the field, a row above it, at zoom 1', () => {
    expect(barPosition(field(777, 492), 1600, 1)).toEqual({ left: 777, top: 452 });
  });

  it('converts the field rect into the zoomed space it writes into', () => {
    // Same field at 150%: its rect reads 1.5x, the write must not.
    expect(barPosition(field(1165.5, 738), 2400, 1.5)).toEqual({ left: 777, top: 452 });
  });

  it('keeps the 6px gutter and the 60px ceiling in bar space', () => {
    expect(barPosition(field(0, 0), 2400, 1.5)).toEqual({ left: 6, top: 60 });
    expect(barPosition(field(-90, 90), 2400, 1.5)).toEqual({ left: 6, top: 60 });
  });

  it('clamps against the logical viewport width, not the device one', () => {
    // 2400 viewport px at 150% is a 1600px-wide page: the right stop is 1600-260.
    expect(barPosition(field(2400, 900), 2400, 1.5)).toEqual({ left: 1340, top: 560 });
    expect(barPosition(field(1600, 600), 1600, 1)).toEqual({ left: 1340, top: 560 });
  });
});
