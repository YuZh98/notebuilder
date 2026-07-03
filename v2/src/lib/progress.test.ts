import { describe, it, expect } from 'vitest';
import { computeProgress } from './progress';
import type { Card } from './types';

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

  it('cards with no completable slots (text only) count as done', () => {
    const cards: Card[] = [
      { id: 'c1', sectionId: 's1', position: 0, slots: [{ id: 'sl1', type: 'text', props: {} }] },
    ];
    expect(computeProgress(cards, {})).toEqual({ done: 1, total: 1, pct: 100 });
  });

  it('missing card state defaults to {} (not done for completable)', () => {
    const cards = [makeCard('c1')];
    expect(computeProgress(cards, {})).toEqual({ done: 0, total: 1, pct: 0 });
  });
});
