import { describe, it, expect } from 'vitest';
import { openSealDraft, sealAsNew, sealReplace, type SealDraft } from './seal';
import type { Bench } from './bench.svelte';
import type { CardType } from './card-types';

function bench(over: Partial<Bench> = {}): Bench {
  return {
    id: 'bench_1',
    name: 'Widget',
    slots: [{ id: 'slot_1', type: 'text', props: { text: 'hi' } }],
    ...over,
  };
}

const existing: CardType = {
  id: 'ct_src',
  name: 'Widget',
  slots: [{ type: 'text', props: { text: 'old' } }],
  icon: '📊',
  store: 'write',
  varieties: [{ name: 'Blue', accent: '#6ea8fe' }],
};

function draft(over: Partial<SealDraft> = {}): SealDraft {
  return { name: 'Widget', note: '', icon: '', store: null, varieties: [], ...over };
}

describe('openSealDraft', () => {
  it('prefills from the bench when there is no source type', () => {
    const d = openSealDraft(bench({ name: 'Fresh', note: 'n', icon: '🎲' }), null);
    expect(d).toEqual({ name: 'Fresh', note: 'n', icon: '🎲', store: null, varieties: [] });
  });

  it('inherits the source type icon and store when forked', () => {
    const d = openSealDraft(bench({ varieties: undefined, icon: '' }), existing);
    expect(d.icon).toBe('📊');
    expect(d.store).toBe('write');
    expect(d.varieties).toEqual([{ name: 'Blue', accent: '#6ea8fe' }]);
  });

  it("prefers the bench's own varieties over the source's", () => {
    const d = openSealDraft(bench({ varieties: [{ name: 'Rose', accent: '#ff6b81' }] }), existing);
    expect(d.varieties).toEqual([{ name: 'Rose', accent: '#ff6b81' }]);
  });

  it('deep-copies varieties so edits do not leak back to the bench', () => {
    const b = bench({ varieties: [{ name: 'Rose', accent: '#ff6b81' }] });
    const d = openSealDraft(b, null);
    d.varieties[0].name = 'Changed';
    expect(b.varieties![0].name).toBe('Rose');
  });
});

describe('sealAsNew', () => {
  it('returns name-taken when the name collides, with no auto rename', () => {
    const out = sealAsNew(bench(), draft({ name: 'Quiz' }), ['Quiz', 'Note']);
    expect(out).toEqual({ kind: 'name-taken' });
  });

  it('mints a fresh id and carries all draft fields with id-stripped slots', () => {
    const out = sealAsNew(
      bench(),
      draft({ name: 'Widget', note: 'maker', icon: '🎯', store: 'practice', varieties: [{ name: 'A', accent: '#000' }] }),
      ['Other'],
    );
    expect(out.kind).toBe('new');
    if (out.kind !== 'new') return;
    expect(out.type.id).toMatch(/^ct_/);
    expect(out.type.name).toBe('Widget');
    expect(out.type.note).toBe('maker');
    expect(out.type.icon).toBe('🎯');
    expect(out.type.store).toBe('practice');
    expect(out.type.varieties).toEqual([{ name: 'A', accent: '#000' }]);
    expect(out.type.slots).toEqual([{ type: 'text', props: { text: 'hi' } }]);
    expect(out.type.slots[0]).not.toHaveProperty('id');
  });

  it('omits empty note/icon/varieties but keeps an explicit null store', () => {
    const out = sealAsNew(bench(), draft({ name: 'Bare' }), []);
    if (out.kind !== 'new') throw new Error('expected new');
    expect(out.type.note).toBeUndefined();
    expect(out.type.icon).toBeUndefined();
    expect(out.type.varieties).toBeUndefined();
    expect(out.type.store).toBeNull();
  });
});

describe('sealReplace', () => {
  it('keeps the existing type id and overwrites its fields from the draft', () => {
    const out = sealReplace(
      bench({ name: 'renamed' }),
      draft({ name: 'Widget v2', note: 'x', icon: '⚡', store: 'live', varieties: [] }),
      existing,
    );
    expect(out.kind).toBe('replace');
    expect(out.type.id).toBe('ct_src');
    expect(out.type.name).toBe('Widget v2');
    expect(out.type.note).toBe('x');
    expect(out.type.icon).toBe('⚡');
    expect(out.type.store).toBe('live');
    expect(out.type.varieties).toBeUndefined();
    expect(out.type.slots).toEqual([{ type: 'text', props: { text: 'hi' } }]);
  });
});
