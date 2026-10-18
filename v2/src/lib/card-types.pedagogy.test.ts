import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import CardView from './components/CardView.svelte';
import { mode } from './stores/mode';
import { builtinCardTypes, stampCard, type CardType, type SlotTemplate } from './card-types';
import { getSlot } from './slots/registry';
import { findGraphIssues, type GraphDecl } from './variable-graph';
import { exportNotebook, validateNotebook } from './json-io';
import { problemIssues, drawValues, DEFAULT_SEED, paramsOf, type ProblemProps } from './slots/problem';
import { interp, renderMarkdown } from './markdown';
import { isCardDone } from './card-done';
import { buildCardScope } from './card-scope';
import { LEGACY_BUILTIN_IDS } from './builtin-seed';
import type { Card, Notebook } from './types';

// The three pedagogical built-ins: predict → explore → explain, a worked example that fades into
// practice, and a randomized practice set. Each must be a working lesson the moment it is placed.
const byId = (id: string): CardType => {
  const ct = builtinCardTypes.find((c) => c.id === id);
  expect(ct, `builtin ${id}`).toBeDefined();
  return ct!;
};
const GUIDED = 'ct_guided';
const WORKED = 'ct_worked';
const PRACTICE = 'ct_practiceset';
const NEW_IDS = [GUIDED, WORKED, PRACTICE];

const seq = (t: SlotTemplate) => t.verbs?.sequential === true;
const completable = (t: SlotTemplate) => getSlot(t.type)?.completable === true;

function decls(slots: SlotTemplate[]): GraphDecl[] {
  return slots.map((t, i) => {
    const { reads, writes } = getSlot(t.type)!.variables(t.props);
    return { id: `${i}:${t.type}`, reads: reads.map((r) => r.key), writes: writes.map((w) => w.key) };
  });
}

function cardVars(slots: SlotTemplate[]): Set<string> {
  return new Set(decls(slots).flatMap((d) => d.writes));
}

function notebookOf(types: CardType[]): Notebook {
  return {
    id: 'nb_p',
    name: 'Pedagogy',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: [
      { id: 'sec_p', notebookId: 'nb_p', name: 'S', position: 0, cards: types.map((t, i) => stampCard(t, 'sec_p', i)) },
    ],
  };
}

function cardProps(card: Card, state: Record<string, Record<string, unknown>> = {}) {
  return {
    card,
    surface: 'read' as const,
    selected: false,
    state,
    notes: [],
    notesOpen: false,
    onselect: vi.fn(),
    onstate: vi.fn(),
    onmove: vi.fn(),
    ondelete: vi.fn(),
    onverb: vi.fn(),
    ontags: vi.fn(),
    onsavetype: vi.fn(),
    onupdateslot: vi.fn(),
    ondeleteslot: vi.fn(),
    onaddslot: vi.fn(),
    progresscompletion: vi.fn(() => ({ done: 0, total: 0, pct: 0 })),
    ontogglenotes: vi.fn(),
    onaddnote: vi.fn(),
    ondeletenote: vi.fn(),
    ongrip: vi.fn(),
    onresize: vi.fn(),
    onfusew: vi.fn(),
    onpin: vi.fn(),
    onarchive: vi.fn(),
  };
}

afterEach(() => {
  mode.set('edit');
});

