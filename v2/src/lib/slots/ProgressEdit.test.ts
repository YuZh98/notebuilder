import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ProgressEdit from './ProgressEdit.svelte';
import type { ProgressProps } from './progress';

function setup(props: Partial<ProgressProps> = {}, allTags: string[] = []) {
  const onUpdate = vi.fn();
  const { container } = render(ProgressEdit, {
    props: {
      props: { scope: 'section', label: 'Progress', track: [], show: { mn: true, pct: false, bar: true }, ...props },
      onUpdate,
      allTags,
    },
  });
  const toggles = [...container.querySelectorAll('.toggle input[type="checkbox"]')] as HTMLInputElement[];
  const chips = [...container.querySelectorAll('button.tagchip')] as HTMLButtonElement[];
  return { container, onUpdate, toggles, chips };
}

describe('ProgressEdit — show toggles', () => {
  // toggles render in the order M/N, %, Bar
  const cases: Array<{ i: number; flag: 'mn' | 'pct' | 'bar'; expected: boolean }> = [
    { i: 0, flag: 'mn', expected: false }, // mn defaults on → toggles off
    { i: 1, flag: 'pct', expected: true }, // pct defaults off → toggles on
    { i: 2, flag: 'bar', expected: false }, // bar defaults on → toggles off
  ];

  for (const { i, flag, expected } of cases) {
    it(`flips show.${flag} via onUpdate`, () => {
      const { onUpdate, toggles } = setup();
      expect(toggles).toHaveLength(3);
      toggles[i].dispatchEvent(new Event('change', { bubbles: true }));
      expect(onUpdate).toHaveBeenCalledTimes(1);
      const next = onUpdate.mock.calls[0][0] as ProgressProps;
      expect(next.show?.[flag]).toBe(expected);
    });
  }
});

describe('ProgressEdit — track picker', () => {
  it('renders a chip per available tag from the allTags prop', () => {
    const { chips } = setup({}, ['algebra', 'geometry']);
    expect(chips.map((c) => c.textContent)).toEqual(['algebra', 'geometry']);
  });

  it('clicking a chip adds the tag to track', () => {
    const { onUpdate, chips } = setup({ track: [] }, ['algebra', 'geometry']);
    chips[0].click();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect((onUpdate.mock.calls[0][0] as ProgressProps).track).toEqual(['algebra']);
  });

  it('clicking a selected chip removes the tag from track', () => {
    const { onUpdate, chips } = setup({ track: ['algebra'] }, ['algebra', 'geometry']);
    chips[0].click();
    expect((onUpdate.mock.calls[0][0] as ProgressProps).track).toEqual([]);
  });
});
