import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ChoiceStudy from './ChoiceStudy.svelte';
import type { ChoiceProps } from './choice';

// A choice with no answer key is a prediction or a poll (Guided Explore): after submitting, the
// pick is locked in as the student's own, never painted wrong (or the others "missed").
function setup(props: Partial<ChoiceProps>, state: Record<string, unknown>) {
  return render(ChoiceStudy, {
    props: { props: { options: ['A', 'B', 'C'], multi: false, ...props }, state, onState: vi.fn() },
  });
}

const classes = (c: HTMLElement) => [...c.querySelectorAll('button.option')].map((b) => b.className.replace(/\s*svelte-\S+/g, '').trim());

describe('ChoiceStudy — ungraded (no answer key)', () => {
  it.each([
    ['missing', undefined],
    ['empty', []],
  ])('answer %s: the submitted pick shows as selected, not incorrect', (_label, answer) => {
    const { container } = setup({ answer }, { selected: [1], submitted: true });
    expect(classes(container)).toEqual(['option', 'option selected', 'option']);
    expect(container.querySelector('.choice-study')?.hasAttribute('data-verdict')).toBe(false);
    for (const b of container.querySelectorAll('button.option')) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('still reveals the explanation once submitted', () => {
    const { container } = setup({ answer: [], explanation: 'Now test it.' }, { selected: [0], submitted: true });
    expect(container.querySelector('.choice-explanation')?.textContent).toContain('Now test it.');
  });

  it('a graded choice still marks right, wrong and missed options', () => {
    const { container } = setup({ answer: [0] }, { selected: [1], submitted: true });
    expect(classes(container)).toEqual(['option missed', 'option incorrect', 'option']);
  });
});
