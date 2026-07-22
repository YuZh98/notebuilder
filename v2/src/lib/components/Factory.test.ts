import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import Factory from './Factory.svelte';
import App from '../../App.svelte';
import { mode } from '../stores/mode';
import { place } from '../stores/place';
import { factory, freshBench, addBenchSlot, hydrateFactory, activeBench } from '../bench.svelte';
import { startPointerDrag, _setElementFromPoint } from '../drag/engine';
import { makeFactoryDropCallbacks } from '../drag/factory-drop';

function pev(t: string, x: number, y = 0): PointerEvent {
  return new MouseEvent(t, { clientX: x, clientY: y, bubbles: true, cancelable: true }) as PointerEvent;
}

function benchWithSlots(): ReturnType<typeof freshBench> {
  const b = freshBench();
  addBenchSlot(b, 'text');
  return b;
}

function seed() {
  const a = benchWithSlots();
  const bb = benchWithSlots();
  factory.benches = [a, bb];
  factory.active = a.id;
  factory.preview = false;
  factory.sel = null;
  factory.face = 'front';
  return { a, bb };
}

beforeEach(() => {
  hydrateFactory(null);
  mode.set('edit');
});
afterEach(() => mode.set('edit'));

const props = () => ({ onseal: vi.fn() });
const flush = () => new Promise<void>((r) => setTimeout(r));

