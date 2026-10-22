import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ImageStudy from './ImageStudy.svelte';
import type { ImageProps } from './image';

const SRC = 'https://example.com/a.png';

function setup(over: Partial<ImageProps> = {}) {
  const props: ImageProps = { src: SRC, ...over };
  const { container } = render(ImageStudy, { props: { props } });
  return { container, img: container.querySelector('img') as HTMLImageElement };
}

describe('ImageStudy', () => {
  it('renders an img with the slot src and alt', () => {
    const { img } = setup({ alt: 'a plot' });
    expect(img.getAttribute('src')).toBe(SRC);
    expect(img.getAttribute('alt')).toBe('a plot');
  });

  it('renders an empty alt attribute rather than none when alt is unset', () => {
    const { img } = setup();
    expect(img.getAttribute('alt')).toBe('');
  });

  it('renders the placeholder instead of an img when src is empty', () => {
    const { container, img } = setup({ src: '', alt: 'a plot' });
    expect(img).toBeNull();
    expect(container.querySelector('.placeholder')?.textContent).toBe('No image');
  });
});
