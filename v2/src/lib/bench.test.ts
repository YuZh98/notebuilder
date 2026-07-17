import { describe, it, expect, beforeEach } from 'vitest';
import {
  factory,
  freshBench,
  activeBench,
  addBench,
  dupBench,
  delBench,
  benchToType,
  typeToBench,
  benchPreviewCard,
  setBenchVerb,
  addBenchSlot,
  deleteBenchSlot,
  updateBenchSlot,
  fuseBenchSlot,
  setSlotVerb,
  serializeFactory,
  hydrateFactory,
  type Bench,
} from './bench.svelte';
import type { CardType } from './card-types';

beforeEach(() => {
  hydrateFactory(null);
});

const sampleType: CardType = {
  id: 'ct_sample',
  name: 'Sample',
  verbs: { flip: true },
  slots: [{ type: 'text', props: { text: 'front' } }],
  back: [{ type: 'text', props: { text: 'back' } }],
  accent: '#6ea8fe',
  note: 'a note',
  icon: '📊',
  varieties: [{ name: 'Blue', accent: '#6ea8fe' }],
};

describe('freshBench', () => {
  it('names it New product with empty slots and a unique id', () => {
    const a = freshBench();
    const b = freshBench();
    expect(a.name).toBe('New product');
    expect(a.slots).toEqual([]);
    expect(a.id).not.toBe(b.id);
  });
});

describe('activeBench', () => {
  it('self-heals empty state to one fresh bench', () => {
    factory.benches = [];
    factory.active = null;
    const b = activeBench();
    expect(factory.benches.length).toBe(1);
    expect(factory.active).toBe(b.id);
  });

  it('self-heals a dangling active pointer to the first bench', () => {
    const b = freshBench();
    factory.benches = [b];
    factory.active = 'nonexistent';
    expect(activeBench().id).toBe(b.id);
    expect(factory.active).toBe(b.id);
  });
});

describe('addBench', () => {
  it('pushes, activates, and clears selection', () => {
    factory.sel = 3;
    const b = freshBench();
    addBench(b);
    expect(factory.benches.some((x) => x.id === b.id)).toBe(true);
    expect(factory.active).toBe(b.id);
    expect(factory.sel).toBe(null);
  });
});

describe('dupBench', () => {
  it('deep clones with fresh slot ids on front and back', () => {
    const src = typeToBench(sampleType);
    addBench(src);
    dupBench(src.id);
    const copy = factory.benches.find((b) => b.name === src.name + ' copy');
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe(src.id);
    expect(copy!.slots[0].id).not.toBe(src.slots[0].id);
    expect(copy!.back![0].id).not.toBe(src.back![0].id);
    expect(copy!.slots[0].props).toEqual(src.slots[0].props);
    copy!.slots[0].props.text = 'mutated';
    expect(src.slots[0].props.text).toBe('front');
  });
});

describe('delBench', () => {
  it('replaces the last bench with a fresh one', () => {
    factory.benches = [];
    factory.active = null;
    const only = activeBench();
    delBench(only.id);
    expect(factory.benches.length).toBe(1);
    expect(factory.benches[0].id).not.toBe(only.id);
    expect(factory.benches[0].name).toBe('New product');
    expect(factory.active).toBe(factory.benches[0].id);
  });

  it('reheals active when the active bench is deleted', () => {
    const a = freshBench();
    const b = freshBench();
    factory.benches = [a, b];
    factory.active = a.id;
    delBench(a.id);
    expect(factory.benches.length).toBe(1);
    expect(factory.active).toBe(b.id);
  });
});

