import { describe, it, expect } from 'vitest';
import { isCardDone, hasCompletableSlot, CARD_STATE_KEY } from './card-done';
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
    expect(isCardDone({ slots: [] }, {})).toBe(true);
  });

  it('card with only non-completable slots (text) is done', () => {
    const slots = [textSlot('s1'), textSlot('s2')];
    expect(isCardDone({ slots }, {})).toBe(true);
  });

  it('text-input with no state is not done', () => {
    expect(isCardDone({ slots: [textInputSlot('ti1')] }, {})).toBe(false);
  });

  it('text-input with empty string value is not done', () => {
    expect(isCardDone({ slots: [textInputSlot('ti1')] }, { ti1: { value: '' } })).toBe(false);
  });

  it('text-input with whitespace-only value is not done', () => {
    expect(isCardDone({ slots: [textInputSlot('ti1')] }, { ti1: { value: '   ' } })).toBe(false);
  });

  it('text-input with a filled value is done', () => {
    expect(isCardDone({ slots: [textInputSlot('ti1')] }, { ti1: { value: 'hello' } })).toBe(true);
  });

  it('mixed: text + filled text-input = done', () => {
    const slots = [textSlot('s1'), textInputSlot('ti1')];
    expect(isCardDone({ slots }, { ti1: { value: 'answer' } })).toBe(true);
  });

  it('mixed: text + empty text-input = not done', () => {
    const slots = [textSlot('s1'), textInputSlot('ti1')];
    expect(isCardDone({ slots }, { ti1: { value: '' } })).toBe(false);
  });

  it('multiple text-inputs: all must be filled', () => {
    const slots = [textInputSlot('ti1'), textInputSlot('ti2')];
    expect(isCardDone({ slots }, { ti1: { value: 'yes' }, ti2: { value: 'no' } })).toBe(true);
  });

  it('multiple text-inputs: one empty = not done', () => {
    const slots = [textInputSlot('ti1'), textInputSlot('ti2')];
    expect(isCardDone({ slots }, { ti1: { value: 'yes' }, ti2: { value: '' } })).toBe(false);
  });
});

describe('isCardDone with flip', () => {
  const flipCard = {
    slots: [textSlot('front')],
    back: [textSlot('back')],
    verbs: { flip: true },
  };

  it('flip card is not done until the back has been seen', () => {
    expect(isCardDone(flipCard, {})).toBe(false);
  });

  it('flip card is done once both sides were seen', () => {
    expect(isCardDone(flipCard, { [CARD_STATE_KEY]: { seenBack: true } })).toBe(true);
  });

  it('completable slots on the back must also be done', () => {
    const card = {
      slots: [textSlot('front')],
      back: [textInputSlot('ti1')],
      verbs: { flip: true },
    };
    expect(isCardDone(card, { [CARD_STATE_KEY]: { seenBack: true } })).toBe(false);
    expect(
      isCardDone(card, { [CARD_STATE_KEY]: { seenBack: true }, ti1: { value: 'x' } }),
    ).toBe(true);
  });

  it('back slots are ignored when the card does not flip', () => {
    const card = { slots: [textSlot('front')], back: [textInputSlot('ti1')] };
    expect(isCardDone(card, {})).toBe(true);
  });
});

describe('hasCompletableSlot', () => {
  it('is false for a card with no slots', () => {
    expect(hasCompletableSlot({ slots: [] })).toBe(false);
  });

  it('is false for a card of only non-completable (text) slots', () => {
    expect(hasCompletableSlot({ slots: [textSlot('s1'), textSlot('s2')] })).toBe(false);
  });

  it('is true when any slot is completable', () => {
    expect(hasCompletableSlot({ slots: [textSlot('s1'), textInputSlot('ti1')] })).toBe(true);
  });

  it('is true for a flip card even with no completable slots', () => {
    expect(hasCompletableSlot({ slots: [textSlot('front')], verbs: { flip: true } })).toBe(true);
  });

  it('ignores back slots when the card does not flip', () => {
    // back is not part of the structural front-slot scan for non-flip cards
    expect(hasCompletableSlot({ slots: [textSlot('front')] })).toBe(false);
  });
});
