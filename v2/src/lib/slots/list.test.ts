import { describe, it, expect } from 'vitest';
import { listSlot } from './list';

describe('listSlot', () => {
  describe('metadata', () => {
    it('has type "list"', () => {
      expect(listSlot.type).toBe('list');
    });

    it('is a write slot', () => {
      expect(listSlot.kind).toBe('write');
    });

    it('is completable', () => {
      expect(listSlot.completable).toBe(true);
    });
  });

  describe('create', () => {
    it('returns default props with one empty item and bullets style', () => {
      expect(listSlot.create()).toEqual({ items: [''], style: 'bullets' });
    });
  });

  describe('variables', () => {
    it('returns empty reads and writes', () => {
      expect(listSlot.variables({ items: ['a'], style: 'bullets' })).toEqual({
        reads: [],
        writes: [],
      });
    });
  });

  describe('validate', () => {
    it('passes for valid bullets props', () => {
      expect(listSlot.validate!({ items: ['a', 'b'], style: 'bullets' })).toEqual([]);
    });

    it('passes for numbered style', () => {
      expect(listSlot.validate!({ items: ['x'], style: 'numbered' })).toEqual([]);
    });

    it('passes for check style', () => {
      expect(listSlot.validate!({ items: ['task'], style: 'check' })).toEqual([]);
    });

    it('fails for an invalid style', () => {
      const errors = listSlot.validate!({ items: ['x'], style: 'invalid' as 'bullets' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('style');
    });

    it('fails when items is not an array', () => {
      const errors = listSlot.validate!({ items: 'not-array' as unknown as string[], style: 'bullets' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('items');
    });

    it('fails when items contains a non-string element', () => {
      const errors = listSlot.validate!({ items: ['ok', 42] as unknown as string[], style: 'bullets' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('items');
    });
  });

  describe('isDone', () => {
    it('bullets style → always true regardless of state', () => {
      expect(listSlot.isDone!({ items: ['a'], style: 'bullets' }, {})).toBe(true);
      expect(listSlot.isDone!({ items: ['a'], style: 'bullets' }, { checked: [false] })).toBe(true);
    });

    it('numbered style → always true regardless of state', () => {
      expect(listSlot.isDone!({ items: ['a', 'b'], style: 'numbered' }, {})).toBe(true);
    });

    it('check style → false when no state.checked', () => {
      expect(listSlot.isDone!({ items: ['a'], style: 'check' }, {})).toBe(false);
    });

    it('check style → false when at least one item is unchecked', () => {
      const props = { items: ['a', 'b', 'c'], style: 'check' as const };
      expect(listSlot.isDone!(props, { checked: [true, false, true] })).toBe(false);
    });

    it('check style → false when checked array is shorter than items', () => {
      const props = { items: ['a', 'b'], style: 'check' as const };
      expect(listSlot.isDone!(props, { checked: [true] })).toBe(false);
    });

    it('check style → true when all items are checked', () => {
      const props = { items: ['a', 'b', 'c'], style: 'check' as const };
      expect(listSlot.isDone!(props, { checked: [true, true, true] })).toBe(true);
    });

    it('check style with zero items → true (vacuously done)', () => {
      expect(listSlot.isDone!({ items: [], style: 'check' }, { checked: [] })).toBe(true);
    });
  });
});
