import { describe, it, expect } from 'vitest';
import {
  problemSlot,
  problemIssues,
  drawValues,
  instantiate,
  isCorrect,
  nextSeed,
  readProblemState,
  formatAnswer,
  DEFAULT_SEED,
  MAX_REDRAWS,
  type ProblemProps,
  type ProblemParam,
} from './problem';
import { getSlot, allSlots, stateLayerFor } from './registry';
import { mulberry32, drawParam } from '../rng';

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
const param = (name: string, over: Partial<ProblemParam> = {}): ProblemParam => ({
  name, min: 1, max: 10, step: 1, ...over,
});
const validate = (p: unknown) => problemSlot.validate!(p as ProblemProps);
const reads = (p: unknown) => problemSlot.variables(p as ProblemProps).reads.map((r) => r.key);

describe('problem slot — registration and contract', () => {
  it('is registered as the "problem" type', () => {
    expect(getSlot('problem')).toBe(problemSlot);
    expect(allSlots().map((s) => s.type)).toContain('problem');
  });

  it('is a completable interact slot on the default progress layer', () => {
    expect(problemSlot.kind).toBe('interact');
    expect(problemSlot.completable).toBe(true);
    expect(problemSlot.stateLayer).toBeUndefined();
    expect(stateLayerFor({ slots: [{ id: 'p1', type: 'problem', props: P() }] }, 'p1')).toBe('progress');
  });

  it('create() returns a valid, ready-to-use multiplication problem', () => {
    const p = problemSlot.create();
    expect(validate(p)).toEqual([]);
    expect(p.answer).toBe('a*b');
    expect(p.params.map((x) => x.name)).toEqual(['a', 'b']);
    expect(p.prompt).toContain('{{a}}');
    expect(p.need).toBe(1);
    expect(p.tol).toBe(0);
  });

  it('create() returns independent objects', () => {
    const a = problemSlot.create();
    const b = problemSlot.create();
    expect(a).not.toBe(b);
    expect(a.params).not.toBe(b.params);
    expect(a.params[0]).not.toBe(b.params[0]);
  });
});

describe('problem slot — variables()', () => {
  it('params never become reads or writes — they are slot-local', () => {
    const v = problemSlot.variables(P());
    expect(v.reads).toEqual([]);
    expect(v.writes).toEqual([]);
  });

  it('reads card variables used by the answer, minus params and builtins', () => {
    expect(reads(P({ answer: 'a*k + sqrt(b) + pi' }))).toEqual(['k']);
  });

  it('reads {{keys}} in the prompt and explanation that are not params', () => {
    expect(reads(P({ prompt: '{{a}} apples at {{price}} each', explain: '{{a}}·{{price}} = {{total}}' })))
      .toEqual(['price', 'total']);
  });

  it('dedupes reads across answer, prompt and explanation', () => {
    expect(reads(P({ answer: 'a*k', prompt: '{{k}} {{k}}', explain: '{{k}}' }))).toEqual(['k']);
  });

  it('declares reads as numbers', () => {
    expect(problemSlot.variables(P({ answer: 'k' })).reads).toEqual([{ key: 'k', type: 'number' }]);
  });

  it('never throws on malformed props', () => {
    for (const bad of [{}, { params: 'x' }, { prompt: 5, answer: null, params: [null, 3] }]) {
      expect(() => problemSlot.variables(bad as unknown as ProblemProps)).not.toThrow();
    }
  });
});

