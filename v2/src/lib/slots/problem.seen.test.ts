/**
 * Review follow-up (PR #1, F4): the numbers whose answer was shown are remembered (`seen`) across
 * "New numbers", not only carried to the very next draw. In a small range the same numbers come
 * back within a click or two; the answer shown for them must not earn credit then either.
 */
import { describe, it, expect } from 'vitest';
import {
  shownStatus,
  instanceKey,
  withSeen,
  instantiate,
  nextSeed,
  readProblemState,
  SEEN_CAP,
  type ProblemProps,
  type ProblemInstance,
} from './problem';

const small: ProblemProps = {
  prompt: 'What is {{a}} × 10?',
  params: [{ name: 'a', min: 1, max: 2, step: 1 }],
  answer: 'a*10',
  tol: 0,
  need: 1,
};
const wide: ProblemProps = {
  prompt: 'What is {{a}} × {{b}}?',
  params: [
    { name: 'a', min: 2, max: 9, step: 1 },
    { name: 'b', min: 2, max: 9, step: 1 },
  ],
  answer: 'a*b',
  tol: 0,
  need: 1,
};

const ok = (props: ProblemProps, seed: number, scope = {}): Extract<ProblemInstance, { ok: true }> => {
  const inst = instantiate(props, scope, seed);
  if (!inst.ok) throw new Error('setup');
  return inst;
};
/** The first seed whose numbers are a = `a`. */
const seedWhere = (a: number): number => {
  for (let s = 1; s < 200; s++) if (ok(small, s).values.a === a) return s;
  throw new Error('setup');
};

describe('instanceKey', () => {
  it('is the same for the same numbers and answer, whatever the seed', () => {
    const s1 = seedWhere(1);
    let s2 = s1 + 1;
    while (ok(small, s2).values.a !== 1) s2++;
    expect(instanceKey(ok(small, s1))).toBe(instanceKey(ok(small, s2)));
    expect(instanceKey(ok(small, seedWhere(1)))).not.toBe(instanceKey(ok(small, seedWhere(2))));
  });

  it('changes when a card variable moves the answer under the same numbers', () => {
    const viaSlider: ProblemProps = { prompt: 'Twice {{k}}?', params: [], answer: '2*k', tol: 0, need: 1 };
    expect(instanceKey(ok(viaSlider, 1, { k: 3 }))).not.toBe(instanceKey(ok(viaSlider, 1, { k: 4 })));
  });

  it('is an unsigned 32-bit integer (what readProblemState keeps)', () => {
    const k = instanceKey(ok(wide, 7));
    expect(Number.isSafeInteger(k) && k >= 0 && k < 2 ** 32).toBe(true);
    expect(readProblemState({ seen: [k] }).seen).toEqual([k]);
  });
});

describe('withSeen', () => {
  it('appends, without duplicates, most recent last', () => {
    const a = ok(small, seedWhere(1));
    const b = ok(small, seedWhere(2));
    expect(withSeen(undefined, a)).toEqual([instanceKey(a)]);
    expect(withSeen([instanceKey(a)], b)).toEqual([instanceKey(a), instanceKey(b)]);
    expect(withSeen([instanceKey(a), instanceKey(b)], a)).toEqual([instanceKey(b), instanceKey(a)]);
  });

  it(`keeps at most ${SEEN_CAP}, dropping the oldest`, () => {
    const full = Array.from({ length: SEEN_CAP }, (_, i) => i);
    const next = withSeen(full, ok(wide, 3));
    expect(next).toHaveLength(SEEN_CAP);
    expect(next[0]).toBe(1);
    expect(next.at(-1)).toBe(instanceKey(ok(wide, 3)));
  });

  it('a broken problem adds nothing', () => {
    expect(withSeen([5], instantiate({ ...small, answer: 'a*' }, {}, 1))).toEqual([5]);
  });
});

describe('readProblemState — seen', () => {
  it('keeps 32-bit integers, drops anything else, and caps the list', () => {
    expect(readProblemState({ seen: [1, -1, 2.5, '3', 2 ** 32, null, 4] }).seen).toEqual([1, 4]);
    expect(readProblemState({ seen: 'x' })).not.toHaveProperty('seen');
    expect(readProblemState({ seen: [] })).not.toHaveProperty('seen');
    const long = Array.from({ length: SEEN_CAP + 5 }, (_, i) => i);
    expect(readProblemState({ seen: long }).seen).toEqual(long.slice(-SEEN_CAP));
  });
});

describe('shownStatus — numbers seen before', () => {
  it('numbers whose answer was shown do not count when they come back, and others do', () => {
    const one = ok(small, seedWhere(1));
    const seen = [instanceKey(one)];
    const back = seedWhere(1) + 200; // any later seed with the same numbers
    let s = back;
    while (ok(small, s).values.a !== 1) s++;
    expect(shownStatus(small, {}, s, undefined, seen)).toBe('try-new');
    expect(shownStatus(small, {}, seedWhere(2), undefined, seen)).toBe('none');
  });

  it('every version shown: all-shown, not fixed (the numbers do change)', () => {
    const seen = [instanceKey(ok(small, seedWhere(1))), instanceKey(ok(small, seedWhere(2)))];
    expect(shownStatus(small, {}, seedWhere(1), undefined, seen)).toBe('all-shown');
  });

  it('fixed numbers seen before are fixed', () => {
    const fixed: ProblemProps = { prompt: '2+2?', params: [], answer: '2+2', tol: 0, need: 1 };
    expect(shownStatus(fixed, {}, 9, undefined, [instanceKey(ok(fixed, 1))])).toBe('fixed');
  });

  it('the carried answer still blocks a different draw with the same answer, then lets go', () => {
    // From a seed whose next draw has another answer: carrying the current one is try-new.
    let s = 1;
    while (ok(wide, s).answer === ok(wide, nextSeed(wide, {}, s)).answer) s++;
    expect(shownStatus(wide, {}, s, ok(wide, s).answer, [])).toBe('try-new');
  });

  it('a card variable that moved the answer away makes the same (empty) numbers count again', () => {
    const viaSlider: ProblemProps = { prompt: 'Twice {{k}}?', params: [], answer: '2*k', tol: 0, need: 1 };
    const seen = [instanceKey(ok(viaSlider, 1, { k: 3 }))];
    expect(shownStatus(viaSlider, { k: 3 }, 1, undefined, seen)).toBe('fixed');
    expect(shownStatus(viaSlider, { k: 4 }, 1, undefined, seen)).toBe('none');
  });
});
