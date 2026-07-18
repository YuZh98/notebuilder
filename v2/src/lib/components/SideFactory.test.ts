import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SideFactory from './SideFactory.svelte';
import { factory, activeBench, addBenchSlot, hydrateFactory } from '../bench.svelte';
import { toastState } from '../toast.svelte';
import type { CardType } from '../card-types';

const type = (over: Partial<CardType> = {}): CardType => ({
  id: 'ct_a',
  name: 'Alpha',
  store: 'write',
  slots: [{ type: 'text', props: { text: 'x' } }],
  ...over,
});

function inventory(container: HTMLElement) {
  return [...container.querySelectorAll('.sect')].find((s) =>
    s.querySelector('h3')?.textContent?.includes('Inventory'),
  ) as HTMLElement;
}

beforeEach(() => {
  hydrateFactory(null);
});

function lanes(container: HTMLElement) {
  return [...container.querySelectorAll('.store-lane')];
}

describe('SideFactory', () => {
  it('renders a Slots palette with one chip per registered slot type', () => {
    const { container } = render(SideFactory);
    const palette = lanes(container)[0].querySelectorAll('.chip');
    const labels = [...palette].map((c) => c.textContent?.trim());
    expect(labels).toContain('text');
    expect(labels).toContain('slider');
    expect(palette.length).toBeGreaterThan(7);
  });

  it('clicking a palette chip adds a slot to the active face and selects it', async () => {
    const { container } = render(SideFactory);
    const text = [...lanes(container)[0].querySelectorAll('.chip')].find(
      (c) => c.textContent?.trim() === 'text',
    );
    await fireEvent.click(text as Element);
    expect(activeBench().slots).toHaveLength(1);
    expect(activeBench().slots[0].type).toBe('text');
    expect(factory.sel).toBe(0);
  });

  it('mounts on empty factory state without a state_unsafe_mutation throw, self-healing', () => {
    // Reproduces the browser/dev bug: no hydrate ran, so benches is empty at first render.
    factory.benches = [];
    factory.active = null;
    factory.sel = null;
    factory.face = 'front';
    factory.preview = false;
    expect(() => render(SideFactory)).not.toThrow();
    expect(factory.benches.length).toBe(1);
    expect(factory.active).toBe(factory.benches[0].id);
  });

  it('a card-mode chip toggles the container flip verb', async () => {
    const { container } = render(SideFactory);
    const flip = [...lanes(container)[1].querySelectorAll('.chip')].find((c) =>
      c.textContent?.includes('Flip'),
    );
    await fireEvent.click(flip as Element);
    expect(activeBench().verbs?.flip).toBe(true);
  });

  it('clicking a slot effect with no selection toasts', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    factory.sel = null;
    const { container } = render(SideFactory);
    const glow = [...lanes(container)[2].querySelectorAll('.chip')].find((c) =>
      c.textContent?.includes('Glow'),
    );
    await fireEvent.click(glow as Element);
    expect(toastState.message).toContain('select a slot first');
    expect(activeBench().slots[0].verbs?.glow).toBeUndefined();
  });

  it('clicking a slot effect with a selection applies it', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    factory.sel = 0;
    const { container } = render(SideFactory);
    const glow = [...lanes(container)[2].querySelectorAll('.chip')].find((c) =>
      c.textContent?.includes('Glow'),
    );
    await fireEvent.click(glow as Element);
    expect(activeBench().slots[0].verbs?.glow).toBe(true);
  });

  it('clicking a colour swatch sets the bench accent', async () => {
    const { container } = render(SideFactory);
    const blue = [...lanes(container)[3].querySelectorAll('.swatch')].find(
      (s) => s.getAttribute('title') === 'Blue',
    );
    await fireEvent.click(blue as Element);
    expect(activeBench().accent).toBe('#6ea8fe');
  });

  it('the Default swatch clears the accent', async () => {
    const b = activeBench();
    b.accent = '#6ea8fe';
    const { container } = render(SideFactory);
    const def = [...lanes(container)[3].querySelectorAll('.swatch')].find(
      (s) => s.getAttribute('title') === 'Default',
    );
    await fireEvent.click(def as Element);
    expect(activeBench().accent).toBeUndefined();
  });

  it('renders SlotConfig only when a slot is selected', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    factory.sel = null;
    const { container } = render(SideFactory);
    expect(container.textContent).not.toContain('Slot: text');
    factory.sel = 0;
    await tick();
    expect(container.textContent).toContain('Slot: text');
  });

  it('the split slider preserves the fused pair total instead of forcing 2', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'text');
    b.slots[0].fuse = true;
    b.slots[0].fuseW = 1.5;
    b.slots[1].fuseW = 1.0;
    factory.sel = 0;
    const { container } = render(SideFactory);
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    await fireEvent.input(range, { target: { value: '30' } });
    const sum = (b.slots[0].fuseW ?? 1) + (b.slots[1].fuseW ?? 1);
    expect(Number(sum.toFixed(2))).toBe(2.5);
    expect(b.slots[0].fuseW).toBe(0.75);
    expect(b.slots[1].fuseW).toBe(1.75);
  });

  it('palette chips carry the nb-slot drag payload', () => {
    const { container } = render(SideFactory);
    const chip = lanes(container)[0].querySelector('.chip') as HTMLElement;
    expect(chip.getAttribute('draggable')).toBe('true');
  });

  it('groups inventory by store with a Workshop lane for store-less types', () => {
    const { container } = render(SideFactory, {
      props: { cardTypes: [type(), type({ id: 'ct_k', name: 'Kilo', store: null })] },
    });
    const invLanes = inventory(container).querySelectorAll('.store-lane');
    expect(invLanes).toHaveLength(4); // Workshop + write + practice + live
    const workshop = [...invLanes].find((l) => l.querySelector('h4')?.textContent?.includes('Workshop'));
    expect(workshop?.textContent).toContain('Kilo');
    expect(workshop?.textContent).not.toContain('Alpha');
  });

  it('clicking an inventory chip forks the type into a new active bench', async () => {
    const { container } = render(SideFactory, { props: { cardTypes: [type()] } });
    const before = factory.benches.length;
    const chip = [...inventory(container).querySelectorAll('.prodchip')].find((c) =>
      c.textContent?.includes('Alpha'),
    );
    await fireEvent.click(chip as Element);
    expect(factory.benches.length).toBe(before + 1);
    expect(activeBench().name).toBe('Alpha');
    expect(activeBench().src?.id).toBe('ct_a');
    expect(toastState.message).toContain('copied');
  });

  it('the inventory ✕ fires ondelprod for its type', async () => {
    const ondelprod = vi.fn();
    const { container } = render(SideFactory, { props: { cardTypes: [type()], ondelprod } });
    const wrap = [...inventory(container).querySelectorAll('.prodchip-wrap')].find((w) =>
      w.textContent?.includes('Alpha'),
    );
    await fireEvent.click(wrap?.querySelector('.chipx') as Element);
    expect(ondelprod).toHaveBeenCalledTimes(1);
    expect(ondelprod.mock.calls[0][0].id).toBe('ct_a');
  });

  it('hides the inventory while a slot is selected', async () => {
    const b = activeBench();
    addBenchSlot(b, 'text');
    factory.sel = 0;
    const { container } = render(SideFactory, { props: { cardTypes: [type()] } });
    expect(inventory(container)).toBeUndefined();
  });
});