describe('problem slot — validate()', () => {
  it('accepts a well-formed problem, including card reads and optional fields', () => {
    expect(validate(P({ answer: 'a*k', explain: 'because' }))).toEqual([]);
    expect(validate(P({ params: [], answer: '2+2', prompt: 'What is 2+2?' }))).toEqual([]);
  });

  it('catches a syntax typo in the answer', () => {
    const errs = validate(P({ answer: 'a*' }));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/^answer: /);
    expect(validate(P({ answer: '(a+b' }))[0]).toMatch(/answer/);
    expect(validate(P({ answer: 'a b' }))[0]).toMatch(/answer/);
    expect(validate(P({ answer: '2a' }))[0]).toMatch(/answer.*missing operator/i);
  });

  it('catches an unknown function in the answer', () => {
    expect(validate(P({ answer: 'sqr(a)' }))[0]).toMatch(/unknown function "sqr"/i);
  });

  it('catches a built-in function used as a value', () => {
    expect(validate(P({ answer: 'sqrt*a' }))[0]).toMatch(/"sqrt".*function/);
  });

  it('catches an unknown identifier when the card variables are known', () => {
    expect(problemIssues(P({ answer: 'a*bb' }), new Set(['k']))[0]).toMatch(/unknown variable "bb"/);
    expect(problemIssues(P({ answer: 'a*k' }), new Set(['k']))).toEqual([]);
    expect(problemIssues(P({ prompt: '{{a}} and {{zz}}' }), new Set())[0]).toMatch(/prompt.*"zz"/);
    expect(problemIssues(P({ explain: 'see {{q}}' }), new Set())[0]).toMatch(/explain.*"q"/);
  });

  it('requires an answer', () => {
    expect(validate(P({ answer: '' }))).toEqual(['answer is required']);
    expect(validate(P({ answer: '   ' }))).toEqual(['answer is required']);
    expect(validate({ ...P(), answer: undefined })).toEqual(['answer is required']);
  });

  it('rejects invalid parameter names', () => {
    for (const name of ['', '1a', 'a b', 'a-b', 'é']) {
      const errs = validate(P({ params: [param(name)], answer: '1' }));
      expect(errs.join(), JSON.stringify(name)).toMatch(/not a valid name/);
    }
  });

  it('rejects parameter names that collide with built-ins or prototype keys', () => {
    for (const name of ['e', 'pi', 'sin', 'true', 'mod', '__proto__']) {
      const errs = validate(P({ params: [param(name)], answer: '1' }));
      expect(errs.join(), name).toMatch(/reserved/);
    }
  });

  it('rejects duplicate parameter names', () => {
    expect(validate(P({ params: [param('a'), param('a')], answer: 'a' })).join()).toMatch(/"a".*twice/);
  });

  it('rejects bad ranges and steps', () => {
    expect(validate(P({ params: [param('a', { min: 5, max: 1 })], answer: 'a' })).join()).toMatch(/min.*max/);
    expect(validate(P({ params: [param('a', { step: 0 })], answer: 'a' })).join()).toMatch(/step/);
    expect(validate(P({ params: [param('a', { step: -1 })], answer: 'a' })).join()).toMatch(/step/);
    expect(validate(P({ params: [param('a', { min: NaN })], answer: 'a' })).join()).toMatch(/min/);
    expect(validate(P({ params: [{ name: 'a', max: 3 } as ProblemParam], answer: 'a' })).join()).toMatch(/min/);
    expect(validate(P({ params: [param('a', { max: 'x' as unknown as number })], answer: 'a' })).join()).toMatch(/max/);
  });

  it('treats a missing step as 1 but rejects an invalid one', () => {
    const noStep = { name: 'a', min: 1, max: 3 } as ProblemParam;
    expect(validate(P({ params: [noStep], answer: 'a' }))).toEqual([]);
  });

  it('rejects need that is not a whole number ≥ 1', () => {
    for (const need of [0, -1, 1.5, NaN]) {
      expect(validate(P({ need })).join(), String(need)).toMatch(/need/);
    }
    expect(validate({ ...P(), need: undefined })).toEqual([]);
  });

  it('rejects a negative or non-finite tolerance', () => {
    for (const tol of [-0.1, NaN, Infinity]) {
      expect(validate(P({ tol })).join(), String(tol)).toMatch(/tol/);
    }
    expect(validate({ ...P(), tol: undefined })).toEqual([]);
  });

  it('rejects wrongly-typed fields without throwing', () => {
    expect(validate(P({ prompt: 3 as unknown as string })).join()).toMatch(/prompt/);
    expect(validate(P({ explain: 3 as unknown as string })).join()).toMatch(/explain/);
    expect(validate(P({ params: 'a' as unknown as ProblemParam[] })).join()).toMatch(/params/);
    expect(validate(P({ params: [null as unknown as ProblemParam], answer: '1' })).join()).toMatch(/parameter 1/);
    expect(() => validate(null)).not.toThrow();
    expect(validate(null).length).toBeGreaterThan(0);
  });

  it('reports a parameter the answer uses only once its name is valid', () => {
    // the answer references a param whose name is fine — no false "unknown" report
    expect(validate(P({ params: [param('x')], answer: 'x^2', prompt: '{{x}}²?' }))).toEqual([]);
  });
});

