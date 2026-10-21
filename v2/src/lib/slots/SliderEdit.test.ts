import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SliderEdit from './SliderEdit.svelte';
import type { SliderProps } from './slider';

function setup(over: Partial<SliderProps> = {}) {
  const props: SliderProps = { key: 'a', value: 50, min: 0, max: 100, step: 1, ...over };
  const onUpdate = vi.fn();
  const { container } = render(SliderEdit, { props: { props, onUpdate } });
  const field = (name: string) => {
    const label = [...container.querySelectorAll('label')].find((l) => (l.textContent ?? '').trim().startsWith(name));
    if (!label) throw new Error(`no field labelled "${name}"`);
    return label.querySelector('input') as HTMLInputElement;
  };
  const flag = (name: string) => {
    const label = [...container.querySelectorAll('label.flag')].find((l) => (l.textContent ?? '').trim() === name);
    if (!label) throw new Error(`no flag labelled "${name}"`);
    return label.querySelector('input') as HTMLInputElement;
  };
  return { container, props, onUpdate, field, flag };
}

const payload = (onUpdate: ReturnType<typeof vi.fn>) => onUpdate.mock.calls[0][0] as SliderProps;

describe('SliderEdit — fields', () => {
  it('renders the current key and bounds', () => {
    const { field } = setup();
    expect(field('key').value).toBe('a');
    expect(field('value').value).toBe('50');
    expect(field('min').value).toBe('0');
    expect(field('max').value).toBe('100');
    expect(field('step').value).toBe('1');
  });

  it('leaves optional bounds blank when the slot omits them', () => {
    const { field } = setup({ min: undefined, max: undefined, step: undefined });
    expect(field('min').value).toBe('');
    expect(field('max').value).toBe('');
    expect(field('step').value).toBe('');
  });

  it('editing the key fires onUpdate with the rest of the props kept', async () => {
    const { field, onUpdate, props } = setup();
    field('key').value = 'rate';
    await fireEvent.input(field('key'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(payload(onUpdate)).toStrictEqual({ key: 'rate', value: 50, min: 0, max: 100, step: 1 });
    expect(props.key).toBe('a');
  });

  it('editing a numeric field fires onUpdate with a number, not the raw string', async () => {
    const numeric: Array<{ name: 'value' | 'min' | 'max' | 'step'; typed: string; expected: number }> = [
      { name: 'value', typed: '7', expected: 7 },
      { name: 'min', typed: '-5', expected: -5 },
      { name: 'max', typed: '20', expected: 20 },
      { name: 'step', typed: '0.5', expected: 0.5 },
    ];
    for (const { name, typed, expected } of numeric) {
      const { field, onUpdate } = setup();
      field(name).value = typed;
      await fireEvent.input(field(name));
      expect(payload(onUpdate)[name]).toBe(expected);
    }
  });
});

describe('SliderEdit — display flags', () => {
  it('shows every flag ticked while the props leave them absent', () => {
    const { flag } = setup();
    expect([flag('name').checked, flag('value').checked, flag('slider').checked]).toEqual([true, true, true]);
  });

  it('unticking the slider flag fires onUpdate with showSlider false', async () => {
    const { flag, onUpdate } = setup();
    flag('slider').checked = false;
    await fireEvent.change(flag('slider'));
    expect(payload(onUpdate)).toStrictEqual({ key: 'a', value: 50, min: 0, max: 100, step: 1, showSlider: false });
  });
});
