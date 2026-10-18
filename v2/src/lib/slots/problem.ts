import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import type { Scope } from '../variable-graph';
import { evalExpr, parseExpr, EXPR_BUILTINS } from '../expr';
import { mulberry32, drawParam } from '../rng';
import { parseNumericInput } from '../numeric-input';
import { extractReads } from './identifiers';
import ProblemEdit from './ProblemEdit.svelte';
import ProblemStudy from './ProblemStudy.svelte';

/** One randomized parameter, drawn from min..max on the step grid. Slot-local: never enters card scope. */
export type ProblemParam = { name: string; min: number; max: number; step: number };

export type ProblemProps = {
  /** Markdown; `{{name}}` interpolates drawn params (over card variables); KaTeX allowed. */
  prompt: string;
  params: ProblemParam[];
  /** Expression over the params and card variables (lib/expr grammar). */
  answer: string;
  /** Absolute tolerance; 0 means "exact" up to a relative epsilon of 1e-9·max(1, |answer|). */
  tol: number;
  /** Correct answers needed for the slot to count as done (default 1). */
  need: number;
  /** Markdown shown after a correct answer or after the student gives up. */
  explain?: string;
};

/** Reader (progress-layer) state. Only the seed is stored — values are always redrawn from it. */
export type ProblemState = {
  seed: number;
  correct: number;
  attempts: number;
  /** The last checked input on the current numbers; cleared by "New numbers". */
  last?: { input: string; ok: boolean };
  /** The student chose "Show answer" on the current numbers; cleared by "New numbers". */
  revealed?: boolean;
};

/** Seed used until the student first asks for new numbers — fixed, so mounting writes nothing. */
export const DEFAULT_SEED = 1;
/** How many successive seeds (seed+1 … seed+N) to try when the answer is not finite. */
export const MAX_REDRAWS = 20;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KEY_RE = /\{\{(\w+)\}\}/g;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const count = (v: unknown): number => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : 0);

/** The params that can be drawn: objects with a string name (invalid entries are skipped). */
export function paramsOf(props: unknown): ProblemParam[] {
  const ps = isObj(props) && Array.isArray(props.params) ? props.params : [];
  return ps.filter((p): p is ProblemParam => isObj(p) && typeof p.name === 'string');
}

/** `need` as used at runtime: a whole number ≥ 1, else 1. */
export function needOf(props: unknown): number {
  const n = isObj(props) ? props.need : undefined;
  return Number.isSafeInteger(n) && (n as number) >= 1 ? (n as number) : 1;
}

/** `tol` as used at runtime: a finite number ≥ 0, else 0. */
export function tolOf(props: unknown): number {
  const t = isObj(props) ? props.tol : undefined;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : 0;
}

/** Tolerant read of reader state: anything malformed falls back to its default. */
export function readProblemState(state: Record<string, unknown> | undefined): ProblemState {
  const s = isObj(state) ? state : {};
  const out: ProblemState = {
    seed: Number.isSafeInteger(s.seed) ? (s.seed as number) : DEFAULT_SEED,
    correct: count(s.correct),
    attempts: count(s.attempts),
  };
  const last = s.last;
  if (isObj(last) && typeof last.input === 'string' && typeof last.ok === 'boolean') {
    out.last = { input: last.input, ok: last.ok };
  }
  if (s.revealed === true) out.revealed = true;
  return out;
}

/** Draw every param, in order, from one mulberry32 stream seeded with `seed`. */
export function drawValues(params: ProblemParam[], seed: number): Record<string, number> {
  const rng = mulberry32(seed);
  // fromEntries defines own properties, so no name can reach a prototype setter.
  return Object.fromEntries(params.map((p) => [p.name, drawParam(rng, p)]));
}

export type ProblemInstance =
  | { ok: true; seed: number; values: Record<string, number>; answer: number }
  | { ok: false; seed: number; values: Record<string, number>; error: string };

/**
 * The concrete problem for a seed: drawn values and the expected answer. Seeds seed, seed+1, …
 * seed+MAX_REDRAWS are tried until the answer is a finite number. A formula that does not parse,
 * or that reads a variable missing from the card scope, is refused rather than graded against
 * evalExpr's silent 0.
 */
