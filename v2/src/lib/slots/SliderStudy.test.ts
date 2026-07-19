import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SliderStudy from './SliderStudy.svelte';
import type { SliderProps } from './slider';

function setup(over: Partial<SliderProps> = {}) {
  const props: SliderProps = { key: 'a', value: 50, min: 0, max: 100, step: 1, ...over };
  const { container } = render(SliderStudy, { props: { props } });
  return { container, props };
}

describe('SliderStudy — display flags', () => {
  it('shows name, value box, and range by default (flags absent)', () => {
    const { container } = setup();
    expect(container.querySelector('.key')?.textContent).toBe('a');
    expect(container.querySelector('input[type="number"]')).not.toBeNull();
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
  });

  it('showName:false hides the variable name', () => {
    const { container } = setup({ showName: false });
    expect(container.querySelector('.key')).toBeNull();
  });

  it('showValue:false hides the number box', () => {
    const { container } = setup({ showValue: false });
    expect(container.querySelector('input[type="number"]')).toBeNull();
  });

  it('showSlider:false hides the range track', () => {
    const { container } = setup({ showSlider: false });
    expect(container.querySelector('input[type="range"]')).toBeNull();
  });

  it('showSlider:false still renders the free-entry number input', () => {
    const { container } = setup({ showSlider: false });
    expect(container.querySelector('input[type="number"]')).not.toBeNull();
    expect(container.querySelector('input[type="range"]')).toBeNull();
  });
});

describe('SliderStudy — free entry writes the scope var', () => {
  // Value writes flow through set()→clampSlider; the write is observable because an
  // out-of-range entry is clamped back into the DOM against the kept min/max.
  it('the free-entry number input writes props.value (clamped to the kept range)', async () => {
    const { container } = setup({ showSlider: false, min: 0, max: 20, value: 5 });
    const num = container.querySelector('input[type="number"]') as HTMLInputElement;
    num.value = '99';
    await fireEvent.input(num);
    await tick();
    expect(num.value).toBe('20');
  });

  it('free entry is unbounded on the input element — no min/max attributes', () => {
    const { container } = setup({ showSlider: false, min: 0, max: 20, value: 5 });
    const num = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(num.getAttribute('min')).toBeNull();
    expect(num.getAttribute('max')).toBeNull();
  });

  it('range and number box write the same value (both reflect the shared props.value)', async () => {
    const { container } = setup({ value: 5 });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    const num = container.querySelector('input[type="number"]') as HTMLInputElement;
    range.value = '80';
    await fireEvent.input(range);
    await tick();
    expect(num.value).toBe('80');
  });
});
