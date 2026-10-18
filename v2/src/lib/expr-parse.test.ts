import { describe, it, expect } from 'vitest';
import { parseExpr, evalExpr, EXPR_BUILTINS } from './expr';
import { extractReads } from './slots/identifiers';

describe('parseExpr — accepted expressions', () => {
  it('reports free identifiers in first-seen order, deduplicated', () => {
    expect(parseExpr('a*b + a').identifiers).toEqual(['a', 'b']);
  });

  it('does not report constants as identifiers', () => {
    expect(parseExpr('pi*r^2 + e - true + false').identifiers).toEqual(['r']);
  });

  it('reports called function names separately', () => {
    const r = parseExpr('sqrt(x) + max(x, y, 2) + sqrt(y)');
    expect(r.identifiers).toEqual(['x', 'y']);
    expect(r.functions).toEqual(['sqrt', 'max']);
  });

  it('accepts every operator evalExpr supports', () => {
    for (const src of [
      '1 + 2 - 3 * 4 / 5 % 6 // 7 ^ 8',
      'a || b && c',
      'a == b != c',
      'a < b <= c > d >= e',
      '-a', '!a', '- -a', '!(a > b)',
      'a > 2 ? 10 : 20',
      'a ? b : c ? d : e',
      'a ? b ? 1 : 2 : 3',
      '7 mod 3', '7 MOD 3',
      '1.', '.5', '0.25',
      'clamp(x, 0, 1)', 'pow(2, 3)', 'min(1)', 'max(1, 2, 3, 4)',
    ]) {
      expect(() => parseExpr(src), src).not.toThrow();
    }
  });

  it('accepts exactly what evalExpr evaluates the intended way', () => {
    const cases: [string, Record<string, number>, number | boolean][] = [
      ['a*b', { a: 3, b: 7 }, 21],
      ['2^3^2', {}, 512],
      ['(2+3)*4', {}, 20],
      ['7 mod 3', {}, 1],
      ['7 // 2', {}, 3],
      ['x > 2 ? 10 : 20', { x: 5 }, 10],
      ['-2^2', {}, 4],
      ['sqrt(a^2 + b^2)', { a: 3, b: 4 }, 5],
    ];
    for (const [src, scope, want] of cases) {
      expect(() => parseExpr(src), src).not.toThrow();
      expect(evalExpr(src, scope), src).toBe(want);
    }
  });
});

describe('parseExpr — rejected expressions (evalExpr would silently return 0 or a wrong value)', () => {
  const bad: [string, RegExp][] = [
    ['', /empty/i],
    ['   ', /empty/i],
    ['1+', /end of expression/i],
    ['(1+2', /\)/],
    ['1+2)', /unexpected/i],
    ['a b', /unexpected/i],
    ['*3', /unexpected/i],
    ['@#$', /unexpected character/i],
    ['a = b', /==/],
    ['a & b', /&&/],
    ['a | b', /\|\|/],
    ['1.2.3', /malformed number/i],
    ['.', /malformed number/i],
    ['2x', /missing operator/i],
    ['1e3', /scientific/i],
    ['a ? b', /:/],
    ['a ? b c', /:/],
    ['max(1,)', /unexpected/i],
    ['max(1 2)', /unexpected|\)/i],
    ['()', /unexpected/i],
  ];
  for (const [src, msg] of bad) {
    it(`rejects ${JSON.stringify(src)}`, () => {
      expect(() => parseExpr(src)).toThrow(msg);
    });
  }

  it('rejects unknown functions, including prototype names', () => {
    expect(() => parseExpr('sqr(4)')).toThrow(/unknown function "sqr"/i);
    expect(() => parseExpr('constructor(1)')).toThrow(/unknown function/i);
    expect(() => parseExpr('toString(1)')).toThrow(/unknown function/i);
    expect(() => parseExpr('a(2)')).toThrow(/unknown function "a"/i);
    expect(() => parseExpr('pi(2)')).toThrow(/unknown function "pi"/i);
  });

  it('rejects wrong arity for fixed-arity functions', () => {
    expect(() => parseExpr('sqrt()')).toThrow(/sqrt expects 1 argument/);
    expect(() => parseExpr('sin(1, 2)')).toThrow(/sin expects 1 argument/);
    expect(() => parseExpr('pow(2)')).toThrow(/pow expects 2 arguments/);
    expect(() => parseExpr('clamp(1, 2)')).toThrow(/clamp expects 3 arguments/);
    expect(() => parseExpr('min()')).toThrow(/min expects at least 1 argument/);
  });

  it('throws Error instances with descriptive messages', () => {
    try {
      parseExpr('1 +');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message.length).toBeGreaterThan(10);
    }
  });

  it('tolerates non-string input like evalExpr does', () => {
    expect(() => parseExpr(undefined as unknown as string)).toThrow(/empty/i);
    expect(parseExpr(42 as unknown as string).identifiers).toEqual([]);
  });
});

describe('parseExpr leaves evalExpr untouched', () => {
  it('evalExpr still returns 0 for malformed input', () => {
    expect(evalExpr('1+', {})).toBe(0);
    expect(evalExpr('(1+2', {})).toBe(0);
    expect(evalExpr('sqr(4)', {})).toBe(0);
    expect(evalExpr('', {})).toBe(0);
  });
});

describe('EXPR_BUILTINS', () => {
  it('lists every function and constant evalExpr knows, plus mod', () => {
    for (const n of ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'sign', 'round', 'floor',
      'ceil', 'min', 'max', 'pow', 'clamp', 'pi', 'e', 'true', 'false', 'mod']) {
      expect(EXPR_BUILTINS.has(n), n).toBe(true);
    }
  });

  it('matches the names extractReads treats as non-variables', () => {
    for (const n of EXPR_BUILTINS) expect(extractReads(n), n).toEqual([]);
    expect(EXPR_BUILTINS.has('x')).toBe(false);
  });
});
