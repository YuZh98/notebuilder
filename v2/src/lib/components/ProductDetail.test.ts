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

  it('renders no draft inputs for a tracker-shaped type (enum style prop is not free text)', () => {
    const { container } = mount({
      slots: [{ type: 'list', props: { items: ['a', 'b'], style: 'check' } }],
    });
    expect(container.querySelectorAll('input[data-draft]')).toHaveLength(0);
  });

  it('exposes only label on a mastery-shaped type, never the enum scope prop', () => {
    const { container } = mount({
      slots: [{ type: 'progress', props: { label: 'Chapter 1', scope: 'chapter' } }],
    });
    const inputs = container.querySelectorAll('input[data-draft]');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].getAttribute('data-key')).toBe('label');
  });

  it('editing a draft input flows into the live preview', async () => {
    const { container } = mount();
    await fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'study')!);
    const input = container.querySelector('input[data-draft]') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'goodbye world' } });
    await tick();
    expect(container.querySelector('.prev-card')?.textContent).toContain('goodbye world');
  });

  it('the study preview is live: dragging a slider updates a dependent compute', async () => {
    const { container } = mount({
      slots: [
        { type: 'slider', props: { key: 'a', value: 50, min: 0, max: 100, step: 1 } },
        { type: 'compute', props: { expr: 'a', out: 'echo', note: 'echo =' } },
      ],
    });
    await fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'study')!);
    await tick();
    const range = container.querySelector('.prev-card input[type="range"]') as HTMLInputElement;
    expect(container.querySelector('.compute-study .val')?.textContent).toBe('50');
    range.value = '80';
    await fireEvent.input(range);
    await tick();
    expect(container.querySelector('.compute-study .val')?.textContent).toBe('80');
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

  it('lays the preview stage out at the type’s own share of the room, not the whole room', () => {
    const full = mount().container.querySelector('.prev-stage') as HTMLElement;
    expect(full.style.width).toBe('720px');

    const half = mount({ w: 6 }).container.querySelector('.prev-stage') as HTMLElement;
    expect(half.style.width).toBe('360px');
  });

  it('close fires onclose', async () => {
    const { container, onclose } = mount();
    await fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('close'))!);
    expect(onclose).toHaveBeenCalled();
  });
});
