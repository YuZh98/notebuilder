import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ProductDetail from './ProductDetail.svelte';
import type { CardType } from '../card-types';

function type(over: Partial<CardType> = {}): CardType {
  return {
    id: 'ct_1',
    name: 'Lab',
    slots: [
      { type: 'text', props: { text: 'hello' } },
      { type: 'slider', props: { key: 'mu', min: 0, max: 10, value: 5 } },
    ],
    ...over,
  };
}

function mount(over: Partial<CardType> = {}) {
  const onplace = vi.fn();
  const onclose = vi.fn();
  const { container } = render(ProductDetail, {
    props: { type: type(over), onplace, onclose },
  });
  return { container, onplace, onclose };
}

describe('ProductDetail', () => {
  it('exposes an input only for free-text content props, never structural ones', () => {
    const { container } = mount();
    const inputs = container.querySelectorAll('input[data-draft]');
    expect(inputs).toHaveLength(1);
    expect(container.querySelector('input[data-draft]')?.getAttribute('data-key')).toBe('text');
  });

  it('editing a draft input flows into the live preview', async () => {
    const { container } = mount();
    await fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'study')!);
    const input = container.querySelector('input[data-draft]') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'goodbye world' } });
    await tick();
    expect(container.querySelector('.prev-card')?.textContent).toContain('goodbye world');
  });

  it('the preview toggle flips only the panel, not the global mode', async () => {
    const { container } = mount();
    const study = [...container.querySelectorAll('button')].find((b) => b.textContent === 'study')!;
    expect(study).not.toHaveClass('on');
    await fireEvent.click(study);
    expect(study).toHaveClass('on');
  });

  it('placing with no variety selected carries a null variety and an empty draft', async () => {
    const { container, onplace } = mount();
    await fireEvent.click(container.querySelector('[data-act="placeprod"]') as Element);
    expect(onplace).toHaveBeenCalledTimes(1);
    expect(onplace.mock.calls[0][0]).toBeNull();
    expect(onplace.mock.calls[0][1]).toEqual({});
  });

  it('a variety pick and a draft edit flow into the onplace payload', async () => {
    const { container, onplace } = mount({
      varieties: [
        { name: 'Blue', accent: '#00f' },
        { name: 'Red', accent: '#f00' },
      ],
    });
    await fireEvent.click(container.querySelector('[data-variety="Red"]') as Element);
    const input = container.querySelector('input[data-draft]') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'edited' } });
    await fireEvent.click(container.querySelector('[data-act="placeprod"]') as Element);
    const [v, draft] = onplace.mock.calls[0];
    expect(v).toEqual({ name: 'Red', accent: '#f00' });
    expect(draft).toEqual({ '0': { text: 'edited' } });
  });

  it('close fires onclose', async () => {
    const { container, onclose } = mount();
    await fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('close'))!);
    expect(onclose).toHaveBeenCalled();
  });
});