describe('typeToBench', () => {
  it('forks with fresh slot ids and a src back-reference', () => {
    const bench = typeToBench(sampleType);
    expect(bench.name).toBe(sampleType.name);
    expect(bench.src).toEqual({ id: sampleType.id, name: sampleType.name });
    expect(bench.slots[0].props).toEqual(sampleType.slots[0].props);
    expect(typeof bench.slots[0].id).toBe('string');
    expect(bench.back![0].id).not.toBe(bench.slots[0].id);
    expect(bench.accent).toBe(sampleType.accent);
    expect(bench.varieties).toEqual(sampleType.varieties);
    bench.slots[0].props.text = 'changed';
    expect(sampleType.slots[0].props.text).toBe('front');
  });
});

describe('benchToType', () => {
  it('strips slot ids and round-trips props by value', () => {
    const bench = typeToBench(sampleType);
    const ct = benchToType(bench, 'Renamed');
    expect(ct.name).toBe('Renamed');
    expect(ct.slots[0]).not.toHaveProperty('id');
    expect(ct.back![0]).not.toHaveProperty('id');
    expect(ct.slots[0].props).toEqual(bench.slots[0].props);
    expect(ct.accent).toBe(bench.accent);
    expect(ct.note).toBe(bench.note);
    expect(ct.icon).toBe(bench.icon);
    expect(ct.varieties).toEqual(bench.varieties);
  });
});

describe('benchPreviewCard', () => {
  it('shares the live slot arrays (no clone)', () => {
    const bench = typeToBench(sampleType);
    const card = benchPreviewCard(bench);
    expect(card.slots).toBe(bench.slots);
    expect(card.back).toBe(bench.back);
  });
});

describe('setBenchVerb', () => {
  it('flip-on seeds back as a fresh-id, unshared clone of front and resets the face', () => {
    const b = freshBench();
    addBenchSlot(b, 'text');
    addBench(b);
    factory.face = 'back';
    factory.sel = 4;

    setBenchVerb(b, 'flip', true);

    expect(b.verbs?.flip).toBe(true);
    expect(b.back).toHaveLength(b.slots.length);
    expect(b.back![0].id).not.toBe(b.slots[0].id);
    expect(b.back![0].props).toEqual(b.slots[0].props);
    const frontText = b.slots[0].props.text;
    b.back![0].props.text = 'edited back';
    expect(b.slots[0].props.text).toBe(frontText);
    expect(factory.face).toBe('front');
    expect(factory.sel).toBe(null);
  });

  it('flip-on keeps an existing non-empty back untouched', () => {
    const b = typeToBench(sampleType);
    addBench(b);
    const backId = b.back![0].id;
    setBenchVerb(b, 'flip', true);
    expect(b.back![0].id).toBe(backId);
  });

  it('bare toggles without touching back or the face', () => {
    const b = freshBench();
    addBench(b);
    factory.face = 'back';
    setBenchVerb(b, 'bare', true);
    expect(b.verbs?.bare).toBe(true);
    expect(b.back).toBeUndefined();
    expect(factory.face).toBe('back');
  });

  it('turning both verbs off drops the verbs object', () => {
    const b = freshBench();
    b.verbs = { flip: true, bare: true };
    addBench(b);
    setBenchVerb(b, 'bare', false);
    setBenchVerb(b, 'flip', false);
    expect(b.verbs).toBeUndefined();
  });
});