describe('problem slot — progress', () => {
  it('isDone once correct reaches need', () => {
    expect(problemSlot.isDone!(P({ need: 3 }), { correct: 2 })).toBe(false);
    expect(problemSlot.isDone!(P({ need: 3 }), { correct: 3 })).toBe(true);
    expect(problemSlot.isDone!(P({ need: 3 }), { correct: 4 })).toBe(true);
  });

  it('isDone is false with no state, and need defaults to 1', () => {
    expect(problemSlot.isDone!(P(), {})).toBe(false);
    expect(problemSlot.isDone!(P(), undefined as unknown as Record<string, unknown>)).toBe(false);
    expect(problemSlot.isDone!({ ...P(), need: undefined } as unknown as ProblemProps, { correct: 1 })).toBe(true);
    expect(problemSlot.isDone!(P({ need: 0 }), { correct: 0 })).toBe(false);
  });

  it('isDone ignores garbage counters', () => {
    expect(problemSlot.isDone!(P(), { correct: '5' })).toBe(false);
    expect(problemSlot.isDone!(P(), { correct: Infinity })).toBe(false);
  });

  it('score reports correct answers over attempts', () => {
    expect(problemSlot.score!(P(), { correct: 2, attempts: 5 })).toEqual({ correct: 2, answered: 5 });
    expect(problemSlot.score!(P(), undefined)).toEqual({ correct: 0, answered: 0 });
    expect(problemSlot.score!(P(), {})).toEqual({ correct: 0, answered: 0 });
  });
});

describe('readProblemState', () => {
  it('defaults everything when state is empty', () => {
    expect(readProblemState(undefined)).toEqual({ seed: DEFAULT_SEED, correct: 0, attempts: 0 });
    expect(readProblemState({})).toEqual({ seed: DEFAULT_SEED, correct: 0, attempts: 0 });
  });

  it('keeps valid fields and drops garbage', () => {
    expect(readProblemState({ seed: 7, correct: 2, attempts: 3, last: { input: '12', ok: true }, revealed: true }))
      .toEqual({ seed: 7, correct: 2, attempts: 3, last: { input: '12', ok: true }, revealed: true });
    expect(readProblemState({ seed: 'x', correct: -1, attempts: 1.5, last: { input: 3 }, revealed: 'yes' }))
      .toEqual({ seed: DEFAULT_SEED, correct: 0, attempts: 0 });
  });
});

describe('drawValues', () => {
  it('draws each param in order from one seeded stream', () => {
    const params = [param('a'), param('b', { min: 0, max: 1, step: 0.1 })];
    const r = mulberry32(5);
    expect(drawValues(params, 5)).toEqual({ a: drawParam(r, params[0]), b: drawParam(r, params[1]) });
  });

  it('is deterministic per seed and varies across seeds', () => {
    const params = [param('a', { max: 1000 }), param('b', { max: 1000 })];
    expect(drawValues(params, 11)).toEqual(drawValues(params, 11));
    expect(drawValues(params, 11)).not.toEqual(drawValues(params, 12));
  });

  it('returns no values for no params', () => {
    expect(drawValues([], 1)).toEqual({});
  });
});

describe('instantiate', () => {
  it('evaluates the answer over the drawn values', () => {
    const inst = instantiate(P(), {}, 3);
    expect(inst.ok).toBe(true);
    if (!inst.ok) return;
    expect(inst.seed).toBe(3);
    expect(inst.answer).toBe(inst.values.a * inst.values.b);
  });

  it('reads card variables, with params shadowing a card variable of the same name', () => {
    const inst = instantiate(P({ answer: 'a*k' }), { k: 10, a: 1000 }, 1);
    expect(inst.ok).toBe(true);
    if (!inst.ok) return;
    expect(inst.values.a).toBeLessThan(10);
    expect(inst.answer).toBe(inst.values.a * 10);
  });

  it('redraws (seed+k) when the answer is not finite', () => {
    // a ∈ {3, 4}: a = 3 divides by zero, so every instance must land on a = 4
    const props = P({ params: [param('a', { min: 3, max: 4 })], answer: '1/(a-3)' });
    let redrew = false;
    for (let seed = 1; seed <= 30; seed++) {
      const inst = instantiate(props, {}, seed);
      expect(inst.ok).toBe(true);
      if (!inst.ok) continue;
      expect(inst.values.a).toBe(4);
      expect(inst.answer).toBe(1);
      expect(inst.seed).toBeGreaterThanOrEqual(seed);
      expect(inst.seed).toBeLessThanOrEqual(seed + MAX_REDRAWS);
      if (inst.seed !== seed) redrew = true;
    }
    expect(redrew).toBe(true);
  });

  it('gives up after MAX_REDRAWS with an error', () => {
    const inst = instantiate(P({ answer: 'sqrt(0 - a)' }), {}, 1);
    expect(inst.ok).toBe(false);
    if (inst.ok) return;
    expect(inst.error).toMatch(/finite/);
  });

  it('treats a boolean answer as not a number', () => {
    expect(instantiate(P({ answer: 'a > b' }), {}, 1).ok).toBe(false);
  });

  it('refuses a formula that does not parse instead of grading against 0', () => {
    const inst = instantiate(P({ answer: 'a*' }), {}, 1);
    expect(inst.ok).toBe(false);
    if (inst.ok) return;
    expect(inst.error).toMatch(/answer formula/i);
    expect(inst.values).toEqual(drawValues(P().params, 1));
  });

  it('refuses an answer that reads a variable missing from the card scope', () => {
    const inst = instantiate(P({ answer: 'a*k' }), {}, 1);
    expect(inst.ok).toBe(false);
    if (inst.ok) return;
    expect(inst.error).toMatch(/"k"/);
  });

  it('tolerates malformed props', () => {
    expect(() => instantiate({} as ProblemProps, {}, 1)).not.toThrow();
    expect(instantiate({} as ProblemProps, {}, 1).ok).toBe(false);
  });
});

