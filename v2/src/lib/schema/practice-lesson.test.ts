/**
 * docs/examples/practice-lesson.json — the worked lesson for the pedagogical card types. It must
 * stay a complete, coherent lesson (schema-sync.test.ts checks it strictly against the validator
 * and the JSON Schema): a guided exploration, a worked example, a practice set, a graded quiz and
 * a progress meter, split into chapters, every value and formula resolving on its own card.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync } from 'node:fs';
import { importNotebook, validateNotebook, type NotebookJSON } from '../json-io';
import { getSlot } from '../slots/registry';
import { buildCardScope } from '../card-scope';
import { renderMarkdown } from '../markdown';
import { drawValues, paramsOf, problemIssues, DEFAULT_SEED, type ProblemProps } from '../slots/problem';
import { isCardDone } from '../card-done';
import type { Card, Slot } from '../types';

// cwd is v2/ under vitest.
const json = JSON.parse(readFileSync('../docs/examples/practice-lesson.json', 'utf8') as string) as NotebookJSON;
const nb = importNotebook(json);
const cards: Card[] = nb.sections.flatMap((s) => s.cards);
const seq = (s: Slot) => s.verbs?.sequential === true;
const ofType = (c: Card, t: string) => c.slots.filter((s) => s.type === t);
const isUngradedChoice = (s: Slot) => s.type === 'choice' && ((s.props.answer as number[] | undefined) ?? []).length === 0;

describe('docs/examples/practice-lesson.json', () => {
  it('imports with zero errors and zero warnings', () => {
    expect(json.version).toBe(2);
    expect(validateNotebook(json)).toEqual({ errors: [], warnings: [] });
  });

  it('is split into chapters by at least one divider, and every content section has cards', () => {
    expect(nb.sections.filter((s) => s.kind === 'divider').length).toBeGreaterThanOrEqual(1);
    for (const s of nb.sections) {
      if (s.kind === 'divider') expect(s.cards).toEqual([]);
      else expect(s.cards.length, s.name).toBeGreaterThan(0);
    }
  });

  it('has a guided exploration: an ungraded prediction gating step-by-step sliders, a chart and an explanation', () => {
    const guided = cards.find((c) => c.slots.some(isUngradedChoice));
    expect(guided).toBeDefined();
    const g = guided!;
    const at = g.slots.findIndex(isUngradedChoice);
    const after = g.slots.slice(at + 1);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(seq)).toBe(true);
    expect(after.some((s) => s.type === 'slider')).toBe(true);
    expect(after.some((s) => s.type === 'chart')).toBe(true);
    expect(after.at(-1)?.type).toBe('text');
    // The chart reads the slider: the curve moves as the student explores.
    const keys = ofType(g, 'slider').map((s) => String(s.props.key));
    const chartReads = getSlot('chart')!.variables(ofType(g, 'chart')[0].props).reads.map((r) => r.key);
    expect(chartReads.some((k) => keys.includes(k))).toBe(true);
    // Hidden until the prediction is in, shown once it is.
    const choice = g.slots[at];
    expect(isCardDone(g, {})).toBe(false);
    expect(isCardDone(g, { [choice.id]: { selected: [2], submitted: true } })).toBe(true);
  });

  it('has a worked example: self-explanation prompts and step-by-step steps, fading into a problem', () => {
    const worked = cards.find((c) => ofType(c, 'text-input').length > 0 && ofType(c, 'problem').length > 0);
    expect(worked).toBeDefined();
    const w = worked!;
    expect(ofType(w, 'text-input')[0].props.placeholder).toMatch(/why is this step valid/i);
    const last = w.slots.at(-1)!;
    expect(last.type).toBe('problem');
    expect(seq(last)).toBe(true);
    expect(String(last.props.prompt)).toMatch(/now you try/i);
    expect(w.slots.filter((s) => s.type === 'text' && seq(s)).length).toBeGreaterThanOrEqual(1);
  });

  it('has a practice set: two different problems that each need 2–3 correct answers and explain themselves', () => {
    const practice = cards.find((c) => ofType(c, 'problem').length >= 2);
    expect(practice).toBeDefined();
    const probs = ofType(practice!, 'problem').map((s) => s.props as ProblemProps);
    for (const p of probs) {
      expect(p.need).toBeGreaterThanOrEqual(2);
      expect(p.need).toBeLessThanOrEqual(3);
      expect(p.explain?.trim()).toBeTruthy();
    }
    const first = probs.map((p) => JSON.stringify(drawValues(paramsOf(p), DEFAULT_SEED)));
    expect(new Set(first).size).toBe(probs.length);
  });

  it('has a graded quiz with an answer key and an explanation, and a progress meter', () => {
    const quiz = cards.flatMap((c) => ofType(c, 'choice')).find((s) => !isUngradedChoice(s));
    expect(quiz).toBeDefined();
    expect(String(quiz!.props.explanation ?? '').trim()).not.toBe('');
    expect(cards.some((c) => ofType(c, 'progress').length > 0)).toBe(true);
  });

  it('every problem passes the strict card-aware check and draws a finite answer', () => {
    for (const c of cards) {
      const vars = new Set(c.slots.flatMap((s) => getSlot(s.type)!.variables(s.props).writes.map((w) => w.key)));
      for (const s of ofType(c, 'problem')) {
        expect(problemIssues(s.props as ProblemProps, vars)).toEqual([]);
      }
    }
  });

  it('renders cleanly: no KaTeX errors and every {{name}} resolves on its own card', () => {
    for (const c of cards) {
      const scope = buildCardScope(c.slots, {});
      for (const s of c.slots) {
        const local = s.type === 'problem' ? { ...scope, ...drawValues(paramsOf(s.props), DEFAULT_SEED) } : scope;
        for (const k of ['text', 'q', 'explanation', 'prompt', 'explain']) {
          if (typeof s.props[k] !== 'string') continue;
          const src = s.props[k] as string;
          expect(renderMarkdown(src, local), `${s.type}.${k}`).not.toMatch(/katex-error|math-err|#cc0000/i);
          for (const m of src.matchAll(/\{\{(\w+)\}\}/g)) expect(local[m[1]], `${s.type}.${k}: {{${m[1]}}}`).toBeDefined();
        }
      }
    }
  });

  it('the exploration is internally consistent: the net change always equals −p²/100', () => {
    const guided = cards.find((c) => c.slots.some(isUngradedChoice))!;
    const key = String(ofType(guided, 'slider')[0].props.key);
    for (const p of [0, 5, 20, 35, 50, 90]) {
      const scope = buildCardScope(guided.slots, { [key]: p });
      expect(scope.net, `p=${p}`).toBeCloseTo(-(p * p) / 100, 9);
      expect(scope.rule, `p=${p}`).toBeCloseTo(scope.net as number, 9);
    }
  });
});
