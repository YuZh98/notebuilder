import { describe, it, expect } from 'vitest';
import { computeProgress, progressScopeCards } from './progress';
import { createNotebook, addSection, addCard, addChapter } from './notebook-ops';
import type { Card, Notebook } from './types';

// Ensure slots are registered (isCardDone delegates to registry)
import './slots/registry';

const makeCard = (id: string, slotType: string = 'text-input'): Card => ({
  id,
  sectionId: 'sec1',
  position: 0,
  slots: [{ id: `slot-${id}`, type: slotType, props: {} }],
});

describe('computeProgress', () => {
  it('returns {0,0,0} for empty card list', () => {
    expect(computeProgress([], {})).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it('all done → pct 100', () => {
    const cards = [makeCard('c1'), makeCard('c2')];
    const states: Record<string, Record<string, Record<string, unknown>>> = {
      c1: { 'slot-c1': { value: 'hi' } },
      c2: { 'slot-c2': { value: 'bye' } },
    };
    expect(computeProgress(cards, states)).toEqual({ done: 2, total: 2, pct: 100 });
  });

  it('partial: 1 of 3 done → pct 33', () => {
    const cards = [makeCard('c1'), makeCard('c2'), makeCard('c3')];
    const states: Record<string, Record<string, Record<string, unknown>>> = {
      c1: { 'slot-c1': { value: 'filled' } },
      c2: { 'slot-c2': { value: '' } },
      c3: {},
    };
    const result = computeProgress(cards, states);
    expect(result.done).toBe(1);
    expect(result.total).toBe(3);
    expect(result.pct).toBe(33);
  });

  it('pct rounds correctly: 2 of 3 → 67', () => {
    const cards = [makeCard('c1'), makeCard('c2'), makeCard('c3')];
    const states: Record<string, Record<string, Record<string, unknown>>> = {
      c1: { 'slot-c1': { value: 'a' } },
      c2: { 'slot-c2': { value: 'b' } },
      c3: {},
    };
    const result = computeProgress(cards, states);
    expect(result.done).toBe(2);
    expect(result.total).toBe(3);
    expect(result.pct).toBe(67);
  });

  it('cards with no completable slot (text only) are excluded from the total', () => {
    const cards: Card[] = [
      { id: 'c1', sectionId: 's1', position: 0, slots: [{ id: 'sl1', type: 'text', props: {} }] },
    ];
    expect(computeProgress(cards, {})).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it('mixed section counts only cards that have a completable slot', () => {
    const cards: Card[] = [
      // text-only → excluded
      { id: 'c1', sectionId: 's1', position: 0, slots: [{ id: 'a', type: 'text', props: {} }] },
      // completable + filled → counted, done
      { id: 'c2', sectionId: 's1', position: 1, slots: [{ id: 'b', type: 'text-input', props: {} }] },
      // completable + empty → counted, not done
      { id: 'c3', sectionId: 's1', position: 2, slots: [{ id: 'c', type: 'text-input', props: {} }] },
    ];
    const states: Record<string, Record<string, Record<string, unknown>>> = {
      c2: { b: { value: 'answer' } },
    };
    expect(computeProgress(cards, states)).toEqual({ done: 1, total: 2, pct: 50 });
  });

  it('empty section → 0/0', () => {
    expect(computeProgress([], {})).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it('a section of only non-completable cards → 0/0', () => {
    const cards: Card[] = [
      { id: 'c1', sectionId: 's1', position: 0, slots: [{ id: 'a', type: 'text', props: {} }] },
      { id: 'c2', sectionId: 's1', position: 1, slots: [{ id: 'b', type: 'image', props: {} }] },
    ];
    expect(computeProgress(cards, {})).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it('missing card state defaults to {} (not done for completable)', () => {
    const cards = [makeCard('c1')];
    expect(computeProgress(cards, {})).toEqual({ done: 0, total: 1, pct: 0 });
  });

  it('excludes archived cards from the counted set', () => {
    const cards: Card[] = [
      { ...makeCard('c1'), archived: true },
      makeCard('c2'),
    ];
    const states: Record<string, Record<string, Record<string, unknown>>> = {
      c2: { 'slot-c2': { value: 'done' } },
    };
    // c1 is archived → not counted; only c2 remains, and it is done.
    expect(computeProgress(cards, states)).toEqual({ done: 1, total: 1, pct: 100 });
  });

  it('returns {0,0,0} when every card is archived', () => {
    const cards: Card[] = [{ ...makeCard('c1'), archived: true }];
    expect(computeProgress(cards, {})).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it('track filter counts only cards carrying a matching tag (ANY-match)', () => {
    const cards: Card[] = [
      { ...makeCard('c1'), tags: ['algebra'] },
      { ...makeCard('c2'), tags: ['geometry'] },
      { ...makeCard('c3'), tags: ['algebra', 'hard'] },
    ];
    const states: Record<string, Record<string, Record<string, unknown>>> = {
      c1: { 'slot-c1': { value: 'a' } },
      c2: { 'slot-c2': { value: 'b' } },
      c3: {},
    };
    // track=['algebra'] → keeps c1 (done) and c3 (not done); c2 excluded.
    expect(computeProgress(cards, states, ['algebra'])).toEqual({ done: 1, total: 2, pct: 50 });
  });

  it('empty track array counts every (non-archived) card', () => {
    const cards: Card[] = [
      { ...makeCard('c1'), tags: ['x'] },
      makeCard('c2'),
    ];
    expect(computeProgress(cards, {}, []).total).toBe(2);
  });

  it('track filter drops untagged cards', () => {
    const cards: Card[] = [{ ...makeCard('c1'), tags: ['x'] }, makeCard('c2')];
    expect(computeProgress(cards, {}, ['x']).total).toBe(1);
  });

  it('track filter still excludes archived matches', () => {
    const cards: Card[] = [
      { ...makeCard('c1'), tags: ['x'], archived: true },
      { ...makeCard('c2'), tags: ['x'] },
    ];
    expect(computeProgress(cards, {}, ['x']).total).toBe(1);
  });
});

describe('progressScopeCards', () => {
  /** Layout: S0(c0) | div1 | S1(c1) S2(c2) | div2 | S3(c3) */
  function chapteredNotebook(): Notebook {
    const nb = createNotebook('N');
    nb.sections[0].name = 'S0';
    addCard(nb, nb.sections[0].id);
    addChapter(nb, 'Part I');
    const s1 = addSection(nb, 'S1');
    addCard(nb, s1.id);
    const s2 = addSection(nb, 'S2');
    addCard(nb, s2.id);
    addChapter(nb, 'Part II');
    const s3 = addSection(nb, 'S3');
    addCard(nb, s3.id);
    return nb;
  }

  it('section scope resolves to the card\'s own section', () => {
    const nb = chapteredNotebook();
    const s1 = nb.sections[2];
    expect(progressScopeCards(nb, s1, 'section')).toEqual(s1.cards);
  });

  it('chapter scope counts across the divider-bounded run', () => {
    const nb = chapteredNotebook();
    const s1 = nb.sections[2];
    const s2 = nb.sections[3];
    const ids = progressScopeCards(nb, s1, 'chapter').map((c) => c.id);
    expect(ids).toEqual([...s1.cards, ...s2.cards].map((c) => c.id));
    expect(progressScopeCards(nb, s2, 'chapter').map((c) => c.id)).toEqual(ids);
  });

  it('chapter scope before any divider covers only the leading run', () => {
    const nb = chapteredNotebook();
    const s0 = nb.sections[0];
    expect(progressScopeCards(nb, s0, 'chapter')).toEqual(s0.cards);
  });

  it('notebook scope gathers all cards', () => {
    const nb = chapteredNotebook();
    expect(progressScopeCards(nb, nb.sections[0], 'notebook')).toHaveLength(4);
  });

  it('chapter scope equals notebook run when there are no dividers', () => {
    const nb = createNotebook('N');
    addCard(nb, nb.sections[0].id);
    const s2 = addSection(nb, 'B');
    addCard(nb, s2.id);
    expect(progressScopeCards(nb, nb.sections[0], 'chapter')).toHaveLength(2);
  });
});