export function instantiate(props: ProblemProps, scope: Scope, seed: number): ProblemInstance {
  const params = paramsOf(props);
  const fail = (error: string): ProblemInstance => ({ ok: false, seed, values: drawValues(params, seed), error });
  const answer = isObj(props) ? str(props.answer) : '';
  let ids: string[];
  try {
    ids = parseExpr(answer).identifiers;
  } catch (e) {
    return fail(`The answer formula has an error: ${e instanceof Error ? e.message : String(e)}`);
  }
  const names = new Set(params.map((p) => p.name));
  const sc: Scope = isObj(scope) ? scope : {};
  const missing = ids.find((id) => !names.has(id) && !own(sc, id));
  if (missing) return fail(`The answer uses "${missing}", which is not a parameter or a variable on this card`);

  for (let k = 0; k <= MAX_REDRAWS; k++) {
    const values = drawValues(params, seed + k);
    const v = evalExpr(answer, { ...sc, ...values });
    if (typeof v === 'number' && Number.isFinite(v)) return { ok: true, seed: seed + k, values, answer: v };
  }
  return fail("Couldn't draw numbers that give a finite answer — check the ranges and the answer formula");
}

const sameValues = (a: Record<string, number>, b: Record<string, number>): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => own(b, k) && a[k] === b[k]);

/**
 * The seed "New numbers" moves to: normally seed+1 (counted from the seed actually used after any
 * redraw), skipping successors that would show the very same numbers or no valid problem; if no
 * different numbers exist (no params, or single-value ranges) it still advances by one.
 */
export function nextSeed(props: ProblemProps, scope: Scope, seed: number): number {
  const cur = instantiate(props, scope, seed);
  const base = cur.ok ? cur.seed : seed;
  for (let k = 1; k <= MAX_REDRAWS + 1; k++) {
    const nx = instantiate(props, scope, base + k);
    if (nx.ok && !sameValues(nx.values, cur.values)) return base + k;
  }
  return base + 1;
}

/** Whether `got` matches `expected`: within tol (absolute), plus a 1e-9 relative epsilon for float noise. */
export function isCorrect(expected: number, got: number, tol: number): boolean {
  if (!Number.isFinite(expected) || !Number.isFinite(got)) return false;
  const t = Number.isFinite(tol) && tol > 0 ? tol : 0;
  return Math.abs(got - expected) <= t + 1e-9 * Math.max(1, Math.abs(expected));
}

/**
 * The last check, if it still applies. A correct check whose input no longer matches the expected
 * answer (a card variable such as a slider, or the formula, changed since) is dropped, so the
 * problem reopens instead of showing a stale ✓ and staying locked.
 */
export function freshLast(
  props: ProblemProps,
  inst: ProblemInstance,
  last: ProblemState['last'],
): ProblemState['last'] {
  if (!last || !last.ok) return last;
  if (!inst.ok) return undefined;
  const p = parseNumericInput(last.input);
  return p.ok && isCorrect(inst.answer, p.value, tolOf(props)) ? last : undefined;
}

/** An answer for display: 12 significant digits, no float noise, never "-0". */
export function formatAnswer(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Number(n.toPrecision(12));
  return String(r === 0 ? 0 : r);
}

function keysOf(text: unknown): string[] {
  return [...str(text).matchAll(KEY_RE)].map((m) => m[1]);
}

function readKeys(props: unknown): string[] {
  const names = new Set(paramsOf(props).map((p) => p.name));
  const p = isObj(props) ? props : {};
  const keys = [
    ...extractReads(str(p.answer), names),
    ...keysOf(p.prompt).filter((k) => !names.has(k)),
    ...keysOf(p.explain).filter((k) => !names.has(k)),
  ];
  return [...new Set(keys)];
}

/**
 * Every authoring problem with these props. With `knownVars` (the card's variable names) it also
 * flags reads no slot on the card provides — typos like `a*bb`. Without it (import-time
 * `validate`) card reads are trusted; the card-graph check warns about missing writers.
 */
