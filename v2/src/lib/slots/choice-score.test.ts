import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { choiceSlot, isChoiceCorrect, type ChoiceProps } from './choice';
import { getSlot } from './registry';
import ChoiceStudy from './ChoiceStudy.svelte';

const single = (answer?: number[]): ChoiceProps => ({ options: ['A', 'B', 'C'], answer, multi: false });
const multi = (answer?: number[]): ChoiceProps => ({ options: ['A', 'B', 'C'], answer, multi: true });

describe('isChoiceCorrect', () => {
  it('is null (ungraded) when the answer key is missing or empty', () => {
    expect(isChoiceCorrect(single(undefined), { selected: [0] })).toBeNull();
    expect(isChoiceCorrect(single([]), { selected: [0] })).toBeNull();
  });

  it('compares selected vs answer as sets', () => {
    expect(isChoiceCorrect(single([1]), { selected: [1] })).toBe(true);
    expect(isChoiceCorrect(single([1]), { selected: [0] })).toBe(false);
    expect(isChoiceCorrect(multi([0, 2]), { selected: [2, 0] })).toBe(true);
    expect(isChoiceCorrect(multi([0, 2]), { selected: [0] })).toBe(false);
    expect(isChoiceCorrect(multi([0, 2]), { selected: [0, 1, 2] })).toBe(false);
    // duplicates collapse — set equality, not array equality
    expect(isChoiceCorrect(multi([0, 2]), { selected: [0, 2, 2] })).toBe(true);
  });

  it('treats a missing or malformed selection as an empty one', () => {
    expect(isChoiceCorrect(single([0]), undefined)).toBe(false);
    expect(isChoiceCorrect(single([0]), {})).toBe(false);
    expect(isChoiceCorrect(single([0]), { selected: 'zero' })).toBe(false);
    expect(isChoiceCorrect(single([0]), { selected: [null, '0'] })).toBe(false);
  });
});

describe('choiceSlot.score', () => {
  it('is wired through the registry so results pick it up generically', () => {
    expect(getSlot('choice')?.score).toBe(choiceSlot.score);
  });

  it('returns null when the slot has no answer key', () => {
    expect(choiceSlot.score!(single([]), { selected: [0], submitted: true })).toBeNull();
    expect(choiceSlot.score!(single(undefined), undefined)).toBeNull();
  });

  it('counts an unsubmitted question as unanswered — even a correct pending pick', () => {
    expect(choiceSlot.score!(single([1]), undefined)).toEqual({ correct: 0, answered: 0 });
    expect(choiceSlot.score!(single([1]), { selected: [1] })).toEqual({ correct: 0, answered: 0 });
  });

  it('scores a submitted answer right or wrong', () => {
    expect(choiceSlot.score!(single([1]), { selected: [1], submitted: true })).toEqual({ correct: 1, answered: 1 });
    expect(choiceSlot.score!(single([1]), { selected: [2], submitted: true })).toEqual({ correct: 0, answered: 1 });
    expect(choiceSlot.score!(multi([0, 2]), { selected: [0], submitted: true })).toEqual({ correct: 0, answered: 1 });
  });
});

describe('ChoiceStudy verdict uses isChoiceCorrect', () => {
  function verdictOf(props: ChoiceProps, state: Record<string, unknown>): string | null {
    const { container } = render(ChoiceStudy, { props: { props, state } });
    return container.querySelector('.choice-study')!.getAttribute('data-verdict');
  }

  it('exposes the same verdict the results export scores, once submitted', () => {
    expect(verdictOf(single([1]), { selected: [1], submitted: true })).toBe('correct');
    expect(verdictOf(single([1]), { selected: [0], submitted: true })).toBe('incorrect');
  });

  it('carries no verdict before submit or when ungraded', () => {
    expect(verdictOf(single([1]), { selected: [1] })).toBeNull();
    expect(verdictOf(single([]), { selected: [1], submitted: true })).toBeNull();
  });

  it('keeps the per-option classes unchanged', () => {
    const { container } = render(ChoiceStudy, {
      props: { props: multi([0, 2]), state: { selected: [0, 1], submitted: true } },
    });
    const cls = [...container.querySelectorAll('button.option')].map((b) => b.className.replace(/\s*svelte-\S+/g, ''));
    expect(cls).toEqual(['option correct', 'option incorrect', 'option missed']);
  });
});