describe('Factory — Build stage', () => {
  it('renders one .faccard per bench inside .fac-grid', () => {
    seed();
    const { container } = render(Factory, { props: props() });
    expect(container.querySelector('.fac-grid')).toBeInTheDocument();
    expect(container.querySelectorAll('.faccard')).toHaveLength(2);
  });

  it('marks only the active bench with .on', () => {
    const { a } = seed();
    const { container } = render(Factory, { props: props() });
    const active = container.querySelector(`.faccard[data-bench="${a.id}"]`);
    expect(active).toHaveClass('on');
    expect(container.querySelectorAll('.faccard.on')).toHaveLength(1);
  });

  it('active bench shows Duplicate/Seal/Delete and the editable slot grid', () => {
    const { a } = seed();
    const { container } = render(Factory, { props: props() });
    const active = container.querySelector(`.faccard[data-bench="${a.id}"]`) as HTMLElement;
    expect(active.querySelector('.bench-head')?.textContent).toContain('Duplicate');
    expect(active.querySelector('.bench-head')?.textContent).toContain('Seal');
    // the reused CardView builder chrome: editable card shell + slot adder
    expect(active.querySelector('.bench .furn')).toBeInTheDocument();
    expect(active.querySelector('.slot-adder')).toBeInTheDocument();
    expect(active.querySelector('.cardslot')).toBeInTheDocument();
  });

  it('non-active benches render a collapsed read-only preview, no builder chrome', () => {
    const { bb } = seed();
    const { container } = render(Factory, { props: props() });
    const collapsed = container.querySelector(`.faccard[data-bench="${bb.id}"]`) as HTMLElement;
    expect(collapsed).not.toHaveClass('on');
    expect(collapsed.querySelector('.prod.pv')).toBeInTheDocument();
    expect(collapsed.querySelector('.slot-adder')).toBeNull();
    expect(collapsed.textContent).not.toContain('Duplicate');
  });

  it('clicking a collapsed bench activates it', async () => {
    const { a, bb } = seed();
    const { container } = render(Factory, { props: props() });
    expect(factory.active).toBe(a.id);
    await fireEvent.click(container.querySelector(`.faccard[data-bench="${bb.id}"]`) as Element);
    expect(factory.active).toBe(bb.id);
    await tick();
    expect(container.querySelector(`.faccard[data-bench="${bb.id}"]`)).toHaveClass('on');
  });

  it('Seal fires onseal with the bench id', async () => {
    const { a } = seed();
    const p = props();
    const { container } = render(Factory, { props: p });
    const active = container.querySelector(`.faccard[data-bench="${a.id}"]`) as HTMLElement;
    const seal = [...active.querySelectorAll('button')].find((x) => x.textContent?.includes('Seal'));
    await fireEvent.click(seal as HTMLElement);
    expect(p.onseal).toHaveBeenCalledWith(a.id);
  });

  it('Duplicate adds a bench and activates the copy', async () => {
    const { a } = seed();
    const { container } = render(Factory, { props: props() });
    const active = container.querySelector(`.faccard[data-bench="${a.id}"]`) as HTMLElement;
    const dup = [...active.querySelectorAll('button')].find((x) => x.textContent?.includes('Duplicate'));
    await fireEvent.click(dup as HTMLElement);
    expect(factory.benches).toHaveLength(3);
    expect(factory.active).not.toBe(a.id);
  });

  it('the ✕ delete confirms, then self-heals the last bench to one fresh bench', async () => {
    const a = benchWithSlots();
    factory.benches = [a];
    factory.active = a.id;
    factory.preview = false;
    factory.sel = null;
    factory.face = 'front';
    const confirm = vi.fn(() => Promise.resolve(true));
    const { container } = render(Factory, { props: { onseal: vi.fn(), confirm } });
    const head = container.querySelector(`.faccard[data-bench="${a.id}"] .bench-head`) as HTMLElement;
    const del = [...head.querySelectorAll('button')].find((x) => x.textContent?.includes('✕'));
    await fireEvent.click(del as HTMLElement);
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(factory.benches).toHaveLength(1);
    expect(factory.benches[0].id).not.toBe(a.id);
    expect(factory.benches[0].name).toBe('New product');
    expect(factory.benches[0].slots).toHaveLength(0);
  });

  it('a declined ✕ confirm keeps the bench', async () => {
    const { a } = seed();
    const confirm = vi.fn(() => Promise.resolve(false));
    const { container } = render(Factory, { props: { onseal: vi.fn(), confirm } });
    const head = container.querySelector(`.faccard[data-bench="${a.id}"] .bench-head`) as HTMLElement;
    const del = [...head.querySelectorAll('button')].find((x) => x.textContent?.includes('✕'));
    await fireEvent.click(del as HTMLElement);
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(factory.benches.some((x) => x.id === a.id)).toBe(true);
  });

  it('Preview is a live study: dragging a slider updates a dependent compute, bench untouched', async () => {
    const b = freshBench();
    addBenchSlot(b, 'slider');
    addBenchSlot(b, 'compute');
    b.slots[0].props = { key: 'a', value: 50, min: 0, max: 100, step: 1 };
    b.slots[1].props = { expr: 'a', out: 'echo', note: 'echo =' };
    factory.benches = [b];
    factory.active = b.id;
    factory.preview = true;
    factory.sel = null;
    factory.face = 'front';
    const { container } = render(Factory, { props: props() });
    await flush();
    await tick();
    const prev = container.querySelector(`[data-benchprev="${b.id}"]`) as HTMLElement;
    const range = prev.querySelector('input[type="range"]') as HTMLInputElement;
    expect(prev.querySelector('.compute-study .val')?.textContent).toBe('50');
    range.value = '80';
    await fireEvent.input(range);
    await tick();
    expect(prev.querySelector('.compute-study .val')?.textContent).toBe('80');
    // The real bench is never mutated by a preview interaction.
    expect((b.slots[0].props as { value: number }).value).toBe(50);
  });

  it('flip container shows the Front/Back face chips', () => {
    const { a } = seed();
    a.verbs = { flip: true };
    a.back = [];
    const { container } = render(Factory, { props: props() });
    const chips = container.querySelector('.bench-faces');
    expect(chips?.textContent).toContain('Front');
    expect(chips?.textContent).toContain('Back');
  });
});

