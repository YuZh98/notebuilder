import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SliderStudy from './SliderStudy.svelte';
import type { SliderProps } from './slider';

function setup(over: Partial<SliderProps> = {}, state: Record<string, unknown> = {}) {
  const props: SliderProps = { key: 'a', value: 50, min: 0, max: 100, step: 1, ...over };
  const onState = vi.fn();
  const { container } = render(SliderStudy, { props: { props, state, onState } });
  return { container, props, onState };
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

describe('SliderStudy — runtime writes go to the session layer', () => {
  it('dragging the range emits onState keyed by the variable name; props.value is untouched', async () => {
    const { container, props, onState } = setup({ value: 50 });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '80';
    await fireEvent.input(range);
    await tick();
    expect(onState).toHaveBeenCalledWith({ a: 80 });
    expect(props.value).toBe(50);
  });

  it('the free-entry number input emits the value clamped to the kept range', async () => {
    const { container, props, onState } = setup({ showSlider: false, min: 0, max: 20, value: 5 });
    const num = container.querySelector('input[type="number"]') as HTMLInputElement;
    num.value = '99';
    await fireEvent.input(num);
    await tick();
    expect(onState).toHaveBeenCalledWith({ a: 20 });
    expect(props.value).toBe(5);
  });

  it('free entry is unbounded on the input element — no min/max attributes', () => {
    const { container } = setup({ showSlider: false, min: 0, max: 20, value: 5 });
    const num = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(num.getAttribute('min')).toBeNull();
    expect(num.getAttribute('max')).toBeNull();
  });

  it('renders the session value over the authored default in both inputs', () => {
    const { container } = setup({ value: 50 }, { a: 80 });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    const num = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(range.value).toBe('80');
    expect(num.value).toBe('80');
  });

  it('falls back to the authored value when the session has no entry', () => {
    const { container } = setup({ value: 50 });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range.value).toBe('50');
  });
});
