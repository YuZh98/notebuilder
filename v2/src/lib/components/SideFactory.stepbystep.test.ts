import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SideFactory from './SideFactory.svelte';
import CardView from './CardView.svelte';
import { factory, activeBench, addBenchSlot, hydrateFactory, setSlotVerb, benchFaceCard, type Bench } from '../bench.svelte';
import { registerHistory, clearHistory, undo, redo, canUndo, type HistSnapshot } from '../history.svelte';
import { toastState } from '../toast.svelte';
import type { Notebook } from '../types';

// The Factory's "Step-by-step" slot effect: authors build sequential reveals themselves.
// It rides the same undoable path as glow/emphasis (pushHistory, then setSlotVerb).
const TIP = 'Hide until the earlier tasks on this card are done';

function effectsLane(container: HTMLElement): HTMLElement {
  const lane = [...container.querySelectorAll('.store-lane')].find((l) =>
    l.querySelector('h4')?.textContent?.includes('Slot effects'),
  );
  expect(lane, 'Slot effects lane').toBeDefined();
  return lane as HTMLElement;
}

function stepChip(container: HTMLElement): HTMLButtonElement {
  const chip = [...effectsLane(container).querySelectorAll('.chip')].find((c) =>
    c.textContent?.includes('Step-by-step'),
  );
  expect(chip, 'Step-by-step chip').toBeDefined();
  return chip as HTMLButtonElement;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

beforeEach(() => {
  hydrateFactory(null);
  clearHistory();
  // Author-state history over the factory only (App registers the full snapshot).
  registerHistory({
    capture: (): HistSnapshot => ({
      notebook: {} as Notebook,
      cardTypes: [],
      benches: clone(factory.benches) as Bench[],
      benchActive: factory.active,
    }),
    restore: (s) => {
      factory.benches = s.benches;
      factory.active = s.benchActive;
    },
  });
});

afterEach(() => {
  clearHistory();
});

describe('SideFactory — Step-by-step slot effect', () => {
  it('is offered in the Slot effects lane with a tooltip that says what it does', () => {
    const { container } = render(SideFactory);
    const chip = stepChip(container);
    expect(chip.getAttribute('title')).toBe(TIP);
    expect(chip.textContent).toContain('⏭');
  });

  it('toggles verbs.sequential on the selected bench slot, and off again (dropping empty verbs)', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'text-input');
    factory.sel = 1;
    const { container } = render(SideFactory);
    const chip = stepChip(container);
    expect(chip.classList.contains('on')).toBe(false);

    await fireEvent.click(chip);
    expect(activeBench().slots[1].verbs).toEqual({ sequential: true });
    expect(activeBench().slots[0].verbs).toBeUndefined();
    expect(chip.classList.contains('on')).toBe(true);

    await fireEvent.click(chip);
    expect(activeBench().slots[1].verbs).toBeUndefined();
    expect(chip.classList.contains('on')).toBe(false);
  });

  it('keeps other effects on the slot when toggled', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    factory.sel = 0;
    setSlotVerb(0, 'glow', true);
    const { container } = render(SideFactory);
    await fireEvent.click(stepChip(container));
    expect(activeBench().slots[0].verbs).toEqual({ glow: true, sequential: true });
    await fireEvent.click(stepChip(container));
    expect(activeBench().slots[0].verbs).toEqual({ glow: true });
  });

  it('is one undo step each way (history is pushed before the change)', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    factory.sel = 0;
    const { container } = render(SideFactory);
    expect(canUndo()).toBe(false);

    await fireEvent.click(stepChip(container));
    expect(activeBench().slots[0].verbs?.sequential).toBe(true);
    expect(canUndo()).toBe(true);

    undo();
    expect(activeBench().slots[0].verbs).toBeUndefined();
    redo();
    expect(activeBench().slots[0].verbs?.sequential).toBe(true);
  });

  it('with no slot selected it only asks for a selection (no change, no history)', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    factory.sel = null;
    const { container } = render(SideFactory);
    await fireEvent.click(stepChip(container));
    expect(toastState.message).toContain('select a slot first');
    expect(activeBench().slots[0].verbs).toBeUndefined();
    expect(canUndo()).toBe(false);
  });

  it('targets the back face when that face is being edited', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text', 'back');
    factory.face = 'back';
    factory.sel = 0;
    const { container } = render(SideFactory);
    await fireEvent.click(stepChip(container));
    expect(activeBench().back?.[0].verbs?.sequential).toBe(true);
    expect(activeBench().slots).toHaveLength(0);
  });

  it('the bench slot shows the same ⏭ glyph as the chip once the effect is on', () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'text');
    setSlotVerb(1, 'sequential', true);
    const { container } = render(CardView, {
      props: {
        card: benchFaceCard(b, false),
        surface: 'bench' as const,
        selected: false,
        state: {},
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
      },
    });
    const flags = [...container.querySelectorAll('.faceflag')].map((f) => f.textContent);
    expect(flags).toEqual(['⏭']);
  });
});
