import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TextInputEdit from './TextInputEdit.svelte';
import type { TextInputProps } from './text-input';

function setup(props: TextInputProps = { placeholder: 'Type here', key: 'answer1' }) {
  const onUpdate = vi.fn();
  const { container } = render(TextInputEdit, { props: { props, onUpdate } });
  const inputs = [...container.querySelectorAll('.field input')] as HTMLInputElement[];
  return { container, props, onUpdate, placeholder: inputs[0], key: inputs[1] };
}

describe('TextInputEdit', () => {
  it('renders the current placeholder and key', () => {
    const { placeholder, key } = setup();
    expect(placeholder.value).toBe('Type here');
    expect(key.value).toBe('answer1');
  });

  it('renders both boxes empty for a freshly created slot', () => {
    const { placeholder, key } = setup({});
    expect(placeholder.value).toBe('');
    expect(key.value).toBe('');
  });

  it('editing the placeholder fires onUpdate with the key kept', async () => {
    const { placeholder, onUpdate, props } = setup();
    placeholder.value = 'Your answer…';
    await fireEvent.input(placeholder);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toStrictEqual({ placeholder: 'Your answer…', key: 'answer1' });
    expect(props.placeholder).toBe('Type here');
  });

  it('editing the key fires onUpdate with the placeholder kept', async () => {
    const { key, onUpdate } = setup();
    key.value = 'answer2';
    await fireEvent.input(key);
    expect(onUpdate.mock.calls[0][0]).toStrictEqual({ placeholder: 'Type here', key: 'answer2' });
  });

  it('clearing the key drops it rather than storing an empty string', async () => {
    const { key, onUpdate } = setup();
    key.value = '';
    await fireEvent.input(key);
    expect(onUpdate.mock.calls[0][0]).toStrictEqual({ placeholder: 'Type here', key: undefined });
  });
});