function dt(map: Record<string, string>) {
  return {
    types: Object.keys(map),
    getData: (k: string) => map[k] ?? '',
    setData: () => {},
    dropEffect: 'none',
  };
}

describe('Factory — empty state', () => {
  it('mounts on empty factory state without throwing, self-healing to one bench', () => {
    factory.benches = [];
    factory.active = null;
    factory.sel = null;
    factory.face = 'front';
    factory.preview = false;
    expect(() => render(Factory, { props: props() })).not.toThrow();
    expect(factory.benches.length).toBe(1);
    expect(factory.active).toBe(factory.benches[0].id);
  });
});

describe('Factory — selected slot visual', () => {
  const cells = (container: HTMLElement, id: string) =>
    container.querySelectorAll(`.faccard[data-bench="${id}"] .bench .cardslot[data-sid]`);

  it('marks the active-face cell at factory.sel with .sel, and only that one', () => {
    const { a } = seed();
    addBenchSlot(a, 'slider');
    factory.sel = 1;
    const { container } = render(Factory, { props: props() });
    const c = cells(container, a.id);
    expect(c[0].classList.contains('sel')).toBe(false);
    expect(c[1].classList.contains('sel')).toBe(true);
    expect(container.querySelectorAll(`.faccard[data-bench="${a.id}"] .bench .sel`)).toHaveLength(1);
  });

  it('changing factory.sel moves the highlight', async () => {
    const { a } = seed();
    addBenchSlot(a, 'slider');
    factory.sel = 0;
    const { container } = render(Factory, { props: props() });
    const sel = () =>
      container.querySelector(`.faccard[data-bench="${a.id}"] .bench .cardslot.sel`);
    expect(sel()?.getAttribute('data-sid')).toBe(a.slots[0].id);
    factory.sel = 1;
    await tick();
    expect(sel()?.getAttribute('data-sid')).toBe(a.slots[1].id);
  });

  it('renders no .sel cell when factory.sel is null', () => {
    const { a } = seed();
    factory.sel = null;
    const { container } = render(Factory, { props: props() });
    expect(
      container.querySelector(`.faccard[data-bench="${a.id}"] .bench .cardslot.sel`),
    ).toBeNull();
  });
});

describe('Factory — decorator drops', () => {
  it('nb-slot dropped on the bench grid adds a slot to the active face', async () => {
    const { a } = seed();
    const { container } = render(Factory, { props: props() });
    const grid = container.querySelector(`.faccard[data-bench="${a.id}"] .bench`) as HTMLElement;
    await fireEvent.drop(grid, { dataTransfer: dt({ 'text/nb-slot': 'slider' }) });
    expect(factory.benches[0].slots.map((s) => s.type)).toEqual(['text', 'slider']);
  });

  it('nb-sverb dropped on a bench slot applies the effect and selects it', async () => {
    const { a } = seed();
    const { container } = render(Factory, { props: props() });
    const cell = container.querySelector(
      `.faccard[data-bench="${a.id}"] .cardslot[data-sid]`,
    ) as HTMLElement;
    await fireEvent.drop(cell, { dataTransfer: dt({ 'text/nb-sverb': 'glow' }) });
    expect(factory.benches[0].slots[0].verbs?.glow).toBe(true);
    expect(factory.sel).toBe(0);
  });

  it('nb-verb dropped on the container turns on the flip mode', async () => {
    const { a } = seed();
    const { container } = render(Factory, { props: props() });
    const faccard = container.querySelector(`.faccard[data-bench="${a.id}"]`) as HTMLElement;
    await fireEvent.drop(faccard, { dataTransfer: dt({ 'text/nb-verb': 'flip' }) });
    expect(factory.benches[0].verbs?.flip).toBe(true);
  });

  it('nb-col dropped on the container sets the accent', async () => {
    const { a } = seed();
    const { container } = render(Factory, { props: props() });
    const faccard = container.querySelector(`.faccard[data-bench="${a.id}"]`) as HTMLElement;
    await fireEvent.drop(faccard, { dataTransfer: dt({ 'text/nb-col': '#54d6a0' }) });
    expect(factory.benches[0].accent).toBe('#54d6a0');
  });
});

