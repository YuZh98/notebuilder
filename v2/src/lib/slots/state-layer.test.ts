import { describe, it, expect } from 'vitest';
import { allSlots, stateLayerFor } from './registry';
import type { Card } from '../types';

// Session-layer writes are keyed by variable name and wiped on Study entry; every other
// slot's runtime writes are progress (readerState) and must stay there.
describe('slot state layers', () => {
  it('slider is the only session-layer slot', () => {
    const sessionSlots = allSlots().filter((t) => t.stateLayer === 'session');
    expect(sessionSlots.map((t) => t.type)).toEqual(['slider']);
  });

  it('stateLayerFor routes a slider slot to session and everything else to progress', () => {
    const card: Pick<Card, 'slots' | 'back'> = {
      slots: [
        { id: 'sl1', type: 'slider', props: { key: 'a', value: 50 } },
        { id: 'sl2', type: 'choice', props: { options: ['A'], answer: [0] } },
      ],
      back: [{ id: 'sl3', type: 'slider', props: { key: 'b', value: 1 } }],
    };
    expect(stateLayerFor(card, 'sl1')).toBe('session');
    expect(stateLayerFor(card, 'sl2')).toBe('progress');
    expect(stateLayerFor(card, 'sl3')).toBe('session');
  });

  it('an unknown slot id (e.g. the card-state key) is progress-layer', () => {
    expect(stateLayerFor({ slots: [] }, '~card~')).toBe('progress');
  });
});

// Source-level sweep: props are the DOCUMENT. A Study component that takes them $bindable
// writes runtime state into the saved notebook — the exact defect this layer split removes.
describe('no Study component can mutate its props', () => {
  const studies = import.meta.glob('./*Study.svelte', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('the sweep found the Study components (extraction proof)', () => {
    expect(Object.keys(studies).length).toBeGreaterThan(5);
  });

  it('no *Study.svelte declares $bindable', () => {
    for (const [file, src] of Object.entries(studies)) {
      expect(src, `${file} declares $bindable`).not.toMatch(/\$bindable/);
    }
  });
});
