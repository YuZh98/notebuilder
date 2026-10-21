/**
 * Review fix (PR #1, F8): every reader used to start at DEFAULT_SEED and walk seed+1, +2…, so a
 * whole class saw the same numbers in the same order and one shared answer list reached `need`.
 * Now the first seed comes from a per-browser salt and the problem itself: stable for one reader,
 * different between readers, and still nothing is written on mount.
 */
import { describe, it, expect } from 'vitest';
import {
  baseSeed,
  drawValues,
  instantiate,
  nextSeed,
  readProblemState,
  DEFAULT_SEED,
  type ProblemProps,
} from './problem';

const P = (over: Partial<ProblemProps> = {}): ProblemProps => ({
  prompt: 'What is {{a}} × {{b}}?',
  params: [
    { name: 'a', min: 2, max: 99, step: 1 },
    { name: 'b', min: 2, max: 99, step: 1 },
  ],
  answer: 'a*b',
  tol: 0,
  need: 3,
  ...over,
});
const firstDraw = (props: ProblemProps, salt: string | null) => {
  const inst = instantiate(props, {}, baseSeed(props, salt));
  return JSON.stringify(inst.values);
};

describe('baseSeed', () => {
  it('without a salt (storage unavailable) is DEFAULT_SEED, as before', () => {
    expect(baseSeed(P(), null)).toBe(DEFAULT_SEED);
  });

  it('same salt and same problem: the same seed, so a reload shows the same numbers', () => {
    expect(baseSeed(P(), 'k3j5h2g1')).toBe(baseSeed(P(), 'k3j5h2g1'));
    expect(firstDraw(P(), 'k3j5h2g1')).toBe(firstDraw(P(), 'k3j5h2g1'));
  });

  it('two readers (salts) see different first numbers for the same problem', () => {
    expect(firstDraw(P(), 'reader0001')).not.toBe(firstDraw(P(), 'reader0002'));
    const draws = new Set(Array.from({ length: 20 }, (_, i) => firstDraw(P(), `reader${String(i).padStart(4, '0')}`)));
    expect(draws.size).toBeGreaterThanOrEqual(15);
  });

  it('two problems on one page start from different seeds', () => {
    const salt = 'k3j5h2g1';
    expect(baseSeed(P(), salt)).not.toBe(baseSeed(P({ prompt: 'Area of a {{a}} by {{b}} room?' }), salt));
    expect(baseSeed(P(), salt)).not.toBe(baseSeed(P({ answer: 'a+b' }), salt));
    expect(baseSeed(P(), salt)).not.toBe(baseSeed(P({ params: [{ name: 'a', min: 2, max: 50, step: 1 }] }), salt));
  });

  it('ignores what does not change the numbers: need, tol, explain, key order', () => {
    const salt = 'k3j5h2g1';
    const seed = baseSeed(P(), salt);
    expect(baseSeed(P({ need: 1, tol: 0.5, explain: 'why' }), salt)).toBe(seed);
    const reordered = P({ params: P().params.map(({ name, min, max, step }) => ({ step, max, min, name })) });
    expect(baseSeed(reordered, salt)).toBe(seed);
  });

  it('is a seed readProblemState keeps, and New numbers walks on from it deterministically', () => {
    const seed = baseSeed(P(), 'k3j5h2g1');
    expect(readProblemState({ seed }).seed).toBe(seed);
    expect(nextSeed(P(), {}, seed)).toBe(nextSeed(P(), {}, seed));
    expect(drawValues(P().params, nextSeed(P(), {}, seed))).not.toEqual(drawValues(P().params, seed));
  });

  it('never throws on malformed props', () => {
    for (const bad of [null, {}, { params: 'x' }, { prompt: 5, answer: null, params: [null, 3] }]) {
      expect(Number.isSafeInteger(baseSeed(bad as unknown as ProblemProps, 'k3j5h2g1'))).toBe(true);
    }
  });
});

describe('readProblemState — the starting seed', () => {
  it('uses the stored seed when there is one, else the given start', () => {
    expect(readProblemState({}, 1234).seed).toBe(1234);
    expect(readProblemState(undefined, 1234).seed).toBe(1234);
    expect(readProblemState({ seed: 7 }, 1234).seed).toBe(7);
    expect(readProblemState({ seed: 'x' }, 1234).seed).toBe(1234);
    expect(readProblemState({}).seed).toBe(DEFAULT_SEED);
  });
});
