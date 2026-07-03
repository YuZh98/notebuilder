import { describe, it, expect } from 'vitest';
import { textSlot } from './text';

describe('textSlot', () => {
  describe('create', () => {
    it('returns default props with empty text', () => {
      const props = textSlot.create();
      expect(props).toEqual({ text: '' });
    });
  });

  describe('variables', () => {
    it('returns empty reads/writes for plain text', () => {
      const result = textSlot.variables({ text: 'Hello world' });
      expect(result).toEqual({ reads: [], writes: [] });
    });

    it('detects {{var}} references as reads', () => {
      const result = textSlot.variables({ text: 'Value is {{rate}} and {{total}}' });
      expect(result.reads).toEqual([
        { key: 'rate', type: 'string' },
        { key: 'total', type: 'string' },
      ]);
      expect(result.writes).toEqual([]);
    });

    it('deduplication is not enforced (caller can dedupe)', () => {
      const result = textSlot.variables({ text: '{{x}} and {{x}}' });
      expect(result.reads).toHaveLength(2);
    });
  });

  describe('validate', () => {
    it('passes for valid props', () => {
      const errors = textSlot.validate!({ text: 'hello' });
      expect(errors).toEqual([]);
    });

    it('fails if text is not a string', () => {
      const errors = textSlot.validate!({ text: 123 as unknown as string });
      expect(errors).toContain('text must be a string');
    });
  });

  describe('metadata', () => {
    it('is a write slot', () => {
      expect(textSlot.kind).toBe('write');
    });

    it('is not completable', () => {
      expect(textSlot.completable).toBe(false);
    });

    it('has type "text"', () => {
      expect(textSlot.type).toBe('text');
    });
  });
});