describe('isCorrect', () => {
  it('tol 0 uses a tiny relative epsilon, so float noise is forgiven', () => {
    expect(isCorrect(0.1 + 0.2, 0.3, 0)).toBe(true);
    expect(isCorrect(21, 21, 0)).toBe(true);
    expect(isCorrect(21, 21.001, 0)).toBe(false);
    expect(isCorrect(0.3, 0.31, 0)).toBe(false);
    // relative: one part in a billion of the answer's magnitude
    expect(isCorrect(1e12, 1e12 + 100, 0)).toBe(true);
    expect(isCorrect(1e12, 1e12 + 1e4, 0)).toBe(false);
  });

  it('tol > 0 is an absolute tolerance (inclusive)', () => {
    expect(isCorrect(2, 2.4, 0.5)).toBe(true);
    expect(isCorrect(2, 2.5, 0.5)).toBe(true);
    expect(isCorrect(2, 2.6, 0.5)).toBe(false);
    expect(isCorrect(2, 1.4, 0.5)).toBe(false);
    expect(isCorrect(0.1 + 0.2, 0.29, 0.01)).toBe(true);
  });

  it('a negative or non-finite tolerance acts as 0', () => {
    expect(isCorrect(2, 2.4, -1)).toBe(false);
    expect(isCorrect(2, 2.4, NaN)).toBe(false);
  });

  it('never accepts non-finite values', () => {
    expect(isCorrect(2, NaN, 1)).toBe(false);
    expect(isCorrect(NaN, NaN, 1)).toBe(false);
    expect(isCorrect(Infinity, Infinity, 0)).toBe(false);
  });
});

describe('nextSeed', () => {
  it('is seed + 1 when that draws different numbers', () => {
    const props = P({ params: [param('a', { max: 1000 }), param('b', { max: 1000 })] });
    expect(nextSeed(props, {}, 1)).toBe(2);
    expect(nextSeed(props, {}, 41)).toBe(42);
  });

  it('skips seeds that would redraw the same numbers', () => {
    const props = P({ params: [param('a', { min: 1, max: 2 })], answer: 'a' });
    for (let seed = 1; seed <= 20; seed++) {
      const n = nextSeed(props, {}, seed);
      expect(n).toBeGreaterThan(seed);
      expect(n).toBeLessThanOrEqual(seed + MAX_REDRAWS + 1);
      expect(instantiate(props, {}, n).values.a).not.toBe(instantiate(props, {}, seed).values.a);
    }
  });

  it('is deterministic', () => {
    expect(nextSeed(P(), {}, 9)).toBe(nextSeed(P(), {}, 9));
  });

  it('still advances when no different numbers exist', () => {
    expect(nextSeed(P({ params: [], answer: '4' }), {}, 5)).toBe(6);
    expect(nextSeed(P({ params: [param('a', { min: 2, max: 2 })], answer: 'a' }), {}, 5)).toBe(6);
  });
});

describe('formatAnswer', () => {
  it('drops float noise and keeps useful precision', () => {
    expect(formatAnswer(0.1 + 0.2)).toBe('0.3');
    expect(formatAnswer(21)).toBe('21');
    expect(formatAnswer(-0)).toBe('0');
    expect(formatAnswer(1 / 3)).toBe('0.333333333333');
    expect(formatAnswer(-2.5)).toBe('-2.5');
  });
});
