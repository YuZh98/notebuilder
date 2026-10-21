import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ImageEdit from './ImageEdit.svelte';
import type { ImageProps } from './image';

const SRC = 'https://example.com/a.png';

function setup(over: Partial<ImageProps> = {}) {
  const props: ImageProps = { src: SRC, alt: 'a plot', ...over };
  const onUpdate = vi.fn();
  const { container } = render(ImageEdit, { props: { props, onUpdate } });
  return {
    container,
    props,
    onUpdate,
    src: container.querySelector('textarea') as HTMLTextAreaElement,
    alt: container.querySelector('input[type="text"]') as HTMLInputElement,
  };
}

describe('ImageEdit', () => {
  it('renders the current src and alt', () => {
    const { src, alt } = setup();
    expect(src.value).toBe(SRC);
    expect(alt.value).toBe('a plot');
  });

  it('editing the src fires onUpdate with the new src and the alt kept', async () => {
    const { src, onUpdate, props } = setup();
    src.value = 'data:image/png;base64,AAA';
    await fireEvent.input(src);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toStrictEqual({ src: 'data:image/png;base64,AAA', alt: 'a plot' });
    expect(props.src).toBe(SRC);
  });

  it('editing the alt fires onUpdate with the new alt and the src kept', async () => {
    const { alt, onUpdate, props } = setup();
    alt.value = 'a chart';
    await fireEvent.input(alt);
    expect(onUpdate.mock.calls[0][0]).toStrictEqual({ src: SRC, alt: 'a chart' });
    expect(props.alt).toBe('a plot');
  });

  it('shows both boxes empty for a freshly created slot', () => {
    const { src, alt } = setup({ src: '', alt: undefined });
    expect(src.value).toBe('');
    expect(alt.value).toBe('');
  });
});
