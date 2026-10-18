import { describe, it, expect } from 'vitest';
import { mulberry32, drawParam, decimalPlaces, roundTo } from './rng';

describe('mulberry32', () => {
  it('matches the reference mulberry32 sequence (pinned)', () => {
    const r = mulberry32(1);
    expect(r()).toBe(0.6270739405881613);
    expect(r()).toBe(0.002735721180215478);
    expect(r()).toBe(0.5274470399599522);
    expect(mulberry32(42)()).toBe(0.6011037519201636);
    expect(mulberry32(0)()).toBe(0.26642920868471265);
  });

  it('is deterministic: the same seed replays the same stream', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('different seeds give different streams', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('stays in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('treats non-integer and non-finite seeds deterministically', () => {
    expect(mulberry32(1.9)()).toBe(mulberry32(1)());
    expect(mulberry32(NaN)()).toBe(mulberry32(0)());
    expect(mulberry32(Infinity)()).toBe(mulberry32(0)());
  });
});

describe('decimalPlaces', () => {
  it('counts the digits after the point', () => {
    expect(decimalPlaces(1)).toBe(0);
    expect(decimalPlaces(0.1)).toBe(1);
    expect(decimalPlaces(0.25)).toBe(2);
    expect(decimalPlaces(-2.125)).toBe(3);
  });

  it('handles exponent notation', () => {
    expect(decimalPlaces(1e-7)).toBe(7);
    expect(decimalPlaces(2.5e-8)).toBe(9);
    expect(decimalPlaces(1e21)).toBe(0);
  });

  it('is 0 for non-finite input', () => {
    expect(decimalPlaces(NaN)).toBe(0);
    expect(decimalPlaces(Infinity)).toBe(0);
  });
});

describe('roundTo', () => {
  it('removes floating-point noise', () => {
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3);
    expect(roundTo(1.005 * 1000, 0)).toBe(1005);
  });

  it('never returns negative zero', () => {
    expect(Object.is(roundTo(-0.0001, 2), 0)).toBe(true);
  });
});

describe('drawParam', () => {
  const draws = (p: { min: number; max: number; step?: number }, n = 500, seed = 3) => {
    const r = mulberry32(seed);
    return Array.from({ length: n }, () => drawParam(r, p));
  };

  it('draws integers within [min, max] inclusive, hitting both ends', () => {
    const xs = draws({ min: 1, max: 6, step: 1 });
    expect(Math.min(...xs)).toBe(1);
    expect(Math.max(...xs)).toBe(6);
    expect(xs.every(Number.isInteger)).toBe(true);
    expect(new Set(xs).size).toBe(6);
  });

  it('lands on the step grid and rounds to the step precision (no 0.30000000000000004)', () => {
    const xs = draws({ min: 0, max: 1, step: 0.1 });
    for (const x of xs) {
      expect(String(x).length, String(x)).toBeLessThanOrEqual(3);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    expect(xs).toContain(0.3);
    expect(xs).toContain(1);
  });

  it('respects the precision of min as well as step', () => {
    const xs = draws({ min: 0.5, max: 3.5, step: 1 });
    expect(new Set(xs)).toEqual(new Set([0.5, 1.5, 2.5, 3.5]));
  });

  it('handles negative ranges', () => {
    const xs = draws({ min: -5, max: -1, step: 2 });
    expect(new Set(xs)).toEqual(new Set([-5, -3, -1]));
  });

  it('never exceeds max when the range is not a multiple of step', () => {
    const xs = draws({ min: 0, max: 10, step: 3 });
    expect(new Set(xs)).toEqual(new Set([0, 3, 6, 9]));
  });

  it('returns min when min == max', () => {
    expect(draws({ min: 4, max: 4, step: 1 }, 10)).toEqual(Array(10).fill(4));
  });

  it('swaps a reversed range', () => {
    const xs = draws({ min: 6, max: 1, step: 1 });
    expect(Math.min(...xs)).toBe(1);
    expect(Math.max(...xs)).toBe(6);
  });

  it('falls back to step 1 when step is missing, zero, negative or non-finite', () => {
    for (const step of [undefined, 0, -1, NaN, Infinity]) {
      const xs = draws({ min: 0, max: 3, step }, 200);
      expect(new Set(xs), String(step)).toEqual(new Set([0, 1, 2, 3]));
    }
  });

  it('treats non-finite bounds as 0', () => {
    const xs = draws({ min: NaN, max: 2, step: 1 }, 100);
    expect(new Set(xs)).toEqual(new Set([0, 1, 2]));
  });

  it('is deterministic for a seed', () => {
    expect(draws({ min: 1, max: 100, step: 1 }, 20, 99)).toEqual(draws({ min: 1, max: 100, step: 1 }, 20, 99));
  });
});
