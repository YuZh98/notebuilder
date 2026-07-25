import { describe, it, expect } from 'vitest';
import { hasCompletableSlot, isCardDone } from './card-done';
import { chapterOf } from './notebook-ops';
import { computeProgress, progressScopeCards } from './progress';
import { completionSequence, genNotebook, resetSimIds, TAG_POOL } from './sim-notebook';
import { makeRng, SEEDS } from './sim-rng';
import type { Card, Notebook } from './types';

/** Generated notebooks per property, per seed. Each one drives a full reader run. */
const CASES = 12;

/** A mix of completable and inert slot types, so `hasCompletableSlot` filtering matters. */
const TYPES = ['choice', 'text-input', 'list', 'text', 'slider', 'progress'];

const OPTS = { types: TYPES, maxSections: 4, maxCards: 3 };

const allCards = (nb: Notebook): Card[] => nb.sections.flatMap((s) => s.cards);

/** The cards a scope must count, derived independently of computeProgress. */
const countable = (cards: Card[], track?: string[]): Card[] =>
  cards.filter(
    (c) =>
      !c.archived &&
      (!track?.length || (c.tags ?? []).some((t) => track.includes(t))) &&
      hasCompletableSlot(c),
  );

describe.each(SEEDS)('progress simulation (seed %i)', (seed) => {
  it('is monotone, bounded, and complete along a reader run', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r, OPTS);
      const cards = allCards(nb);
      const steps = completionSequence(r, cards);
      const where = `seed ${seed} case ${c}`;

      const total0 = computeProgress(cards, steps[0]).total;
      let prevDone = -1;
      let prevPct = -1;
      for (let i = 0; i < steps.length; i++) {
        const p = computeProgress(cards, steps[i]);
        expect(p.total, `${where} step ${i} total drifted`).toBe(total0);
        expect(p.done, `${where} step ${i} done regressed`).toBeGreaterThanOrEqual(prevDone);
        expect(p.done, `${where} step ${i} done exceeded total`).toBeLessThanOrEqual(p.total);
        expect(p.pct, `${where} step ${i} pct regressed`).toBeGreaterThanOrEqual(prevPct);
        expect(p.pct, `${where} step ${i} pct out of range`).toBeLessThanOrEqual(100);
        prevDone = p.done;
        prevPct = p.pct;
      }

      const last = computeProgress(cards, steps[steps.length - 1]);
      expect(last.done, `${where} final state left work undone`).toBe(last.total);
      expect(last.pct, `${where} final pct`).toBe(last.total === 0 ? 0 : 100);
    }
  });

  it('counts exactly the cards in scope, at every step', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r, OPTS);
      const cards = allCards(nb);
      const steps = completionSequence(r, cards);
      const where = `seed ${seed} case ${c}`;

      // Scope membership is structural — it holds once, for every section.
      for (const section of nb.sections) {
        expect(progressScopeCards(nb, section, 'section'), `${where} section scope`).toEqual(section.cards);
        expect(progressScopeCards(nb, section, 'notebook'), `${where} notebook scope`).toEqual(cards);
      }

      // The counts are state-dependent, so they are checked at every step.
      const scopes = [...nb.sections.map((s) => s.cards), cards];
      for (let i = 0; i < steps.length; i++) {
        const state = steps[i];
        for (const scope of scopes) {
          const p = computeProgress(scope, state);
          const counted = countable(scope);
          expect(p.total, `${where} step ${i} total`).toBe(counted.length);
          expect(p.done, `${where} step ${i} done`).toBe(
            counted.filter((card) => isCardDone(card, state[card.id] ?? {})).length,
          );
        }
      }
    }
  });

  it('adds up: section totals sum to the notebook total, chapters partition it', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r, OPTS);
      const steps = completionSequence(r, allCards(nb));
      const state = steps[r.int(steps.length)];
      const where = `seed ${seed} case ${c}`;
      const first = nb.sections[0];

      const whole = computeProgress(progressScopeCards(nb, first, 'notebook'), state);
      const summed = nb.sections
        .map((s) => computeProgress(s.cards, state))
        .reduce((a, p) => ({ done: a.done + p.done, total: a.total + p.total }), { done: 0, total: 0 });
      expect(summed, `${where} section sum`).toEqual({ done: whole.done, total: whole.total });

      for (const section of nb.sections.filter((s) => s.kind !== 'divider')) {
        const chapter = chapterOf(nb, section.id);
        expect(chapter.includes(section), `${where} chapter contains its own section`).toBe(true);
        const chapterCards = progressScopeCards(nb, section, 'chapter');
        const chapterSum = chapter
          .map((s) => computeProgress(s.cards, state))
          .reduce((a, p) => ({ done: a.done + p.done, total: a.total + p.total }), { done: 0, total: 0 });
        const p = computeProgress(chapterCards, state);
        expect(chapterSum, `${where} chapter sum`).toEqual({ done: p.done, total: p.total });
        expect(p.total, `${where} chapter <= notebook`).toBeLessThanOrEqual(whole.total);
        expect(p.done, `${where} chapter done <= notebook done`).toBeLessThanOrEqual(whole.done);
      }
    }
  });

  it('narrows, never widens, when tracking tags', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r, OPTS);
      const cards = allCards(nb);
      const steps = completionSequence(r, cards);
      const state = steps[r.int(steps.length)];
      const where = `seed ${seed} case ${c}`;

      const untracked = computeProgress(cards, state);
      expect(computeProgress(cards, state, []), `${where} empty track == untracked`).toEqual(untracked);

      for (const track of [[r.pick(TAG_POOL)], r.sample(TAG_POOL, 2), ['no-such-tag']]) {
        const p = computeProgress(cards, state, track);
        expect(p.total, `${where} track ${track.join(',')}`).toBe(countable(cards, track).length);
        expect(p.total, `${where} track widened the total`).toBeLessThanOrEqual(untracked.total);
        expect(p.done, `${where} track widened the done count`).toBeLessThanOrEqual(untracked.done);
      }
    }
  });

  it('ignores archived cards entirely', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r, OPTS);
      const cards = allCards(nb);
      const steps = completionSequence(r, cards);
      const state = steps[steps.length - 1];
      const where = `seed ${seed} case ${c}`;
      const live = cards.filter((card) => !card.archived);
      expect(computeProgress(cards, state), where).toEqual(computeProgress(live, state));
    }
  });
});

