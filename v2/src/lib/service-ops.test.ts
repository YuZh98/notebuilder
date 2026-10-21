// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  setArchived,
  archivedCount,
  visibleCards,
  togglePin,
  isPinned,
  flipAllCards,
  resetSectionState,
} from './service-ops';
import { CARD_STATE_KEY } from './card-done';
import type { Card, Section } from './types';
import type { ReaderStateMap } from './db';

const makeCard = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  sectionId: 'sec1',
  position: 0,
  slots: [{ id: `slot-${id}`, type: 'text', props: { text: id } }],
  ...over,
});

const makeSection = (cards: Card[]): Section => ({
  id: 'sec1',
  notebookId: 'nb1',
  name: 'S',
  position: 0,
  cards,
});

describe('setArchived / archivedCount', () => {
  it('sets archived=true and clears the flag by deleting it', () => {
    const c = makeCard('c1');
    setArchived(c, true);
    expect(c.archived).toBe(true);
    setArchived(c, false);
    expect('archived' in c).toBe(false);
  });

  it('counts only archived cards in a section', () => {
    const section = makeSection([
      makeCard('c1', { archived: true }),
      makeCard('c2'),
      makeCard('c3', { archived: true }),
    ]);
    expect(archivedCount(section)).toBe(2);
  });
});

describe('visibleCards', () => {
  const section = makeSection([
    makeCard('live1', { tags: ['alpha'] }),
    makeCard('arch1', { archived: true, tags: ['alpha'] }),
    makeCard('live2', { tags: ['beta'] }),
    makeCard('arch2', { archived: true, tags: ['beta'] }),
  ]);

  it('shows only live cards when showArch is false', () => {
    expect(visibleCards(section, false, '').map((c) => c.id)).toEqual(['live1', 'live2']);
  });

  it('shows only archived cards when showArch is true (swap, not merge)', () => {
    expect(visibleCards(section, true, '').map((c) => c.id)).toEqual(['arch1', 'arch2']);
  });

  it('applies search to the live list', () => {
    expect(visibleCards(section, false, 'beta').map((c) => c.id)).toEqual(['live2']);
  });

  it('applies search to the archived list', () => {
    expect(visibleCards(section, true, 'beta').map((c) => c.id)).toEqual(['arch2']);
  });
});

describe('togglePin / isPinned', () => {
  it('adds and removes the pinned tag; idempotent round-trip', () => {
    const c = makeCard('c1');
    expect(isPinned(c)).toBe(false);
    togglePin(c);
    expect(isPinned(c)).toBe(true);
    expect(c.tags).toContain('pinned');
    togglePin(c);
    expect(isPinned(c)).toBe(false);
    expect(c.tags).not.toContain('pinned');
  });

  it('preserves other tags when toggling', () => {
    const c = makeCard('c1', { tags: ['keep'] });
    togglePin(c);
    expect(c.tags).toEqual(['keep', 'pinned']);
    togglePin(c);
    expect(c.tags).toEqual(['keep']);
  });
});

describe('flipAllCards', () => {
  it('toggles _flip per flip-capable card only and marks seenBack', () => {
    const section = makeSection([
      makeCard('flipA', { verbs: { flip: true } }),
      makeCard('plain'),
      makeCard('flipB', { verbs: { flip: true } }),
    ]);
    const state: ReaderStateMap = {
      flipA: { [CARD_STATE_KEY]: { flipped: true } },
    };
    const next = flipAllCards(section, state);

    // flipA was flipped → toggles to false, seenBack set
    expect(next.flipA[CARD_STATE_KEY]).toEqual({ flipped: false, seenBack: true });
    // flipB had no state → toggles to true
    expect(next.flipB[CARD_STATE_KEY]).toEqual({ flipped: true, seenBack: true });
    // plain (non-flip) untouched
    expect(next.plain).toBeUndefined();
  });

  it('is per-card, not set-all-same', () => {
    const section = makeSection([
      makeCard('on', { verbs: { flip: true } }),
      makeCard('off', { verbs: { flip: true } }),
    ]);
    const state: ReaderStateMap = {
      on: { [CARD_STATE_KEY]: { flipped: true } },
    };
    const next = flipAllCards(section, state);
    expect(next.on[CARD_STATE_KEY].flipped).toBe(false);
    expect(next.off[CARD_STATE_KEY].flipped).toBe(true);
  });

  it('returns a new map and does not mutate the input', () => {
    const section = makeSection([makeCard('flipA', { verbs: { flip: true } })]);
    const state: ReaderStateMap = { flipA: { [CARD_STATE_KEY]: { flipped: false } } };
    const next = flipAllCards(section, state);
    expect(next).not.toBe(state);
    expect(state.flipA[CARD_STATE_KEY].flipped).toBe(false);
  });

  it('round-trips the same key the flip gesture reads (__card__.flipped)', () => {
    const section = makeSection([makeCard('c1', { verbs: { flip: true } })]);
    const next = flipAllCards(section, {});
    // CardView derives `flipped` from state[CARD_STATE_KEY]?.flipped
    expect(next.c1[CARD_STATE_KEY].flipped).toBe(true);
  });
});

describe('resetSectionState', () => {
  it('wipes the section cards state entries entirely, leaves other sections', () => {
    const section = makeSection([makeCard('c1'), makeCard('c2')]);
    const state: ReaderStateMap = {
      c1: { [CARD_STATE_KEY]: { flipped: true }, 'slot-c1': { value: 'x' } },
      c2: { 'slot-c2': { value: 'y' } },
      other: { 'slot-o': { value: 'z' } },
    };
    const next = resetSectionState(section, state);
    expect(next.c1).toBeUndefined();
    expect(next.c2).toBeUndefined();
    expect(next.other).toEqual({ 'slot-o': { value: 'z' } });
  });

  it('does not touch the archived Card field and returns a new map', () => {
    const c1 = makeCard('c1', { archived: true });
    const section = makeSection([c1]);
    const state: ReaderStateMap = { c1: { 'slot-c1': { value: 'x' } } };
    const next = resetSectionState(section, state);
    expect(next).not.toBe(state);
    expect(c1.archived).toBe(true);
    expect(state.c1).toBeDefined();
  });
});