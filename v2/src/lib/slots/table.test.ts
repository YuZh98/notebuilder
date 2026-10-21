// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { tableSlot } from './table';

describe('tableSlot', () => {
  describe('create', () => {
    it('returns a minimal 2x2 grid of empty strings', () => {
      const props = tableSlot.create();
      expect(props).toEqual({ rows: [['', ''], ['', '']] });
    });
  });

  describe('variables', () => {
    it('returns empty reads/writes', () => {
      const result = tableSlot.variables({ rows: [['a', 'b'], ['c', 'd']] });
      expect(result).toEqual({ reads: [], writes: [] });
    });
  });

  describe('validate', () => {
    it('passes for a valid rectangular grid', () => {
      const errors = tableSlot.validate!({ rows: [['h1', 'h2'], ['a', 'b'], ['c', 'd']] });
      expect(errors).toEqual([]);
    });

    it('fails when rows is not an array', () => {
      const errors = tableSlot.validate!({ rows: 'nope' as unknown as string[][] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('fails when a row is not an array', () => {
      const errors = tableSlot.validate!({ rows: [['a', 'b'], 'oops' as unknown as string[]] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('fails when a cell is not a string', () => {
      const errors = tableSlot.validate!({ rows: [['a', 'b'], ['c', 1 as unknown as string]] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('fails for ragged rows (unequal column counts)', () => {
      const errors = tableSlot.validate!({ rows: [['a', 'b'], ['c']] });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('metadata', () => {
    it('is a write slot', () => {
      expect(tableSlot.kind).toBe('write');
    });

    it('is not completable', () => {
      expect(tableSlot.completable).toBe(false);
    });

    it('has type "table"', () => {
      expect(tableSlot.type).toBe('table');
    });
  });
});