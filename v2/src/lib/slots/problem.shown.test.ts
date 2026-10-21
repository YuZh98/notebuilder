/**
 * Review fix (PR #1, F4): after "Show answer", "Try again" / "New numbers" can bring back a
 * problem whose answer is the one just shown (no params, single-value ranges, or new numbers with
 * the same answer). Typing it must not earn credit toward `need` or the results. The decision is
 * on the expected answer (what a student could copy), never on seeds, which always differ.
 */
import { describe, it, expect } from 'vitest';
import {
  shownStatus,
  carryShown,
  instantiate,
  nextSeed,
  readProblemState,
  type ProblemProps,
  type ProblemState,
} from './problem';

const P = (over: Partial<ProblemProps> = {}): ProblemProps => ({
  prompt: 'What is {{a}} × {{b}}?',
  params: [
    { name: 'a', min: 2, max: 9, step: 1 },
    { name: 'b', min: 2, max: 9, step: 1 },
  ],
  answer: 'a*b',
  tol: 0,
  need: 1,
  ...over,
});
const fixed = P({ params: [], prompt: '2+2?', answer: '2+2' });
const pinned = P({ params: [{ name: 'a', min: 3, max: 3, step: 1 }], prompt: '{{a}}²?', answer: 'a^2' });
const st = (over: Partial<ProblemState> = {}): ProblemState => ({ seed: 1, correct: 0, attempts: 0, ...over });

/** A seed whose successor (what New numbers moves to) has a different answer. */
function seedWithNewAnswer(props: ProblemProps): number {
  for (let s = 1; s < 200; s++) {
    const a = instantiate(props, {}, s);
    const b = instantiate(props, {}, nextSeed(props, {}, s));
    if (a.ok && b.ok && a.answer !== b.answer) return s;
  }
  throw new Error('no such seed');
}

describe('shownStatus — does a correct answer on these numbers count?', () => {
  it('counts when no answer was shown', () => {
    expect(shownStatus(P(), {}, 1, undefined)).toBe('none');
    expect(shownStatus(fixed, {}, 1, undefined)).toBe('none');
  });

  it('a problem without params whose answer was shown no longer counts, and new numbers cannot help', () => {
    expect(shownStatus(fixed, {}, 1, 4)).toBe('fixed');
    expect(shownStatus(fixed, {}, 2, 4)).toBe('fixed'); // seeds differ, the numbers do not
  });

  it('single-value ranges are fixed numbers too', () => {
    expect(shownStatus(pinned, {}, 7, 9)).toBe('fixed');
  });

  it('an answer that does not depend on the drawn values is as good as fixed', () => {
    expect(shownStatus(P({ answer: '7' }), {}, 1, 7)).toBe('fixed');
  });

  it('when the shown answer is this problem’s but new numbers would change it: try new numbers', () => {
    const s = seedWithNewAnswer(P());
    const inst = instantiate(P(), {}, s);
    if (!inst.ok) throw new Error('setup');
    expect(shownStatus(P(), {}, s, inst.answer)).toBe('try-new');
  });

  it('counts once the expected answer is no longer the one shown', () => {
    const inst = instantiate(P(), {}, 1);
    if (!inst.ok) throw new Error('setup');
    expect(shownStatus(P(), {}, 1, inst.answer + 1)).toBe('none');
    expect(shownStatus(fixed, {}, 1, 5)).toBe('none');
  });

  it('a card variable that moved the answer away from the shown one makes it count again', () => {
    const viaSlider = P({ params: [], prompt: 'Twice {{k}}?', answer: '2*k' });
    expect(shownStatus(viaSlider, { k: 3 }, 1, 6)).toBe('fixed');
    expect(shownStatus(viaSlider, { k: 4 }, 1, 6)).toBe('none');
  });

  it('within tolerance of the shown answer is the shown answer', () => {
    const approx = P({ params: [], prompt: 'π?', answer: 'pi', tol: 0.01 });
    expect(shownStatus(approx, {}, 1, 3.14)).toBe('fixed');
    expect(shownStatus({ ...approx, tol: 0 }, {}, 1, 3.14)).toBe('none');
  });

  it('a broken problem never claims anything', () => {
    expect(shownStatus(P({ answer: 'a*' }), {}, 1, 4)).toBe('none');
  });
});

describe('carryShown — what New numbers / Try again takes along', () => {
  it('after Show answer, carries the revealed answer when the next numbers have that answer', () => {
    const cur = instantiate(fixed, {}, 1);
    const next = instantiate(fixed, {}, nextSeed(fixed, {}, 1));
    expect(carryShown(fixed, cur, st({ revealed: true }), next)).toBe(4);
  });

  it('drops it when the next numbers have another answer', () => {
    const s = seedWithNewAnswer(P());
    const cur = instantiate(P(), {}, s);
    const next = instantiate(P(), {}, nextSeed(P(), {}, s));
    expect(carryShown(P(), cur, st({ seed: s, revealed: true }), next)).toBeUndefined();
  });

  it('keeps carrying an earlier shown answer while it still applies', () => {
    const cur = instantiate(fixed, {}, 2);
    const next = instantiate(fixed, {}, 3);
    expect(carryShown(fixed, cur, st({ seed: 2, shown: 4, last: { input: '4', ok: true } }), next)).toBe(4);
  });

  it('carries nothing when no answer was shown — solving it yourself is not a reveal', () => {
    const cur = instantiate(fixed, {}, 1);
    const next = instantiate(fixed, {}, 2);
    expect(carryShown(fixed, cur, st({ correct: 1, attempts: 1, last: { input: '4', ok: true } }), next)).toBeUndefined();
  });
});

describe('readProblemState — shown', () => {
  it('reads a finite shown answer and drops anything else', () => {
    expect(readProblemState({ seed: 3, correct: 0, attempts: 0, shown: -2.5 }).shown).toBe(-2.5);
    for (const bad of ['4', null, NaN, Infinity, {}]) {
      expect(readProblemState({ shown: bad }), String(bad)).not.toHaveProperty('shown');
    }
  });
});