describe('Factory — bench slot selection', () => {
  it('the bench grid carries the .bench-grid class', () => {
    const { a } = seed();
    const { container } = render(Factory, { props: props() });
    const bench = container.querySelector(`.faccard[data-bench="${a.id}"] .bench`);
    expect(bench).toHaveClass('bench-grid');
  });

  it('clicking a bench slot cell selects it', async () => {
    const { a } = seed();
    factory.sel = null;
    const { container } = render(Factory, { props: props() });
    const cell = container.querySelector(
      `.faccard[data-bench="${a.id}"] .cardslot[data-sid]`,
    ) as HTMLElement;
    await fireEvent.click(cell);
    expect(factory.sel).toBe(0);
  });

  it('clicking the bench background clears the selection', async () => {
    const { a } = seed();
    factory.sel = 0;
    const { container } = render(Factory, { props: props() });
    const bench = container.querySelector(`.faccard[data-bench="${a.id}"] .bench`) as HTMLElement;
    await fireEvent.click(bench);
    expect(factory.sel).toBeNull();
  });

  it('clicking the card frame (not a slot) clears the selection — single bench trap', async () => {
    const { a } = seed();
    factory.sel = 0;
    const { container } = render(Factory, { props: props() });
    // Click a non-slot element inside the bench (e.g. the card wrapper .furn)
    const furn = container.querySelector(`.faccard[data-bench="${a.id}"] .bench .furn[data-card]`) as HTMLElement;
    expect(furn).not.toBeNull();
    await fireEvent.click(furn);
    expect(factory.sel).toBeNull();
  });

  it('clicking the inline slot delete ✕ keeps the selection on the same slot, not a shifted one', async () => {
    const { a } = seed();
    addBenchSlot(a, 'slider');
    addBenchSlot(a, 'choice');
    factory.sel = 2;
    const firstId = a.slots[0].id;
    const selectedId = a.slots[2].id;
    const { container } = render(Factory, { props: props() });
    const dels = container.querySelectorAll(
      `.faccard[data-bench="${a.id}"] .bench .slot-del`,
    );
    await fireEvent.click(dels[0] as HTMLElement);
    expect(factory.benches[0].slots.map((s) => s.id)).not.toContain(firstId);
    expect(factory.sel).toBe(1);
    expect(factory.benches[0].slots[factory.sel!].id).toBe(selectedId);
  });

  it('clicking a fused sub-cell selects that slot', async () => {
    const { a } = seed();
    addBenchSlot(a, 'slider');
    a.slots[0].fuse = true;
    factory.sel = null;
    const { container } = render(Factory, { props: props() });
    const cells = container.querySelectorAll(
      `.faccard[data-bench="${a.id}"] .bench .fusecell[data-sid]`,
    );
    expect(cells).toHaveLength(2);
    await fireEvent.click(cells[1] as HTMLElement);
    expect(factory.sel).toBe(1);
  });
});