export function problemIssues(props: ProblemProps, knownVars?: ReadonlySet<string>): string[] {
  if (!isObj(props)) return ['props must be an object'];
  const errors: string[] = [];

  if (typeof props.prompt !== 'string') errors.push('prompt must be a string');
  if (props.explain !== undefined && typeof props.explain !== 'string') errors.push('explain must be a string');

  const names = new Set<string>();
  if (props.params !== undefined && !Array.isArray(props.params)) {
    errors.push('params must be an array');
  } else {
    (props.params ?? []).forEach((p: unknown, i: number) => {
      if (!isObj(p)) {
        errors.push(`parameter ${i + 1} must be an object`);
        return;
      }
      const name = p.name;
      const label = typeof name === 'string' && IDENT.test(name) ? `parameter "${name}"` : `parameter ${i + 1}`;
      if (typeof name !== 'string' || !IDENT.test(name)) {
        errors.push(`${label}: ${JSON.stringify(name ?? '')} is not a valid name (letters, digits and _, not starting with a digit)`);
      } else if (EXPR_BUILTINS.has(name) || RESERVED.has(name)) {
        errors.push(`${label}: "${name}" is reserved — pick another name`);
      } else if (names.has(name)) {
        errors.push(`${label} is declared twice`);
      } else {
        names.add(name);
      }
      const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
      if (!finite(p.min)) errors.push(`${label}: min must be a number`);
      if (!finite(p.max)) errors.push(`${label}: max must be a number`);
      if (finite(p.min) && finite(p.max) && p.min > p.max) errors.push(`${label}: min must be ≤ max`);
      if (p.step !== undefined && !(finite(p.step) && p.step > 0)) errors.push(`${label}: step must be greater than 0`);
    });
  }

  if (typeof props.answer !== 'string' || !props.answer.trim()) {
    errors.push('answer is required');
  } else {
    try {
      const { identifiers } = parseExpr(props.answer);
      const allNames = new Set(paramsOf(props).map((p) => p.name));
      const reads = new Set(extractReads(props.answer, allNames));
      for (const id of identifiers) {
        if (allNames.has(id)) continue;
        if (!reads.has(id)) errors.push(`answer: "${id}" is a built-in function — call it like ${id}(x)`);
        else if (knownVars && !knownVars.has(id)) {
          errors.push(`answer: unknown variable "${id}" — not a parameter or a variable on this card`);
        }
      }
    } catch (e) {
      errors.push(`answer: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (knownVars) {
    const allNames = new Set(paramsOf(props).map((p) => p.name));
    for (const field of ['prompt', 'explain'] as const) {
      for (const k of new Set(keysOf(props[field]))) {
        if (!allNames.has(k) && !knownVars.has(k)) {
          errors.push(`${field}: unknown variable "${k}" in {{${k}}} — not a parameter or a variable on this card`);
        }
      }
    }
  }

  if (props.tol !== undefined && !(typeof props.tol === 'number' && Number.isFinite(props.tol) && props.tol >= 0)) {
    errors.push('tol must be a number ≥ 0');
  }
  if (props.need !== undefined && !(Number.isSafeInteger(props.need) && props.need >= 1)) {
    errors.push('need must be a whole number ≥ 1');
  }
  return errors;
}

export const problemSlot: SlotType<ProblemProps> = {
  type: 'problem',
  kind: 'interact',
  completable: true,

  create(): ProblemProps {
    return {
      prompt: 'What is {{a}} × {{b}}?',
      params: [
        { name: 'a', min: 2, max: 12, step: 1 },
        { name: 'b', min: 2, max: 12, step: 1 },
      ],
      answer: 'a*b',
      tol: 0,
      need: 1,
    };
  },

  variables(props: ProblemProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    // Params are slot-local: they shadow card variables inside this slot and are never written.
    return { reads: readKeys(props).map((key) => ({ key, type: 'number' as const })), writes: [] };
  },

  isDone(props: ProblemProps, state: Record<string, unknown>): boolean {
    return readProblemState(state).correct >= needOf(props);
  },

  score(_props: ProblemProps, state: Record<string, unknown> | undefined): { correct: number; answered: number } | null {
    const s = readProblemState(state);
    return { correct: s.correct, answered: s.attempts };
  },

  validate(props: ProblemProps): string[] {
    return problemIssues(props);
  },

  renderEdit: ProblemEdit,
  renderStudy: ProblemStudy,
};
