// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { codeSlot } from './code';

describe('codeSlot', () => {
  describe('create', () => {
    it('returns default props with empty code', () => {
      const props = codeSlot.create();
      expect(props).toEqual({ code: '' });
    });
  });

  describe('variables', () => {
    it('returns empty reads/writes (static content)', () => {
      const result = codeSlot.variables({ code: 'const x = 1;' });
      expect(result).toEqual({ reads: [], writes: [] });
    });

    it('ignores {{var}}-like text in code', () => {
      const result = codeSlot.variables({ code: 'print({{rate}})', lang: 'py' });
      expect(result).toEqual({ reads: [], writes: [] });
    });
  });

  describe('validate', () => {
    it('passes for valid props', () => {
      const errors = codeSlot.validate!({ code: 'const x = 1;' });
      expect(errors).toEqual([]);
    });

    it('passes with an optional lang', () => {
      const errors = codeSlot.validate!({ code: 'x = 1', lang: 'py' });
      expect(errors).toEqual([]);
    });

    it('fails if code is not a string', () => {
      const errors = codeSlot.validate!({ code: 123 as unknown as string });
      expect(errors).toContain('code must be a string');
    });
  });

  describe('metadata', () => {
    it('is a write slot', () => {
      expect(codeSlot.kind).toBe('write');
    });

    it('is not completable', () => {
      expect(codeSlot.completable).toBe(false);
    });

    it('has type "code"', () => {
      expect(codeSlot.type).toBe('code');
    });
  });
});