describe('Factory — bench slot drag (pointer engine)', () => {
  afterEach(() => {
    document.dispatchEvent(pev('pointerup', 0, 0));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    _setElementFromPoint(null);
  });

  it('dragging a bench slot to the row end reorders it within the active face', async () => {
    const a = freshBench();
    addBenchSlot(a, 'text');
    addBenchSlot(a, 'slider');
    addBenchSlot(a, 'choice');
    factory.benches = [a];
    factory.active = a.id;
    factory.preview = false;
    factory.sel = null;
    factory.face = 'front';
    const firstId = a.slots[0].id;
    const cb = makeFactoryDropCallbacks({
      cardType: () => undefined,
      setStore: () => {},
      storeName: () => '',
      confirmDelete: () => Promise.resolve(true),
    });
    const ongripslot = (id: string, e: PointerEvent, el: HTMLElement) =>
      startPointerDrag({ kind: 'slot', id, srcEl: el }, e, cb);
    const { container } = render(Factory, { props: { onseal: vi.fn(), ongripslot } });
    const row = container.querySelector(`.faccard[data-bench="${a.id}"] .cardrow`) as HTMLElement;
    const cell = container.querySelector(
      `.faccard[data-bench="${a.id}"] .cardslot[data-sid="${firstId}"]`,
    ) as HTMLElement;
    _setElementFromPoint(() => row); // hovering the row past every cell → append
    await fireEvent(cell, pev('pointerdown', 0, 0));
    document.dispatchEvent(pev('pointermove', 80, 80));
    document.dispatchEvent(pev('pointerup', 80, 80));
    expect(activeBench().slots.map((s) => s.type)).toEqual(['slider', 'choice', 'text']);
  });
});

