import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axisValues, coverageMatrix, filterCards } from './coverage-matrix';
import type { Card } from './types';

// Mock the slot registry so tests don't depend on real slot implementations
vi.mock('./slots/registry', () => ({
  getSlot: (type: string) => {
    if (type === 'choice') return { type: 'choice', completable: true, isDone: (_props: unknown, state: Record<string, unknown>) => !!state.answered };
    if (type === 'text-input') return { type: 'text-input', completable: true, isDone: (_props: unknown, state: Record<string, unknown>) => !!state.value };
    return { type, completable: false };
  },
}));

const cardA: Card = {
  id: 'a',
  sectionId: 's1',
  position: 0,
  slots: [
    { id: 'a1', type: 'choice', props: {} },
    { id: 'a2', type: 'text', props: {} },
  ],
  tags: ['math', 'algebra'],
};

const cardB: Card = {
  id: 'b',
  sectionId: 's1',
  position: 1,
  slots: [
    { id: 'b1', type: 'text-input', props: {} },
    { id: 'b2', type: 'image', props: {} },
  ],
  tags: ['math'],
};

const cardC: Card = {
  id: 'c',
  sectionId: 's2',
  position: 0,
  slots: [
    { id: 'c1', type: 'text', props: {} },
  ],
  tags: ['science'],
};

const cardD: Card = {
  id: 'd',
  sectionId: 's2',
  position: 1,
  slots: [
    { id: 'd1', type: 'choice', props: {} },
  ],
  // no tags
};

// states: statesByCardThenSlot[cardId][slotId] = slotState
const states: Record<string, Record<string, Record<string, unknown>>> = {
  a: { a1: { answered: true }, a2: {} },  // choice done → card done
  b: { b1: {} },                            // text-input not answered → card not done
  c: {},                                    // no completable slots → done
  d: { d1: { answered: true } },           // choice done → card done
};

describe('axisValues', () => {
  it('returns tags for tag axis', () => {
    expect(axisValues(cardA, 'tag', states)).toEqual(['math', 'algebra']);
    expect(axisValues(cardB, 'tag', states)).toEqual(['math']);
    expect(axisValues(cardC, 'tag', states)).toEqual(['science']);
    expect(axisValues(cardD, 'tag', states)).toEqual([]);
  });

  it('returns distinct slot types for slotType axis', () => {
    expect(axisValues(cardA, 'slotType', states)).toEqual(['choice', 'text']);
    expect(axisValues(cardB, 'slotType', states)).toEqual(['text-input', 'image']);
    expect(axisValues(cardC, 'slotType', states)).toEqual(['text']);
    expect(axisValues(cardD, 'slotType', states)).toEqual(['choice']);
  });

  it('returns done status for done axis', () => {
    expect(axisValues(cardA, 'done', states)).toEqual(['done']);
    expect(axisValues(cardB, 'done', states)).toEqual(['not done']);
    expect(axisValues(cardC, 'done', states)).toEqual(['done']);  // no completable slots
    expect(axisValues(cardD, 'done', states)).toEqual(['done']);
  });
});

describe('coverageMatrix', () => {
  it('computes rows/cols/cell for tag × slotType', () => {
    const matrix = coverageMatrix([cardA, cardB, cardC, cardD], 'tag', 'slotType', states);

    // rows = sorted distinct tags across all cards (cardD has no tags → empty, not included)
    expect(matrix.rows).toEqual(['algebra', 'math', 'science']);
    // cols = sorted distinct slot types across all cards
    expect(matrix.cols).toEqual(['choice', 'image', 'text', 'text-input']);

    // cardA has tags [math, algebra] and slotTypes [choice, text]
    expect(matrix.cell('math', 'choice')).toEqual(['a']);
    expect(matrix.cell('algebra', 'choice')).toEqual(['a']);
    expect(matrix.cell('math', 'text')).toEqual(['a']);
    expect(matrix.cell('algebra', 'text')).toEqual(['a']);

    // cardB has tags [math] and slotTypes [text-input, image]
    expect(matrix.cell('math', 'text-input')).toEqual(['b']);
    expect(matrix.cell('math', 'image')).toEqual(['b']);

    // cardC has tags [science] and slotTypes [text]
    expect(matrix.cell('science', 'text')).toEqual(['c']);

    // empty cell
    expect(matrix.cell('science', 'choice')).toEqual([]);
    expect(matrix.cell('algebra', 'image')).toEqual([]);
  });

  it('computes rows/cols/cell for slotType × done', () => {
    const matrix = coverageMatrix([cardA, cardB, cardC, cardD], 'slotType', 'done', states);

    expect(matrix.rows).toEqual(['choice', 'image', 'text', 'text-input']);
    expect(matrix.cols).toEqual(['done', 'not done']);

    // cardA: choice + text, done
    expect(matrix.cell('choice', 'done')).toContain('a');
    expect(matrix.cell('text', 'done')).toContain('a');

    // cardB: text-input + image, not done
    expect(matrix.cell('text-input', 'not done')).toContain('b');
    expect(matrix.cell('image', 'not done')).toContain('b');

    // cardC: text, done
    expect(matrix.cell('text', 'done')).toContain('c');

    // cardD: choice, done
    expect(matrix.cell('choice', 'done')).toContain('d');

    // no card with image + done
    expect(matrix.cell('image', 'done')).toEqual([]);
  });

  it('excludes cards with no row-axis values from rows, but still includes their col values', () => {
    // cardD has no tags → no row contribution; slotType 'choice' still shows in cols
    const matrix = coverageMatrix([cardD], 'tag', 'slotType', states);
    expect(matrix.rows).toEqual([]);
    expect(matrix.cols).toEqual(['choice']);
    // no cell is reachable since rows is empty
    expect(matrix.cell('choice', 'choice')).toEqual([]);
  });
});

describe('filterCards', () => {
  it('returns cards matching the given row+col cell', () => {
    const cards = [cardA, cardB, cardC, cardD];
    expect(filterCards(cards, 'tag', 'math', 'slotType', 'choice', states)).toEqual([cardA]);
    expect(filterCards(cards, 'tag', 'math', 'slotType', 'text-input', states)).toEqual([cardB]);
    expect(filterCards(cards, 'tag', 'science', 'slotType', 'text', states)).toEqual([cardC]);
  });

  it('returns empty array for an empty cell', () => {
    const cards = [cardA, cardB, cardC, cardD];
    expect(filterCards(cards, 'tag', 'science', 'slotType', 'choice', states)).toEqual([]);
  });

  it('works with done axis', () => {
    const cards = [cardA, cardB, cardC, cardD];
    const doneCards = filterCards(cards, 'slotType', 'choice', 'done', 'done', states);
    const ids = doneCards.map((c) => c.id);
    expect(ids).toContain('a');
    expect(ids).toContain('d');
    expect(ids).not.toContain('b');
    expect(ids).not.toContain('c');
  });
});
