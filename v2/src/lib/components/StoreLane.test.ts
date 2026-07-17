import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import StoreLane from './StoreLane.svelte';
import type { CardType, Store } from '../card-types';

const write: Store = { id: 'write', name: 'Write' };

function type(over: Partial<CardType> = {}): CardType {
  return { id: 'ct_1', name: 'Note', slots: [{ type: 'text', props: { text: 'x' } }], ...over };
}

describe('StoreLane', () => {
  it('renders the store name, count, and one chip per type', () => {
    const onpick = vi.fn();
    const { container } = render(StoreLane, {
      props: { store: write, types: [type(), type({ id: 'ct_2', name: 'Quiz' })], onpick },
    });
    expect(container.querySelector('h4')?.textContent).toContain('Write');
    expect(container.querySelector('h4')?.textContent).toContain('2');
    expect(container.querySelectorAll('.prodchip')).toHaveLength(2);
  });

  it('labels a null store as the Workshop lane', () => {
    const { container } = render(StoreLane, {
      props: { store: null, types: [type({ store: null })], onpick: vi.fn() },
    });
    expect(container.querySelector('h4')?.textContent).toContain('Workshop');
  });

  it('shows a dash when the lane is empty', () => {
    const { container } = render(StoreLane, {
      props: { store: write, types: [], onpick: vi.fn() },
    });
    expect(container.querySelectorAll('.prodchip')).toHaveLength(0);
    expect(container.textContent).toContain('—');
  });

  it('clicking a chip fires onpick with the type id', async () => {
    const onpick = vi.fn();
    const { container } = render(StoreLane, {
      props: { store: write, types: [type({ id: 'ct_9' })], onpick },
    });
    await fireEvent.click(container.querySelector('.prodchip') as Element);
    expect(onpick).toHaveBeenCalledWith('ct_9');
  });

  it('the h4 folds and unfolds the chip list', async () => {
    const { container } = render(StoreLane, {
      props: { store: write, types: [type()], onpick: vi.fn() },
    });
    expect(container.querySelectorAll('.prodchip')).toHaveLength(1);
    await fireEvent.click(container.querySelector('h4') as Element);
    await tick();
    expect(container.querySelectorAll('.prodchip')).toHaveLength(0);
  });

  it('honours foldedInit', () => {
    const { container } = render(StoreLane, {
      props: { store: write, types: [type()], foldedInit: true, onpick: vi.fn() },
    });
    expect(container.querySelectorAll('.prodchip')).toHaveLength(0);
  });
});
