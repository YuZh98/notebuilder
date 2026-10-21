import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ProgressStudy from './ProgressStudy.svelte';
import type { ProgressProps } from './progress';

type Completion = { done: number; total: number; pct: number };

function setup(over: Partial<ProgressProps> = {}, completion?: Completion) {
  const props: ProgressProps = { scope: 'section', ...over };
  const { container } = render(ProgressStudy, {
    props: { props, ...(completion ? { completion } : {}) },
  });
  const bar = () => container.querySelector('.bar') as HTMLElement;
  const boxes = () => [...container.querySelectorAll('.pgbox')].map((b) => b.textContent);
  return { container, bar, boxes };
}

describe('ProgressStudy — readout', () => {
  it('shows M/N and the bar by default, and the percent only when show.pct is on', () => {
    const plain = setup({}, { done: 2, total: 5, pct: 40 });
    expect(plain.boxes()).toEqual(['2 / 5']);
    expect(plain.bar()).not.toBeNull();

    const withPct = setup({ show: { pct: true } }, { done: 2, total: 5, pct: 40 });
    expect(withPct.boxes()).toEqual(['2 / 5', '40%']);
  });

  it('renders the label alongside the readout', () => {
    const { container } = setup({ label: 'Chapter progress' }, { done: 1, total: 4, pct: 25 });
    expect(container.querySelector('.muted')?.textContent).toBe('Chapter progress');
  });

  it('drops the whole row when the label is absent and both readouts are off', () => {
    const { container, bar } = setup({ show: { mn: false, pct: false } }, { done: 1, total: 4, pct: 25 });
    expect(container.querySelector('.row')).toBeNull();
    expect(bar()).not.toBeNull();
  });
});

describe('ProgressStudy — bar', () => {
  it('fills the bar to the completion percentage and exposes it to a11y', () => {
    const { bar } = setup({}, { done: 3, total: 4, pct: 75 });
    expect(bar().getAttribute('aria-valuenow')).toBe('75');
    expect((bar().querySelector('i') as HTMLElement).style.width).toBe('75%');
  });

  it('renders an empty bar when no completion is supplied', () => {
    const { bar, boxes } = setup();
    expect(boxes()).toEqual(['0 / 0']);
    expect((bar().querySelector('i') as HTMLElement).style.width).toBe('0%');
  });

  it('omits the bar when show.bar is off', () => {
    const { bar } = setup({ show: { bar: false } }, { done: 3, total: 4, pct: 75 });
    expect(bar()).toBeNull();
  });
});
