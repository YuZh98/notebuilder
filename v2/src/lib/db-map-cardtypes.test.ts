import { describe, it, expect } from 'vitest';
import { cardTypeChanges } from './db-map';
import type { CardType } from './card-types';

const ct = (id: string, name = id, extra: Partial<CardType> = {}): CardType =>
  ({ id, name, slots: [], ...extra }) as CardType;

describe('cardTypeChanges (undo/redo → storage resync)', () => {
  it('no change ⇒ nothing to write', () => {
    const list = [ct('a'), ct('b')];
    expect(cardTypeChanges(list, structuredClone(list))).toEqual({ upsert: [], remove: [] });
  });

  it('a type the restored list no longer has is removed (undoing a seal/save)', () => {
    expect(cardTypeChanges([ct('a'), ct('b')], [ct('a')])).toEqual({ upsert: [], remove: ['b'] });
  });

  it('a type the restored list brings back is upserted (undoing a delete)', () => {
    const b = ct('b', 'Beta');
    expect(cardTypeChanges([ct('a')], [ct('a'), b])).toEqual({ upsert: [b], remove: [] });
  });

  it('a type whose content differs is upserted (undoing a replace-seal)', () => {
    const before = ct('a', 'Alpha v2', { description: 'new' });
    const after = ct('a', 'Alpha');
    expect(cardTypeChanges([before], [after])).toEqual({ upsert: [after], remove: [] });
  });
});
