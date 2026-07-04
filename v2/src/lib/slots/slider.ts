import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import SliderEdit from './SliderEdit.svelte';
import SliderStudy from './SliderStudy.svelte';

export type SliderProps = {
  key: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
};

/** Clamp a value to the slot's finite bounds; empty bound = unbounded on that side. */
export function clampSlider(props: SliderProps, v: number): number {
  const mn = typeof props.min === 'number' && isFinite(props.min) ? props.min : null;
  const mx = typeof props.max === 'number' && isFinite(props.max) ? props.max : null;
  if (mn != null && v < mn) v = mn;
  if (mx != null && v > mx) v = mx;
  return v;
}

export const sliderSlot: SlotType<SliderProps> = {
  type: 'slider',
  kind: 'interact',
  completable: false,

  create(): SliderProps {
    return { key: 'a', value: 50, min: 0, max: 100, step: 1 };
  },

  variables(props: SliderProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    return {
      reads: [],
      writes: props.key ? [{ key: props.key, type: 'number', default: Number(props.value) || 0 }] : [],
    };
  },

  validate(props: SliderProps): string[] {
    const errors: string[] = [];
    if (!props.key) errors.push('key is required');
    if (typeof props.value !== 'number') errors.push('value must be a number');
    return errors;
  },

  renderEdit: SliderEdit,
  renderStudy: SliderStudy,
};
