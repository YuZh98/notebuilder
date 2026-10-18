import { describe, it, expect } from 'vitest';
import { wellFormed, wellFormedDeep } from './well-formed';

const isWellFormed = (s: string): boolean => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe('wellFormed', () => {
  it('replaces a lone high surrogate with U+FFFD', () => {
    expect(wellFormed('A\uD83EB')).toBe('A�B');
    expect(wellFormed('\uD83E')).toBe('�');
    expect(wellFormed('end\uD83E')).toBe('end�');
  });

  it('replaces a lone low surrogate with U+FFFD', () => {
    expect(wellFormed('A\uDD14B')).toBe('A�B');
    expect(wellFormed('\uDD14\uDD14')).toBe('��');
  });

  it('keeps valid surrogate pairs (astral characters) untouched', () => {
    expect(wellFormed('🧮 x 😀')).toBe('🧮 x 😀');
    expect(wellFormed('🧮')).toBe('🧮');
  });

  it('handles a pair next to lone halves', () => {
    // high, high+low (a pair), low, low
    expect(wellFormed('\uD83E🧮\uDDEE')).toBe('�🧮�');
    expect(wellFormed('\uDDEE🧮')).toBe('�🧮');
  });

  it('returns the same string when there is nothing to fix', () => {
    const s = 'plain ascii, ünïcödé, 数学';
    expect(wellFormed(s)).toBe(s);
  });

  it('always produces a string that encodes as valid UTF-8', () => {
    const nasty = 'a\uD800b\uDFFFc𐀀d\uDBFF';
    const out = wellFormed(nasty);
    expect(isWellFormed(out)).toBe(true);
    expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(out))).toBe(out);
  });

  it('passes non-strings through (runtime defence)', () => {
    expect(wellFormed(null as unknown as string)).toBeNull();
    expect(wellFormed(undefined as unknown as string)).toBeUndefined();
  });
});

describe('wellFormedDeep', () => {
  it('fixes every string in nested arrays and objects, keys included', () => {
    const input = JSON.parse('{"name":"N\\ud83e","list":["\\udd14",1,true,null],"o":{"k\\ud800":{"x":"y\\udfff"}}}');
    const out = wellFormedDeep(input) as Record<string, unknown>;
    expect(out).toEqual({ name: 'N�', list: ['�', 1, true, null], o: { 'k�': { x: 'y�' } } });
    expect(isWellFormed(JSON.stringify(out))).toBe(true);
  });

  it('does not mutate its input', () => {
    const input = { a: ['\uD83E'], b: { c: '\uDD14' } };
    const before = JSON.stringify(input);
    wellFormedDeep(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps a "__proto__" key as plain data, never as the prototype', () => {
    const input = JSON.parse('{"__proto__":{"polluted":"\\ud83e"},"ok":1}');
    const out = wellFormedDeep(input) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
    expect((out as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')?.value).toEqual({ polluted: '�' });
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('leaves numbers, booleans and null alone', () => {
    expect(wellFormedDeep(3)).toBe(3);
    expect(wellFormedDeep(false)).toBe(false);
    expect(wellFormedDeep(null)).toBeNull();
  });
});
