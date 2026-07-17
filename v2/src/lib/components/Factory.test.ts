import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import Factory from './Factory.svelte';
import App from '../../App.svelte';
import { mode } from '../stores/mode';
import { place } from '../stores/place';
import { factory, freshBench, addBenchSlot, hydrateFactory } from '../bench.svelte';

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

  it('deleting the active bench when it is the last self-heals to one fresh bench', async () => {
    const a = benchWithSlots();
    factory.benches = [a];
    factory.active = a.id;
    factory.preview = false;
    factory.sel = null;
    factory.face = 'front';
    const { container } = render(Factory, { props: props() });
    const head = container.querySelector(`.faccard[data-bench="${a.id}"] .bench-head`) as HTMLElement;
    const del = [...head.querySelectorAll('button')].find((x) => x.textContent?.includes('✕'));
    await fireEvent.click(del as HTMLElement);
    expect(factory.benches).toHaveLength(1);
    expect(factory.benches[0].id).not.toBe(a.id);
    expect(factory.benches[0].name).toBe('New product');
    expect(factory.benches[0].slots).toHaveLength(0);
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
    expect(container.querySelector('[data-benchprev]')).toHaveClass('furn');
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
