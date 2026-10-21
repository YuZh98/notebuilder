// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { choiceSlot } from './choice';

describe('choiceSlot', () => {
  describe('metadata', () => {
    it('has type "choice"', () => {
      expect(choiceSlot.type).toBe('choice');
    });

    it('is an interact slot', () => {
      expect(choiceSlot.kind).toBe('interact');
    });

    it('is completable', () => {
      expect(choiceSlot.completable).toBe(true);
    });
  });

  describe('create', () => {
    it('returns default props', () => {
      expect(choiceSlot.create()).toEqual({ options: ['', ''], answer: [], multi: false });
    });
  });

  describe('variables', () => {
    it('returns empty reads and writes', () => {
      expect(choiceSlot.variables({ options: ['a', 'b'], answer: [0], multi: false })).toEqual({
        reads: [],
        writes: [],
      });
    });
  });

  describe('validate', () => {
    it('passes for valid props', () => {
      const errors = choiceSlot.validate!({ options: ['Alpha', 'Beta'], answer: [0], multi: false });
      expect(errors).toEqual([]);
    });

    it('passes for multi with multiple answers', () => {
      const errors = choiceSlot.validate!({ options: ['A', 'B', 'C'], answer: [0, 2], multi: true });
      expect(errors).toEqual([]);
    });

    it('fails when options has fewer than 2 items', () => {
      const errors = choiceSlot.validate!({ options: ['only one'], answer: [], multi: false });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('fails when options is empty', () => {
      const errors = choiceSlot.validate!({ options: [], answer: [], multi: false });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('fails when options is not an array', () => {
      const errors = choiceSlot.validate!({ options: 'bad' as unknown as string[], answer: [], multi: false });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('fails when answer index is out of range', () => {
      const errors = choiceSlot.validate!({ options: ['A', 'B'], answer: [5], multi: false });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('fails when answer index is negative', () => {
      const errors = choiceSlot.validate!({ options: ['A', 'B'], answer: [-1], multi: false });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('isDone', () => {
    const props = { options: ['A', 'B'], answer: [0], multi: false };

    it('returns false when state is empty', () => {
      expect(choiceSlot.isDone!(props, {})).toBe(false);
    });

    it('returns false when submitted is false', () => {
      expect(choiceSlot.isDone!(props, { submitted: false })).toBe(false);
    });

    it('returns false when submitted is not a boolean', () => {
      expect(choiceSlot.isDone!(props, { submitted: 'yes' })).toBe(false);
    });

    it('returns true when submitted is true', () => {
      expect(choiceSlot.isDone!(props, { submitted: true })).toBe(true);
    });

    it('returns true regardless of selected state', () => {
      expect(choiceSlot.isDone!(props, { submitted: true, selected: [1] })).toBe(true);
    });
  });
});