describe('bench slot mutators', () => {
  it('addBenchSlot appends to front and back faces', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'text', 'back');
    expect(b.slots).toHaveLength(1);
    expect(b.slots[0].type).toBe('text');
    expect(b.slots[0].w).toBe(12);
    expect(b.back).toHaveLength(1);
  });

  it('deleteBenchSlot removes from either face', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'text', 'back');
    const frontId = b.slots[0].id;
    const backId = b.back![0].id;
    deleteBenchSlot(b, frontId);
    expect(b.slots).toHaveLength(0);
    deleteBenchSlot(b, backId);
    expect(b.back).toHaveLength(0);
  });

  it('updateBenchSlot writes props by id across faces', () => {
    const b = typeToBench(sampleType);
    addBench(b);
    updateBenchSlot(b, b.slots[0].id, { text: 'new front' });
    updateBenchSlot(b, b.back![0].id, { text: 'new back' });
    expect(b.slots[0].props).toEqual({ text: 'new front' });
    expect(b.back![0].props).toEqual({ text: 'new back' });
  });

  it('fuseBenchSlot commits both ratio widths', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'text');
    const [a, c] = b.slots;
    fuseBenchSlot(b, a.id, c.id, 1.5, 0.5);
    expect(a.fuseW).toBe(1.5);
    expect(c.fuseW).toBe(0.5);
  });

  it('addBenchSlot selects the new slot on the current face', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    expect(factory.sel).toBe(0);
    addBenchSlot(b, 'slider');
    expect(factory.sel).toBe(1);
  });

  it('addBenchSlot inserts at an explicit index', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    addBenchSlot(b, 'slider');
    addBenchSlot(b, 'choice', undefined, 1);
    expect(b.slots.map((s) => s.type)).toEqual(['text', 'choice', 'slider']);
    expect(factory.sel).toBe(1);
  });

  it('addBenchSlot does not select when adding off the current face', () => {
    const b = freshBench();
    addBench(b);
    factory.face = 'front';
    factory.sel = null;
    addBenchSlot(b, 'text', 'back');
    expect(factory.sel).toBe(null);
  });
});

describe('setSlotVerb', () => {
  it('seeds a default reveal config when turned on', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    setSlotVerb(0, 'reveal', true);
    expect(activeBench().slots[0].verbs?.reveal).toEqual({ key: 'pick', op: '==', val: 0 });
  });

  it('sets and clears glow, dropping empty verbs', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    setSlotVerb(0, 'glow', true);
    expect(activeBench().slots[0].verbs?.glow).toBe(true);
    setSlotVerb(0, 'glow', false);
    expect(activeBench().slots[0].verbs).toBeUndefined();
  });

  it('preserves an existing reveal config when re-enabled', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text');
    b.slots[0].verbs = { reveal: { key: 'score', op: '>=', val: 5 } };
    setSlotVerb(0, 'reveal', true);
    expect(b.slots[0].verbs?.reveal).toEqual({ key: 'score', op: '>=', val: 5 });
  });

  it('targets the back face when it is the current face', () => {
    const b = freshBench();
    addBench(b);
    addBenchSlot(b, 'text', 'back');
    factory.face = 'back';
    setSlotVerb(0, 'emphasis', true);
    expect(activeBench().back?.[0].verbs?.emphasis).toBe(true);
  });
});

describe('serialize/hydrate', () => {
  it('round-trips benches and active, resetting session-only fields', () => {
    const b = typeToBench(sampleType);
    addBench(b);
    factory.preview = true;
    factory.sel = 2;
    factory.face = 'back';
    const json = serializeFactory();

    factory.preview = false;
    hydrateFactory(json);

    expect(factory.active).toBe(b.id);
    const restored = factory.benches.find((x) => x.id === b.id);
    expect(restored).toBeDefined();
    expect(restored!.slots[0].props).toEqual(b.slots[0].props);
    expect(factory.preview).toBe(false);
    expect(factory.sel).toBe(null);
    expect(factory.face).toBe('front');
  });

  it('never persists preview/sel/face', () => {
    addBench(freshBench());
    factory.preview = true;
    factory.sel = 5;
    factory.face = 'back';
    const parsed = JSON.parse(serializeFactory());
    expect(parsed).not.toHaveProperty('preview');
    expect(parsed).not.toHaveProperty('sel');
    expect(parsed).not.toHaveProperty('face');
  });

  it('hydrates garbage into a fresh usable state', () => {
    hydrateFactory('garbage{');
    expect(factory.benches.length).toBe(1);
    expect(factory.benches[0].name).toBe('New product');
    expect(factory.active).toBe(factory.benches[0].id);
    expect(factory.preview).toBe(false);
    expect(factory.sel).toBe(null);
    expect(factory.face).toBe('front');
  });
});
