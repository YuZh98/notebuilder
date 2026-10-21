import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ListStudy from './ListStudy.svelte';
import type { ListProps } from './list';

function setup(over: Partial<ListProps> = {}, state: Record<string, unknown> = {}) {
  const props: ListProps = { items: ['x', 'y', 'z'], style: 'check', ...over };
  const onState = vi.fn();
  const { container } = render(ListStudy, { props: { props, state, onState } });
  const boxes = () => [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
  return { container, onState, boxes };
}

describe('ListStudy — styles', () => {
  it('renders bullets as a plain ul with no checkboxes', () => {
    const { container, boxes } = setup({ style: 'bullets' });
    expect([...container.querySelectorAll('ul:not(.checklist) li')].map((l) => l.textContent)).toEqual(['x', 'y', 'z']);
    expect(boxes()).toHaveLength(0);
  });

  it('renders numbered as an ol', () => {
    const { container } = setup({ style: 'numbered' });
    expect([...container.querySelectorAll('ol li')].map((l) => l.textContent)).toEqual(['x', 'y', 'z']);
    expect(container.querySelector('ul')).toBeNull();
  });

  it('renders check as a checkbox per item', () => {
    const { container, boxes } = setup();
    expect(container.querySelector('ul.checklist')).not.toBeNull();
    expect(boxes()).toHaveLength(3);
  });
});

describe('ListStudy — checklist state', () => {
  it('reflects reader ticks in the boxes and strikes the ticked labels', () => {
    const { container, boxes } = setup({}, { checked: [false, true, false] });
    expect(boxes().map((b) => b.checked)).toEqual([false, true, false]);
    expect([...container.querySelectorAll('span.done')].map((s) => s.textContent)).toEqual(['y']);
  });

  it('ticking a box with no prior state seeds a full false array with that index flipped', async () => {
    const { boxes, onState } = setup();
    await fireEvent.click(boxes()[1]);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState.mock.calls[0][0]).toStrictEqual({ checked: [false, true, false] });
  });

  it('unticking flips the index back and keeps unrelated state keys', async () => {
    const { boxes, onState } = setup({}, { checked: [true, true, false], note: 'keep' });
    await fireEvent.click(boxes()[0]);
    expect(onState.mock.calls[0][0]).toStrictEqual({ checked: [false, true, false], note: 'keep' });
  });
});
