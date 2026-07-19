import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ChoiceStudy from './ChoiceStudy.svelte';
import type { ChoiceProps } from './choice';

function setup(props: Partial<ChoiceProps> = {}, state: Record<string, unknown> = {}) {
  const onState = vi.fn();
  const { container, rerender } = render(ChoiceStudy, {
    props: {
      props: { options: ['A', 'B'], answer: [0], multi: false, ...props },
      state,
      onState,
    },
  });
  return { container, onState, rerender };
}

describe('ChoiceStudy — q prompt', () => {
  it('renders q above the options list', () => {
    const { container } = setup({ q: 'Pick one' });
    const q = container.querySelector('.choice-q');
    expect(q?.textContent).toContain('Pick one');
    // q precedes the options ul in the DOM
    const ul = container.querySelector('ul')!;
    expect(q!.compareDocumentPosition(ul) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders q as markdown (bold)', () => {
    const { container } = setup({ q: '**bold**' });
    expect(container.querySelector('.choice-q b')?.textContent).toBe('bold');
  });

  it('omits the prompt element when q is absent', () => {
    const { container } = setup({});
    expect(container.querySelector('.choice-q')).toBeNull();
  });
});

describe('ChoiceStudy — explanation reveal (v1 20-registries:43)', () => {
  it('hides the explanation before the reader has answered', () => {
    const { container } = setup({ explanation: 'because reasons' }, {});
    expect(container.querySelector('.choice-explanation')).toBeNull();
  });

  it('reveals the explanation once submitted, even when the answer is wrong', () => {
    const { container } = setup(
      { explanation: 'because reasons' },
      { selected: [1], submitted: true },
    );
    expect(container.querySelector('.choice-explanation')?.textContent).toContain('because reasons');
  });

  it('reveals the explanation once submitted when the answer is right', () => {
    const { container } = setup(
      { explanation: 'because reasons' },
      { selected: [0], submitted: true },
    );
    expect(container.querySelector('.choice-explanation')?.textContent).toContain('because reasons');
  });

  it('appears only after clicking Submit', async () => {
    const onState = vi.fn();
    const { container } = render(ChoiceStudy, {
      props: {
        props: { options: ['A', 'B'], answer: [0], multi: false, explanation: 'expl' },
        state: { selected: [0] },
        onState,
      },
    });
    expect(container.querySelector('.choice-explanation')).toBeNull();
    const submit = container.querySelector('.submit') as HTMLButtonElement;
    await fireEvent.click(submit);
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ submitted: true }));
  });
});
