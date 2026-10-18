/**
 * Seeded pseudo-random numbers for reproducible practice problems. Determinism is the point:
 * the same seed always yields the same numbers, so reader state stores a seed, never values.
 * Not for anything security-sensitive.
 */

/** A source of uniform floats in [0, 1). */
export type Rng = () => number;

/** mulberry32 — a tiny, fast 32-bit generator. Non-finite seeds act as 0; fractions truncate. */
export function mulberry32(seed: number): Rng {
  let a = Number.isFinite(seed) ? seed | 0 : 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Digits after the decimal point in `x`'s shortest representation (exponent notation aware). */
export function decimalPlaces(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const m = /(?:\.(\d+))?(?:e([+-]\d+))?$/i.exec(String(x));
  const frac = m?.[1]?.length ?? 0;
  const exp = m?.[2] ? Number(m[2]) : 0;
  return Math.max(0, frac - exp);
}

/** Round to `places` decimals (clamped to 0–20), dropping float noise; never returns -0. */
export function roundTo(x: number, places: number): number {
  if (!Number.isFinite(x)) return x;
  const p = Math.max(0, Math.min(20, Math.floor(places) || 0));
  const r = Number(x.toFixed(p));
  return r === 0 ? 0 : r;
}

/** An inclusive numeric range sampled on a step grid. */
export type ParamRange = { min: number; max: number; step?: number };

/**
 * Draw one value uniformly from the grid min, min+step, … ≤ max, rounded to the precision of
 * min and step (so 0.1-steps give 0.3, not 0.30000000000000004). Robust to bad input: a
 * reversed range is swapped, non-finite bounds act as 0, and a missing or non-positive step
 * acts as 1.
 */
export function drawParam(rng: Rng, p: ParamRange): number {
  const a = Number.isFinite(p.min) ? p.min : 0;
  const b = Number.isFinite(p.max) ? p.max : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const step = typeof p.step === 'number' && Number.isFinite(p.step) && p.step > 0 ? p.step : 1;
  const q = (hi - lo) / step;
  const n = Math.floor(q + 1e-9 * Math.max(1, q));
  const k = Math.min(n, Math.floor(rng() * (n + 1)));
  const places = Math.max(decimalPlaces(step), decimalPlaces(lo));
  return Math.min(hi, roundTo(lo + k * step, places));
}