describe('Factory — fused bench-slot drag (carried fix a)', () => {
  afterEach(() => {
    document.dispatchEvent(pev('pointerup', 0, 0));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  it('pressing a fused sub-cell starts a drag for THAT slot, not the whole .cardslot', async () => {
    const a = freshBench();
    addBenchSlot(a, 'text');
    addBenchSlot(a, 'slider');
    a.slots[0].fuse = true; // fuse the pair → two .fusecell members in one .cardslot
    factory.benches = [a];
    factory.active = a.id;
    factory.preview = false;
    factory.sel = null;
    factory.face = 'front';
    const ongripslot = vi.fn();
    const { container } = render(Factory, { props: { onseal: vi.fn(), ongripslot } });
    const cells = container.querySelectorAll(
      `.faccard[data-bench="${a.id}"] .bench .fusecell[data-sid]`,
    );
    expect(cells).toHaveLength(2);
    await fireEvent(cells[1], pev('pointerdown', 0, 0));
    expect(ongripslot).toHaveBeenCalledTimes(1);
    expect(ongripslot.mock.calls[0][0]).toBe(a.slots[1].id);
  });
});

describe('Factory — single-face Build (carried fix c)', () => {
  function flipBench() {
    const a = freshBench();
    a.verbs = { flip: true };
    addBenchSlot(a, 'text');
    a.slots[0].props = { text: 'FRONT-FACE' };
    a.back = [{ id: 'back_1', type: 'text', props: { text: 'BACK-FACE' }, w: 12 }];
    factory.benches = [a];
    factory.active = a.id;
    factory.preview = false;
    factory.sel = null;
    factory.face = 'front';
    return a;
  }

  it('Build renders only the active face — no dual-face .fc-edit', () => {
    const a = flipBench();
    const { container } = render(Factory, { props: props() });
    const build = container.querySelector(`.faccard[data-bench="${a.id}"] .bench`) as HTMLElement;
    expect(build.querySelector('.fc-edit')).toBeNull();
    expect(build.querySelector('.cardslot[data-sid]')?.getAttribute('data-sid')).toBe(a.slots[0].id);
    expect(build.textContent).toContain('FRONT-FACE');
    expect(build.textContent).not.toContain('BACK-FACE');
  });

  it('switching the Back chip swaps the rendered face', async () => {
    const a = flipBench();
    const { container } = render(Factory, { props: props() });
    const backChip = [...container.querySelectorAll('.bench-faces .chip')].find(
      (c) => c.textContent?.includes('Back'),
    ) as HTMLElement;
    await fireEvent.click(backChip);
    await tick();
    const build = container.querySelector(`.faccard[data-bench="${a.id}"] .bench`) as HTMLElement;
    expect(build.textContent).toContain('BACK-FACE');
    expect(build.textContent).not.toContain('FRONT-FACE');
    expect(build.querySelector('.cardslot[data-sid]')?.getAttribute('data-sid')).toBe(a.back![0].id);
  });

  it('edits through the single-face card mutate the bench; the adder targets the active face', async () => {
    const a = flipBench();
    const { container } = render(Factory, { props: props() });
    const b = factory.benches[0]; // read through the reactive proxy, not the raw seed object
    // Deleting the front slot via the rendered card's inline ✕ removes it from the bench (shared ref).
    const del = container.querySelector(
      `.faccard[data-bench="${a.id}"] .bench .slot-del`,
    ) as HTMLElement;
    await fireEvent.click(del);
    expect(b.slots.length).toBe(0);

    // Switch to Back via the chip, then the single "+ slot" adder appends to the BACK face.
    const backChip = [...container.querySelectorAll('.bench-faces .chip')].find(
      (c) => c.textContent?.includes('Back'),
    ) as HTMLElement;
    await fireEvent.click(backChip);
    await tick();
    const adder = [...container.querySelectorAll(`.faccard[data-bench="${a.id}"] .slot-adder button`)].find(
      (btn) => btn.textContent?.includes('+ slot'),
    ) as HTMLElement;
    await fireEvent.click(adder);
    expect(b.back!.length).toBe(2);
    expect(b.slots.length).toBe(0);
  });
});

describe('Factory — Preview stage', () => {
  it('renders every bench with no builder chrome', () => {
    seed();
    factory.preview = true;
    const { container } = render(Factory, { props: props() });
    expect(container.querySelectorAll('[data-benchprev]')).toHaveLength(2);
    expect(container.querySelector('.benchcard')).toBeNull();
    expect(container.querySelector('.slot-adder')).toBeNull();
    expect(container.textContent).not.toContain('Duplicate');
  });

  it('shows the bench name as a caption', () => {
    const { a } = seed();
    a.name = 'Photosynthesis';
    factory.preview = true;
    const { container } = render(Factory, { props: props() });
    expect(container.querySelector('.bench-caption')?.textContent).toBe('Photosynthesis');
  });

  it('renders each bench as a live study card even while the house is in Edit mode', () => {
    const { a } = seed();
    mode.set('edit');
    a.verbs = { flip: true };
    a.back = [];
    factory.preview = true;
    const { container } = render(Factory, { props: props() });
    // forceMode="study" wins over the house Edit mode: interactive flip, not read-only fc-edit
    expect(container.querySelector('[data-benchprev] .fc')).toBeInTheDocument();
    expect(container.querySelector('.fc-edit')).toBeNull();
    // furn-style wrapper, not the collapsed .prod.pv thumbnail
    expect(container.querySelector('.prod.pv')).toBeNull();
    // wrapper is a plain .benchprev; CardView's own root carries the single .furn
    const prev = container.querySelector('[data-benchprev]')!;
    expect(prev).toHaveClass('benchprev');
    expect(prev).not.toHaveClass('furn');
    expect(prev.querySelectorAll('.furn')).toHaveLength(1);
    expect(prev.querySelectorAll('.furn .furn')).toHaveLength(0);
  });
});

describe('Factory — place-aware Cmd+Enter (App)', () => {
  afterEach(() => {
    place.set('house');
    mode.set('edit');
    factory.preview = false;
  });

  it('in factory, Cmd+Enter toggles Build/Preview and leaves house mode', async () => {
    hydrateFactory(null);
    place.set('factory');
    mode.set('edit');
    factory.preview = false;
    render(App);
    await tick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, cancelable: true }));
    await tick();
    expect(factory.preview).toBe(true);
    expect(get(mode)).toBe('edit');
  });

  it('in house, Cmd+Enter toggles mode and leaves factory preview', async () => {
    hydrateFactory(null);
    place.set('house');
    mode.set('edit');
    factory.preview = false;
    render(App);
    await tick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, cancelable: true }));
    await tick();
    expect(get(mode)).toBe('study');
    expect(factory.preview).toBe(false);
  });
});
