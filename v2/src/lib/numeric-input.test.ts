import { describe, it, expect } from 'vitest';
import { parseNumericInput } from './numeric-input';

const value = (s: string) => {
  const r = parseNumericInput(s);
  if (!r.ok) throw new Error(`expected ${JSON.stringify(s)} to parse, got: ${r.error}`);
  return r.value;
};
const error = (s: string) => {
  const r = parseNumericInput(s);
  if (r.ok) throw new Error(`expected ${JSON.stringify(s)} to be rejected, got ${r.value}`);
  return r.error;
};

describe('parseNumericInput — accepts', () => {
  it('integers, with optional sign and surrounding whitespace', () => {
    expect(value('42')).toBe(42);
    expect(value('-7')).toBe(-7);
    expect(value('+7')).toBe(7);
    expect(value('  12  ')).toBe(12);
    expect(value('007')).toBe(7);
    expect(value('0')).toBe(0);
  });

  it('decimals, including a bare leading or trailing point', () => {
    expect(value('3.25')).toBe(3.25);
    expect(value('-0.5')).toBe(-0.5);
    expect(value('.5')).toBe(0.5);
    expect(value('-.5')).toBe(-0.5);
    expect(value('5.')).toBe(5);
  });

  it('scientific notation', () => {
    expect(value('1e3')).toBe(1000);
    expect(value('2.5E-4')).toBe(0.00025);
    expect(value('-1.2e+2')).toBe(-120);
  });

  it('simple fractions of whole numbers, sign in front', () => {
    expect(value('3/4')).toBe(0.75);
    expect(value('-3/4')).toBe(-0.75);
    expect(value('+1/3')).toBe(1 / 3);
    expect(value('6 / 8')).toBe(0.75);
    expect(value('0/5')).toBe(0);
  });

  it('the typographic minus sign (pasted from rendered math)', () => {
    expect(value('−4')).toBe(-4);
    expect(value('−3/4')).toBe(-0.75);
  });
});

describe('parseNumericInput — rejects', () => {
  it('empty input', () => {
    expect(error('')).toMatch(/enter a number/i);
    expect(error('   ')).toMatch(/enter a number/i);
  });

  it('commas (thousands separators or decimal commas)', () => {
    expect(error('1,000')).toMatch(/comma/i);
    expect(error('1,5')).toMatch(/comma/i);
  });

  it('malformed numbers', () => {
    for (const s of ['1.2.3', '.', '+', '-', '--3', '+-3', '1e', '1e+', 'e3', '1 000', '1_000', '0x10']) {
      expect(() => error(s), s).not.toThrow();
    }
  });

  it('words and non-finite spellings', () => {
    for (const s of ['abc', 'Infinity', '-Infinity', 'NaN', 'twelve']) {
      expect(() => error(s), s).not.toThrow();
    }
  });

  it('division by zero', () => {
    expect(error('3/0')).toMatch(/denominator/i);
    expect(error('0/0')).toMatch(/denominator/i);
  });

  it('a sign on the denominator — the minus belongs in front', () => {
    expect(error('3/-4')).toMatch(/-3\/4/);
    expect(error('3/+4')).toMatch(/in front/i);
  });

  it('fractions of decimals, mixed numbers and nested fractions', () => {
    expect(error('1.5/2')).toMatch(/whole numbers/i);
    expect(() => error('1 1/2')).not.toThrow();
    expect(() => error('1/2/3')).not.toThrow();
  });

  it('expressions — student input is never evaluated', () => {
    for (const s of ['2+3', '2*3', '2^3', '(3)', 'sqrt(4)', 'a*b', '1-1', '3 4']) {
      expect(() => error(s), s).not.toThrow();
    }
  });

  it('values too large to represent', () => {
    expect(error('1e400')).toMatch(/too large/i);
    expect(error('-1e400')).toMatch(/too large/i);
  });

  it('non-string input', () => {
    expect(parseNumericInput(undefined as unknown as string).ok).toBe(false);
    expect(parseNumericInput(5 as unknown as string).ok).toBe(false);
  });
});