/** Guards against a degenerate generator: the properties above need all of these shapes. */
it('generates the card shapes the progress properties rely on', () => {
  resetSimIds();
  const seen = new Set<string>();
  let maxSteps = 0;
  for (const seed of SEEDS) {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r, OPTS);
      const cards = allCards(nb);
      maxSteps = Math.max(maxSteps, completionSequence(r, cards).length);
      if (nb.sections.some((s) => s.kind === 'divider')) seen.add('divider');
      for (const card of cards) {
        if (card.archived) seen.add('archived');
        if (card.verbs?.flip) seen.add('flip');
        if (card.tags?.length) seen.add('tagged');
        if (hasCompletableSlot(card)) seen.add('completable');
        else seen.add('inert');
        for (const slot of [...card.slots, ...(card.back ?? [])]) {
          if (slot.type === 'list' && slot.props.style === 'check') seen.add('checklist');
          if (slot.type === 'choice') seen.add('choice');
          if (slot.type === 'text-input') seen.add('text-input');
        }
      }
    }
  }
  const required = [
    'divider', 'archived', 'flip', 'tagged', 'completable', 'inert',
    'checklist', 'choice', 'text-input',
  ];
  expect(required.filter((k) => !seen.has(k))).toEqual([]);
  expect(maxSteps).toBeGreaterThan(10);
});
