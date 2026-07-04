import { describe, it, expect } from 'vitest';
import { computeSlot } from './compute';

describe('computeSlot', () => {
  describe('create', () => {
    it('returns empty expr/out defaults', () => {
      expect(computeSlot.create()).toEqual({ expr: '', out: '', note: '' });
    });
  });

  describe('variables', () => {
    it('reads identifiers from the expression and writes out', () => {
      const result = computeSlot.variables({ expr: 'a * b + 2', out: 'total' });
      expect(result.reads).toEqual([
        { key: 'a', type: 'number' },
        { key: 'b', type: 'number' },
      ]);
      expect(result.writes).toMatchObject([{ key: 'total', type: 'number' }]);
    });

    it('writes nothing without an out key', () => {
      const result = computeSlot.variables({ expr: 'a + 1', out: '' });
      expect(result.writes).toEqual([]);
    });
  });

  describe('validate', () => {
    it('rejects a non-string expr', () => {
      expect(computeSlot.validate!({ expr: 5 as unknown as string, out: 'y' })).toContain(
        'expr must be a string',
      );
    });

    it('passes for valid props', () => {
      expect(computeSlot.validate!({ expr: 'a + 1', out: 'y' })).toEqual([]);
    });
  });

  describe('metadata', () => {
    it('is a compute slot and not completable', () => {
      expect(computeSlot.kind).toBe('compute');
      expect(computeSlot.completable).toBe(false);
      expect(computeSlot.type).toBe('compute');
    });
  });
});
