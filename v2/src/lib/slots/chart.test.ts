// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { chartSlot } from './chart';

describe('chartSlot', () => {
  describe('create', () => {
    it('returns identity fn over a default range with v1 axis defaults', () => {
      expect(chartSlot.create()).toEqual({
        fn: 'x',
        x0: 0,
        x1: 10,
        y0: 0,
        y1: 10,
        xticks: 5,
        yticks: 5,
        hover: true,
        label: '',
      });
    });
  });

  describe('variables', () => {
    it('reads fn identifiers but excludes the x axis variable', () => {
      const result = chartSlot.variables({ fn: 'a * x + b' });
      expect(result.reads).toEqual([
        { key: 'a', type: 'number' },
        { key: 'b', type: 'number' },
      ]);
      expect(result.writes).toEqual([]);
    });

    it('reads nothing for a constant-in-x function', () => {
      expect(chartSlot.variables({ fn: 'x * x' }).reads).toEqual([]);
    });
  });

  describe('validate', () => {
    it('rejects a non-string fn', () => {
      expect(chartSlot.validate!({ fn: 1 as unknown as string })).toContain('fn must be a string');
    });

    it('passes for valid props', () => {
      expect(chartSlot.validate!({ fn: 'a * x' })).toEqual([]);
    });
  });

  describe('metadata', () => {
    it('is a compute slot and not completable', () => {
      expect(chartSlot.kind).toBe('compute');
      expect(chartSlot.completable).toBe(false);
      expect(chartSlot.type).toBe('chart');
    });
  });
});