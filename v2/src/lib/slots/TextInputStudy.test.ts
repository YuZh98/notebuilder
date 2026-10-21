import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TextInputStudy from './TextInputStudy.svelte';
import type { TextInputProps } from './text-input';

function setup(props: TextInputProps = {}, state: Record<string, unknown> = {}) {
  const onState = vi.fn();
  const { container } = render(TextInputStudy, { props: { props, state, onState } });
  return { container, onState, input: container.querySelector('input') as HTMLInputElement };
}

describe('TextInputStudy — display', () => {
  it('renders the reader value from state, not from props', () => {
    const { input } = setup({ placeholder: 'Type here' }, { value: 'my answer' });
    expect(input.value).toBe('my answer');
    expect(input.placeholder).toBe('Type here');
  });

  it('renders empty when the state holds a non-string value', () => {
    const { input } = setup({}, { value: 42 });
    expect(input.value).toBe('');
  });

  it('marks the box filled only once the reader has typed something', () => {
    expect(setup({}, {}).input.classList.contains('filled')).toBe(false);
    expect(setup({}, { value: 'x' }).input.classList.contains('filled')).toBe(true);
  });
});

describe('TextInputStudy — reader writes', () => {
  it('typing emits onState with the new value, keeping the rest of the state', async () => {
    const { input, onState } = setup({}, { value: 'old', touched: true });
    input.value = 'new';
    await fireEvent.input(input);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState.mock.calls[0][0]).toStrictEqual({ value: 'new', touched: true });
  });

  it('clearing the box emits an empty value rather than dropping the key', async () => {
    const { input, onState } = setup({}, { value: 'old' });
    input.value = '';
    await fireEvent.input(input);
    expect(onState.mock.calls[0][0]).toStrictEqual({ value: '' });
  });
});