describe('pedagogical built-ins — shared contract', () => {
  it('ship in their stores with an icon, an accent and a description, as new (non-legacy) built-ins', () => {
    expect(byId(GUIDED)).toMatchObject({ name: 'Guided Explore', store: 'live' });
    expect(byId(WORKED)).toMatchObject({ name: 'Worked Example', store: 'practice' });
    expect(byId(PRACTICE)).toMatchObject({ name: 'Practice Set', store: 'practice' });
    for (const id of NEW_IDS) {
      expect(byId(id).icon, id).toBeTruthy();
      expect(byId(id).accent, id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(byId(id).description, id).toBeTruthy();
      expect(byId(id).note, id).toBeTruthy(); // "from the maker" guidance in the store
    }
    // Not legacy, so installs from before seeding was recorded receive them (lib/builtin-seed.ts).
    for (const id of NEW_IDS) expect(LEGACY_BUILTIN_IDS).not.toContain(id);
  });

  it.each(NEW_IDS)('%s stamps into a card whose props all pass validate()', (id) => {
    const card = stampCard(byId(id), 'sec_x', 0);
    expect(card.typeId).toBe(id);
    for (const s of card.slots) {
      expect(getSlot(s.type)?.validate?.(s.props) ?? [], `${id}: ${s.type}`).toEqual([]);
    }
    const ids = card.slots.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(NEW_IDS)('%s has a clean variable graph: every read has a writer, no cycles', (id) => {
    expect(findGraphIssues(decls(byId(id).slots))).toEqual([]);
  });

  it.each(NEW_IDS)('%s problem slots pass the strict card-aware check (no unknown variables)', (id) => {
    const slots = byId(id).slots;
    for (const t of slots.filter((s) => s.type === 'problem')) {
      expect(problemIssues(t.props as ProblemProps, cardVars(slots))).toEqual([]);
    }
  });

  it.each(NEW_IDS)('%s markdown and math render cleanly (no KaTeX errors, no "?" for a missing value)', (id) => {
    const card = stampCard(byId(id), 'sec_x', 0);
    const scope = buildCardScope(card.slots, {});
    for (const s of card.slots) {
      const local = s.type === 'problem' ? { ...scope, ...drawValues(paramsOf(s.props), DEFAULT_SEED) } : scope;
      const fields = ['text', 'q', 'explanation', 'prompt', 'explain'].filter((k) => typeof s.props[k] === 'string');
      for (const k of fields) {
        const src = String(s.props[k]);
        const html = renderMarkdown(src, local);
        expect(html, `${id} ${s.type}.${k}`).not.toMatch(/katex-error|math-err|#cc0000/i);
        expect(interp(src, local), `${id} ${s.type}.${k}`).not.toContain('{{');
        // Every {{name}} resolves: interp prints '?' only for a missing value.
        for (const m of src.matchAll(/\{\{(\w+)\}\}/g)) expect(local[m[1]], `${id} ${s.type}.${k}: {{${m[1]}}}`).toBeDefined();
      }
    }
  });

  it('exported together they import with zero errors and zero warnings', () => {
    const { errors, warnings } = validateNotebook(exportNotebook(notebookOf(NEW_IDS.map(byId))));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe('Guided Explore — predict, explore, explain', () => {
  const slots = () => byId(GUIDED).slots;

  it('opens with an ungraded prediction: a choice with no answer key and nothing completable before it', () => {
    const s = slots();
    const p = s.findIndex((t) => t.type === 'choice');
    expect(p).toBeGreaterThan(0);
    expect(s.slice(0, p).every((t) => t.type === 'text' && !seq(t))).toBe(true);
    const props = s[p].props as { answer?: number[]; options: string[] };
    expect(props.answer ?? []).toEqual([]);
    expect(props.options.length).toBeGreaterThanOrEqual(3);
    // The prediction is the only completable slot, so it alone gates the simulation.
    expect(s.filter(completable)).toEqual([s[p]]);
  });

  it('every slot after the prediction is step-by-step: sliders, computes, a chart, then the explanation', () => {
    const s = slots();
    const p = s.findIndex((t) => t.type === 'choice');
    const after = s.slice(p + 1);
    expect(after.every(seq)).toBe(true);
    const types = after.map((t) => t.type);
    expect(types.filter((t) => t === 'slider').length).toBeGreaterThanOrEqual(1);
    expect(types).toContain('compute');
    expect(types).toContain('chart');
    expect(types.at(-1)).toBe('text');
  });

  it('the chart reads the slider keys and the explanation quotes live computed values', () => {
    const s = slots();
    const sliderKeys = s.filter((t) => t.type === 'slider').map((t) => String(t.props.key));
    const chart = s.find((t) => t.type === 'chart')!;
    const chartReads = getSlot('chart')!.variables(chart.props).reads.map((r) => r.key);
    expect(chartReads.some((k) => sliderKeys.includes(k))).toBe(true);
    const computed = s.filter((t) => t.type === 'compute').map((t) => String(t.props.out));
    const explain = s.at(-1)!;
    const reads = getSlot('text')!.variables(explain.props).reads.map((r) => r.key);
    expect(reads.some((k) => computed.includes(k))).toBe(true);
    expect(String(explain.props.text)).toMatch(/predict/i);
  });

  it('in Study the simulation stays hidden until the prediction is submitted, then appears', () => {
    mode.set('study');
    const card = stampCard(byId(GUIDED), 'sec_g', 0);
    const choice = card.slots.find((s) => s.type === 'choice')!;

    const before = render(CardView, { props: cardProps(card) });
    expect(before.container.querySelector('.choice-study')).not.toBeNull();
    expect(before.container.querySelector('.slider-study')).toBeNull();
    expect(before.container.querySelector('.chart-study')).toBeNull();
    expect(before.container.querySelector('.compute-study')).toBeNull();
    before.unmount();

    // Picked but not yet submitted: still hidden.
    const picked = render(CardView, { props: cardProps(card, { [choice.id]: { selected: [1] } }) });
    expect(picked.container.querySelector('.slider-study')).toBeNull();
    picked.unmount();

    const after = render(CardView, {
      props: cardProps(card, { [choice.id]: { selected: [1], submitted: true } }),
    });
    expect(after.container.querySelectorAll('.slider-study').length).toBe(
      card.slots.filter((s) => s.type === 'slider').length,
    );
    expect(after.container.querySelector('.chart-study')).not.toBeNull();
    expect(after.container.querySelector('.compute-study')).not.toBeNull();
    // The explanation quotes the live values (a missing variable would render as '?').
    const texts = [...after.container.querySelectorAll('.text-study')].map((e) => e.textContent ?? '');
    const explain = texts.at(-1)!;
    expect(explain).toMatch(/predict/i);
    const scope = buildCardScope(card.slots, {});
    const quoted = getSlot('text')!.variables(card.slots.at(-1)!.props).reads.map((r) => r.key);
    expect(quoted.length).toBeGreaterThan(0);
    for (const k of quoted) expect(explain, k).toContain(String(scope[k]));
  });

  it('the simulation shows that doubling the rate more than doubles the interest (t > 1)', () => {
    const card = stampCard(byId(GUIDED), 'sec_g', 0);
    expect(card.slots.some((s) => s.type === 'slider' && s.props.key === 't')).toBe(true);
    // At the defaults, and over a longer horizon, the ratio is above 2; with one year it is exactly 2.
    expect(buildCardScope(card.slots, {}).times).toBeGreaterThan(2);
    expect(buildCardScope(card.slots, { t: 30 }).times).toBeGreaterThan(buildCardScope(card.slots, {}).times as number);
    expect(buildCardScope(card.slots, { t: 1 }).times).toBe(2);
  });
});

describe('Worked Example — self-explanation, fading into practice', () => {
  const slots = () => byId(WORKED).slots;

  it('states the problem, shows step 1, then asks the student to self-explain it', () => {
    const s = slots();
    expect(s[0].type).toBe('text');
    expect(s[1].type).toBe('text');
    expect(String(s[1].props.text)).toMatch(/step 1/i);
    expect(s[2].type).toBe('text-input');
    expect(String(s[2].props.placeholder)).toMatch(/why is this step valid/i);
    expect(s.slice(0, 3).some(seq)).toBe(false);
  });

  it('later steps and the final problem are step-by-step, so each unlocks after the self-explanation before it', () => {
    const s = slots();
    expect(s.slice(3).every(seq)).toBe(true);
    expect(s.slice(3).some((t) => t.type === 'text' && /step 2/i.test(String(t.props.text)))).toBe(true);
  });

  it('ends with a "Now you try" problem: randomized params, an answer formula and a worked explanation', () => {
    const last = slots().at(-1)!;
    expect(last.type).toBe('problem');
    const p = last.props as ProblemProps;
    expect(p.prompt).toMatch(/now you try/i);
    expect(p.params.length).toBeGreaterThanOrEqual(2);
    expect(p.answer.trim()).not.toBe('');
    expect(p.explain?.trim()).toBeTruthy();
  });

  it('in Study step 2 appears only once the self-explanation is written; the problem only after every explanation', () => {
    mode.set('study');
    const card = stampCard(byId(WORKED), 'sec_w', 0);
    const inputs = card.slots.filter((s) => s.type === 'text-input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    const step2 = (c: HTMLElement) =>
      [...c.querySelectorAll('.text-study')].some((e) => /step 2/i.test(e.textContent ?? ''));

    const fresh = render(CardView, { props: cardProps(card) });
    expect(step2(fresh.container)).toBe(false);
    expect(fresh.container.querySelectorAll('.text-input-study')).toHaveLength(1);
    expect(fresh.container.querySelector('.problem-study')).toBeNull();
    fresh.unmount();

    const blank = render(CardView, { props: cardProps(card, { [inputs[0].id]: { value: '   ' } }) });
    expect(step2(blank.container)).toBe(false);
    blank.unmount();

    const one = render(CardView, { props: cardProps(card, { [inputs[0].id]: { value: 'same to both sides' } }) });
    expect(step2(one.container)).toBe(true);
    expect(one.container.querySelector('.problem-study')).toBeNull();
    one.unmount();

    const all = Object.fromEntries(inputs.map((s) => [s.id, { value: 'because…' }]));
    const done = render(CardView, { props: cardProps(card, all) });
    expect(done.container.querySelector('.problem-study')).not.toBeNull();
    done.unmount();
  });

  it('the card is finished only when the explanations are written and the problem is solved', () => {
    const card = stampCard(byId(WORKED), 'sec_w', 0);
    const inputs = card.slots.filter((s) => s.type === 'text-input');
    const prob = card.slots.find((s) => s.type === 'problem')!;
    const typed = Object.fromEntries(inputs.map((s) => [s.id, { value: 'reason' }]));
    expect(isCardDone(card, typed)).toBe(false);
    expect(isCardDone(card, { ...typed, [prob.id]: { seed: 1, correct: 1, attempts: 1 } })).toBe(true);
  });
});

describe('Practice Set — randomized retrieval practice', () => {
  const slots = () => byId(PRACTICE).slots;

  it('a heading, then two different problems that each need 2–3 correct answers and explain themselves', () => {
    const s = slots();
    expect(s[0].type).toBe('text');
    const probs = s.filter((t) => t.type === 'problem').map((t) => t.props as ProblemProps);
    expect(probs).toHaveLength(2);
    for (const p of probs) {
      expect(p.need).toBeGreaterThanOrEqual(2);
      expect(p.need).toBeLessThanOrEqual(3);
      expect(p.explain?.trim()).toBeTruthy();
    }
    expect(probs[0].prompt).not.toBe(probs[1].prompt);
    expect(probs[0].answer).not.toBe(probs[1].answer);
  });

  it('the two problems never show the same numbers on first draw (or the next few)', () => {
    const probs = slots()
      .filter((t) => t.type === 'problem')
      .map((t) => t.props as ProblemProps);
    for (let seed = DEFAULT_SEED; seed < DEFAULT_SEED + 5; seed++) {
      const shown = probs.map((p) => interp(p.prompt, drawValues(paramsOf(p), seed)));
      expect(shown[0]).not.toBe(shown[1]);
      const drawn = probs.map((p) => Object.values(drawValues(paramsOf(p), seed)).join(','));
      expect(drawn[0]).not.toBe(drawn[1]);
    }
  });

  it('every drawn instance has a whole-number answer, so a tolerance of 0 is fair', () => {
    for (const t of slots().filter((x) => x.type === 'problem')) {
      const p = t.props as ProblemProps;
      for (let seed = 1; seed <= 50; seed++) {
        const v = drawValues(paramsOf(p), seed);
        const ans = getSlot('compute')!.evaluate!({ expr: p.answer, out: 'y' }, v).y as number;
        expect(Math.abs(ans - Math.round(ans)), `${p.answer} at seed ${seed}`).toBeLessThan(1e-9);
      }
    }
  });
});
