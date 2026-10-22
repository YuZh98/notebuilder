// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PRES_STATE_KEYS, resetPresentation, stripPresentation } from './presentation';
import { CARD_STATE_KEY } from './card-done';
import type { ReaderStateMap } from './db';

describe('PRES_STATE_KEYS', () => {
  it('is exactly the flip key (v1 _qord has no v2 analog)', () => {
    expect([...PRES_STATE_KEYS]).toEqual(['flipped']);
  });
});

// resetPresentation and stripPresentation strip the same keys; run the shared contract over both.
for (const [label, fn] of [
  ['resetPresentation', resetPresentation],
  ['stripPresentation', stripPresentation],
] as const) {
  describe(label, () => {
    it('deletes flipped from the __card__ bucket but keeps seenBack', () => {
      const state: ReaderStateMap = {
        c1: { [CARD_STATE_KEY]: { flipped: true, seenBack: true } },
      };
      const next = fn(state);
      expect(next.c1[CARD_STATE_KEY]).toEqual({ seenBack: true });
    });

    it('leaves non-card buckets (slot state) untouched', () => {
      const state: ReaderStateMap = {
        c1: { [CARD_STATE_KEY]: { flipped: true }, 'slot-a': { value: 'x' } },
      };
      const next = fn(state);
      expect(next.c1['slot-a']).toEqual({ value: 'x' });
    });

    it('leaves cards without a __card__ bucket untouched', () => {
      const state: ReaderStateMap = { c1: { 'slot-a': { value: 'x' } } };
      const next = fn(state);
      expect(next.c1).toEqual({ 'slot-a': { value: 'x' } });
    });

    it('leaves other card entries untouched', () => {
      const state: ReaderStateMap = {
        c1: { [CARD_STATE_KEY]: { flipped: true } },
        c2: { [CARD_STATE_KEY]: { seenBack: true }, 'slot-b': { value: 'y' } },
      };
      const next = fn(state);
      expect(next.c2).toEqual({ [CARD_STATE_KEY]: { seenBack: true }, 'slot-b': { value: 'y' } });
    });

    it('removes a __card__ bucket that becomes empty after the strip', () => {
      const state: ReaderStateMap = { c1: { [CARD_STATE_KEY]: { flipped: false } } };
      const next = fn(state);
      expect(next.c1[CARD_STATE_KEY]).toBeUndefined();
    });

    it('returns a new map and never mutates the input', () => {
      const state: ReaderStateMap = {
        c1: { [CARD_STATE_KEY]: { flipped: true, seenBack: true } },
      };
      const next = fn(state);
      expect(next).not.toBe(state);
      expect(state.c1[CARD_STATE_KEY]).toEqual({ flipped: true, seenBack: true });
    });

    it('never leaves a flipped key anywhere (save-strip invariant)', () => {
      const state: ReaderStateMap = {
        c1: { [CARD_STATE_KEY]: { flipped: true, seenBack: true }, 'slot-a': { value: 'x' } },
        c2: { [CARD_STATE_KEY]: { flipped: false } },
      };
      const next = fn(state);
      for (const card of Object.values(next)) {
        expect(card[CARD_STATE_KEY] ?? {}).not.toHaveProperty('flipped');
      }
    });
  });
}