// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { textInputSlot } from './text-input';

describe('textInputSlot', () => {
  it('has correct metadata', () => {
    expect(textInputSlot.type).toBe('text-input');
    expect(textInputSlot.kind).toBe('interact');
    expect(textInputSlot.completable).toBe(true);
  });

  it('create() returns empty props', () => {
    expect(textInputSlot.create()).toEqual({});
  });

  it('variables() returns empty reads and writes', () => {
    expect(textInputSlot.variables({})).toEqual({ reads: [], writes: [] });
  });

  describe('isDone', () => {
    it('returns false when state has no value', () => {
      expect(textInputSlot.isDone!({}, {})).toBe(false);
    });

    it('returns false when value is empty string', () => {
      expect(textInputSlot.isDone!({}, { value: '' })).toBe(false);
    });

    it('returns false when value is whitespace only', () => {
      expect(textInputSlot.isDone!({}, { value: '   ' })).toBe(false);
    });

    it('returns false when value is not a string', () => {
      expect(textInputSlot.isDone!({}, { value: 42 })).toBe(false);
      expect(textInputSlot.isDone!({}, { value: null })).toBe(false);
      expect(textInputSlot.isDone!({}, { value: undefined })).toBe(false);
    });

    it('returns true when value is a non-empty string', () => {
      expect(textInputSlot.isDone!({}, { value: 'hello' })).toBe(true);
    });

    it('returns true with leading/trailing space around content', () => {
      expect(textInputSlot.isDone!({}, { value: '  hi  ' })).toBe(true);
    });

    it('props fields do not affect isDone', () => {
      expect(textInputSlot.isDone!({ placeholder: 'Type...', key: 'ans' }, { value: 'yes' })).toBe(true);
    });
  });
});