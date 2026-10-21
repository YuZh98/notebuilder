import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TextEdit from './TextEdit.svelte';
import type { TextProps } from './text';
import type { Scope } from '../variable-graph';

function setup(over: Partial<TextProps> = {}, scope: Scope = {}) {
  const props: TextProps = { text: 'hello', ...over };
  const onUpdate = vi.fn();
  const { container } = render(TextEdit, { props: { props, onUpdate, scope } });
  const view = () => container.querySelector('.ceview') as HTMLElement;
  const textarea = () => container.querySelector('textarea') as HTMLTextAreaElement;
  return { container, props, onUpdate, view, textarea };
}

/** Open the inline editor, type `value`, then blur — CeText commits on blur. */
async function edit(view: HTMLElement, textarea: () => HTMLTextAreaElement, value: string) {
  await fireEvent.click(view);
  const ta = textarea();
  ta.value = value;
  await fireEvent.input(ta);
  await fireEvent.blur(ta);
}

describe('TextEdit — view rendering', () => {
  it('renders the text as markdown under the slot view class', () => {
    const { container } = setup({ text: '**bold**' });
    const view = container.querySelector('.ceview.slot.text') as HTMLElement;
    expect(view.querySelector('b')?.textContent).toBe('bold');
  });

  it('interpolates scope variables into the rendered markdown', () => {
    const { container } = setup({ text: 'n = {{n}}' }, { n: 3 });
    expect(container.querySelector('.ceview')?.textContent).toContain('n = 3');
  });

  it('renders the authoring placeholder when the text is empty', () => {
    const { container } = setup({ text: '' });
    const ph = container.querySelector('.ceview.ce-placeholder') as HTMLElement;
    expect(ph.textContent?.trim()).toBe('Write markdown…');
  });
});

describe('TextEdit — editing', () => {
  it('opens a textarea seeded with the current text', async () => {
    const { view, textarea } = setup({ text: 'hello' });
    await fireEvent.click(view());
    expect(textarea().value).toBe('hello');
  });

  it('committing an edit fires onUpdate with the new text and leaves props untouched', async () => {
    const { view, textarea, onUpdate, props } = setup({ text: 'hello' });
    await edit(view(), textarea, 'goodbye');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toStrictEqual({ text: 'goodbye' });
    expect(onUpdate.mock.calls[0][0]).not.toBe(props);
    expect(props.text).toBe('hello');
  });

  it('committing an unchanged draft fires nothing', async () => {
    const { view, textarea, onUpdate } = setup({ text: 'hello' });
    await edit(view(), textarea, 'hello');
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
