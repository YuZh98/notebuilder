/**
 * Seeded PRNG and draw combinators for the generative `*.sim.test.ts` suites.
 * Test-only — no app module imports this. Every random draw in a sim suite must
 * come from here: a failing case is then reproducible from the seed printed in
 * the test name.
 */

/** mulberry32 — 32-bit state, uniform in [0,1), dependency-free. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = {
  readonly seed: number;
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Integer in [lo, hi], inclusive. */
  between(lo: number, hi: number): number;
  bool(p?: number): boolean;
  pick<T>(xs: readonly T[]): T;
  shuffle<T>(xs: readonly T[]): T[];
  /** k distinct elements, in random order. */
  sample<T>(xs: readonly T[], k: number): T[];
  /** A short token drawn from a pool of JSON-hostile strings. */
  word(): string;
  /** 0..maxWords tokens joined by spaces. */
  phrase(maxWords?: number): string;
};

/**
 * Tokens chosen to stress JSON round-tripping: quotes, backslashes, newlines,
 * tabs, markup, astral-plane emoji, and non-ASCII identifiers.
 */
const WORDS: readonly string[] = [
  'alpha',
  'beta',
  'ga mma',
  'de"lta',
  'ep\\silon',
  'zeta\nline',
  'eta\ttab',
  '<b>theta</b>',
  'iota & co',
  "kappa's",
  'λ-lambda',
  'μ',
  'π/2',
  'σ²',
  'ω∞',
  '🎲 die',
  '中文',
  'עברית',
  '{{brace}}',
  '```fence```',
  '',
];

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  const r: Rng = {
    seed,
    next,
    int: (n) => Math.floor(next() * n),
    between: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    bool: (p = 0.5) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample: (xs, k) => r.shuffle(xs).slice(0, Math.min(k, xs.length)),
    word: () => r.pick(WORDS),
    phrase: (maxWords = 4) =>
      Array.from({ length: r.int(maxWords + 1) }, () => r.word()).join(' '),
  };
  return r;
}

/** Fixed default seed — the case every suite always runs. */
export const DEFAULT_SEED = 0x5eed;

/** Seed sweep. Kept small on purpose: CI budget is seconds, not minutes. */
export const SEEDS: readonly number[] = [DEFAULT_SEED, 1, 7, 42, 1337, 20260725];
