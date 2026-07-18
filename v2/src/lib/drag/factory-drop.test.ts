import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFactoryDropCallbacks, type FactoryDropDeps } from './factory-drop';
import { factory, freshBench, activeBench, addBench, addBenchSlot, hydrateFactory } from '../bench.svelte';
import { toastState, dismissToast } from '../toast.svelte';
import type { CardType } from '../card-types';

const prodType: CardType = {
  id: 'ct_note',
  name: 'Note',
  slots: [{ type: 'text', props: { text: 'hi' } }],
};

function depsOf(over: Partial<FactoryDropDeps> = {}): FactoryDropDeps {
  return {
    cardType: (id) => (id === prodType.id ? prodType : undefined),
    setStore: vi.fn(),
    storeName: (s) => `store-${s}`,
    confirmDelete: vi.fn(() => Promise.resolve(true)),
    ...over,
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r));

beforeEach(() => {
  hydrateFactory(null);
  dismissToast();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('product drops', () => {
  it('lane target remaps the store and toasts (v1 :89)', () => {
    const deps = depsOf();
    const cb = makeFactoryDropCallbacks(deps);
    const lane = document.createElement('div');
    lane.dataset.lane = 'write';
    cb.onDrop({ kind: 'product', id: 'ct_note', srcEl: document.createElement('button') }, { kind: 'lane', el: lane });
    expect(deps.setStore).toHaveBeenCalledWith(prodType, 'write');
    expect(toastState.message).toContain('moved to');
  });

  it('an empty lane id remaps to the Workshop (null store)', () => {
    const deps = depsOf();
    const cb = makeFactoryDropCallbacks(deps);
    const lane = document.createElement('div');
    lane.dataset.lane = '';
    cb.onDrop({ kind: 'product', id: 'ct_note', srcEl: document.createElement('button') }, { kind: 'lane', el: lane });
    expect(deps.setStore).toHaveBeenCalledWith(prodType, null);
    expect(toastState.message).toBe('moved to Workshop');
  });

  it('a factory grid forks a fresh editable bench (v1 :71,94)', () => {
    const cb = makeFactoryDropCallbacks(depsOf());
    const before = factory.benches.length;
    const grid = document.createElement('div');
    grid.className = 'fac-grid';
    cb.onDrop({ kind: 'product', id: 'ct_note', srcEl: document.createElement('button') }, { kind: 'grid', grid, idx: 0 });
    expect(factory.benches.length).toBe(before + 1);
    const copy = factory.benches.at(-1)!;
    expect(copy.name).toBe('Note');
    expect(copy.src).toEqual({ id: 'ct_note', name: 'Note' });
    expect(factory.active).toBe(copy.id);
    expect(toastState.message).toContain('forked');
  });
});

describe('bench drops', () => {
  function seed3() {
    const a = freshBench();
    const b = freshBench();
    const c = freshBench();
    factory.benches = [a, b, c];
    factory.active = a.id;
    return { a, b, c };
  }

  it('a grid target reorders the bench list', () => {
    const { a, b, c } = seed3();
    const cb = makeFactoryDropCallbacks(depsOf());
    const grid = document.createElement('div');
    grid.className = 'fac-grid';
    cb.onDrop({ kind: 'bench', id: a.id, srcEl: document.createElement('div') }, { kind: 'grid', grid, idx: 2 });
    expect(factory.benches.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
  });

  it('dustbin with more than one bench confirms then deletes', async () => {
    const { a, b } = seed3();
    const deps = depsOf();
    const cb = makeFactoryDropCallbacks(deps);
    cb.onDrop({ kind: 'bench', id: a.id, srcEl: document.createElement('div') }, { kind: 'dust' });
    await flush();
    expect(deps.confirmDelete).toHaveBeenCalledTimes(1);
    expect(factory.benches.some((x) => x.id === a.id)).toBe(false);
    void b;
  });

  it('dustbin on the last bench confirms, then replaces it with one fresh bench', async () => {
    const only = freshBench();
    factory.benches = [only];
    factory.active = only.id;
    const deps = depsOf();
    const cb = makeFactoryDropCallbacks(deps);
    cb.onDrop({ kind: 'bench', id: only.id, srcEl: document.createElement('div') }, { kind: 'dust' });
    await flush();
    expect(deps.confirmDelete).toHaveBeenCalledTimes(1);
    expect(factory.benches).toHaveLength(1);
    expect(factory.benches[0].id).not.toBe(only.id);
    expect(factory.benches[0].name).toBe('New product');
  });

  it('a declined confirm keeps the bench', async () => {
    const { a } = seed3();
    const deps = depsOf({ confirmDelete: vi.fn(() => Promise.resolve(false)) });
    const cb = makeFactoryDropCallbacks(deps);
    cb.onDrop({ kind: 'bench', id: a.id, srcEl: document.createElement('div') }, { kind: 'dust' });
    await flush();
    expect(factory.benches.some((x) => x.id === a.id)).toBe(true);
  });
});

describe('slot drops', () => {
  function activeCardrow(): { grid: HTMLElement } {
    const faccard = document.createElement('div');
    faccard.className = 'faccard';
    faccard.dataset.bench = factory.active!;
    const grid = document.createElement('div');
    grid.className = 'cardrow';
    faccard.appendChild(grid);
    document.body.appendChild(faccard);
    return { grid };
  }

  it('a grid target reorders within the active face', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'slider');
    addBenchSlot(b, 'choice');
    const { grid } = activeCardrow();
    const firstId = activeBench().slots[0].id;
    const cb = makeFactoryDropCallbacks(depsOf());
    cb.onDrop({ kind: 'slot', id: firstId, srcEl: document.createElement('div') }, { kind: 'grid', grid, idx: 2 });
    expect(activeBench().slots.map((s) => s.type)).toEqual(['slider', 'choice', 'text']);
    expect(factory.sel).toBe(2);
  });

  it('ignores a cardrow that is not the active bench', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'slider');
    const faccard = document.createElement('div');
    faccard.className = 'faccard';
    faccard.dataset.bench = 'someone-else';
    const grid = document.createElement('div');
    grid.className = 'cardrow';
    faccard.appendChild(grid);
    document.body.appendChild(faccard);
    const firstId = activeBench().slots[0].id;
    const cb = makeFactoryDropCallbacks(depsOf());
    cb.onDrop({ kind: 'slot', id: firstId, srcEl: document.createElement('div') }, { kind: 'grid', grid, idx: 1 });
    expect(activeBench().slots.map((s) => s.type)).toEqual(['text', 'slider']);
  });

  it('dustbin deletes the slot', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'slider');
    const cb = makeFactoryDropCallbacks(depsOf());
    cb.onDrop({ kind: 'slot', id: b.slots[0].id, srcEl: document.createElement('div') }, { kind: 'dust' });
    expect(activeBench().slots.map((s) => s.type)).toEqual(['slider']);
    expect(toastState.message).toBe('slot deleted (Undo to restore)');
  });
});
