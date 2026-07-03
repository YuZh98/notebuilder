import { describe, it, expect } from 'vitest';
import { isCardDone } from './card-done';
import type { Slot } from './types';

// Ensure text-input slot is registered before tests run
import './slots/registry';

const textInputSlot = (id: string, opts: { placeholder?: string; key?: string } = {}): Slot => ({
  id,
  type: 'text-input',
  props: opts,
});

const textSlot = (id: string, text = 'hello'): Slot => ({
  id,
  type: 'text',
  props: { text },
});

describe('isCardDone', () => {
  it('card with no slots is done', () => {
    expect(isCardDone([], {})).toBe(true);
  });

  it('card with only non-completable slots (text) is done', () => {
    const slots = [textSlot('s1'), textSlot('s2')];
    expect(isCardDone(slots, {})).toBe(true);
  });

  it('text-input with no state is not done', () => {
    const slots = [textInputSlot('ti1')];
    expect(isCardDone(slots, {})).toBe(false);
  });

  it('text-input with empty string value is not done', () => {
    const slots = [textInputSlot('ti1')];
    expect(isCardDone(slots, { ti1: { value: '' } })).toBe(false);
  });

  it('text-input with whitespace-only value is not done', () => {
    const slots = [textInputSlot('ti1')];
    expect(isCardDone(slots, { ti1: { value: '   ' } })).toBe(false);
  });

  it('text-input with a filled value is done', () => {
    const slots = [textInputSlot('ti1')];
    expect(isCardDone(slots, { ti1: { value: 'hello' } })).toBe(true);
  });

  it('mixed: text + filled text-input = done', () => {
    const slots = [textSlot('s1'), textInputSlot('ti1')];
    expect(isCardDone(slots, { ti1: { value: 'answer' } })).toBe(true);
  });

  it('mixed: text + empty text-input = not done', () => {
    const slots = [textSlot('s1'), textInputSlot('ti1')];
    expect(isCardDone(slots, { ti1: { value: '' } })).toBe(false);
  });

  it('multiple text-inputs: all must be filled', () => {
    const slots = [textInputSlot('ti1'), textInputSlot('ti2')];
    expect(isCardDone(slots, { ti1: { value: 'yes' }, ti2: { value: 'no' } })).toBe(true);
  });

  it('multiple text-inputs: one empty = not done', () => {
    const slots = [textInputSlot('ti1'), textInputSlot('ti2')];
    expect(isCardDone(slots, { ti1: { value: 'yes' }, ti2: { value: '' } })).toBe(false);
  });
});
