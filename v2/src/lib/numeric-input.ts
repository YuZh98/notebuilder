/**
 * Strict parser for a student's typed numeric answer. Accepts exactly one number written as an
 * integer, a decimal, scientific notation (1e3, 2.5E-4) or a simple fraction of whole numbers
 * with the sign in front (-3/4). Student input is never evaluated as an expression.
 */
export type NumericParse = { ok: true; value: number } | { ok: false; error: string };

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const FRACTION = /^([+-]?)(\d+)\s*\/\s*(\d+)$/;
const GENERIC = 'Enter a single number, like 42, -3.5, 1e3 or 3/4';

const fail = (error: string): NumericParse => ({ ok: false, error });

export function parseNumericInput(raw: string): NumericParse {
  if (typeof raw !== 'string') return fail('Enter a number');
  // U+2212 is what rendered math shows (and what a copy from it pastes).
  const s = raw.trim().replace(/−/g, '-');
  if (!s) return fail('Enter a number');
  if (s.includes(',')) return fail('Leave out commas — write 1000, or 1.5 with a dot');

  if (DECIMAL.test(s)) {
    const v = Number(s);
    return Number.isFinite(v) ? { ok: true, value: v } : fail('That number is too large');
  }

  const f = FRACTION.exec(s);
  if (f) {
    const num = Number(f[2]);
    const den = Number(f[3]);
    if (den === 0) return fail("The denominator can't be 0");
    const v = (f[1] === '-' ? -num : num) / den;
    return Number.isFinite(v) ? { ok: true, value: v } : fail('That number is too large');
  }

  if (/^[+-]?\d+\s*\/\s*[+-]\d+$/.test(s)) {
    return fail('Put the sign in front of the fraction, like -3/4');
  }
  if (/^[+-]?[\d.]+\s*\/\s*[\d.]+$/.test(s)) return fail('Fractions need whole numbers, like 3/4');
  return fail(GENERIC);
}
