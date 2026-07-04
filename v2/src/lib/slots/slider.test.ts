import { describe, it, expect } from 'vitest';
import { sliderSlot, clampSlider } from './slider';

describe('sliderSlot', () => {
  describe('create', () => {
    it('returns valid defaults', () => {
      const props = sliderSlot.create();
      expect(props).toEqual({ key: 'a', value: 50, min: 0, max: 100, step: 1 });
      expect(sliderSlot.validate!(props)).toEqual([]);
    });
  });

  describe('variables', () => {
    it('writes its key as a number', () => {
      const result = sliderSlot.variables({ key: 'rate', value: 5 });
      expect(result.reads).toEqual([]);
      expect(result.writes).toMatchObject([{ key: 'rate', type: 'number' }]);
    });

    it('writes nothing without a key', () => {
      const result = sliderSlot.variables({ key: '', value: 5 });
      expect(result.writes).toEqual([]);
    });
  });

  describe('validate', () => {
    it('requires a key', () => {
      expect(sliderSlot.validate!({ key: '', value: 1 })).toContain('key is required');
    });

    it('requires a numeric value', () => {
      expect(sliderSlot.validate!({ key: 'a', value: 'x' as unknown as number })).toContain(
        'value must be a number',
      );
    });
  });

  describe('clampSlider', () => {
    it('clamps to min and max', () => {
      const props = { key: 'a', value: 0, min: 0, max: 10 };
      expect(clampSlider(props, -5)).toBe(0);
      expect(clampSlider(props, 15)).toBe(10);
      expect(clampSlider(props, 7)).toBe(7);
    });

    it('treats missing bounds as unbounded', () => {
      expect(clampSlider({ key: 'a', value: 0 }, -1e9)).toBe(-1e9);
      expect(clampSlider({ key: 'a', value: 0 }, 1e9)).toBe(1e9);
    });
  });

  describe('metadata', () => {
    it('is an interact slot and not completable', () => {
      expect(sliderSlot.kind).toBe('interact');
      expect(sliderSlot.completable).toBe(false);
      expect(sliderSlot.type).toBe('slider');
    });
  });
});

describe('sliderSlot write declaration', () => {
  it('carries the current value as the write default (seeds card scope)', () => {
    const result = sliderSlot.variables({ key: 'rate', value: 7 });
    expect(result.writes).toEqual([{ key: 'rate', type: 'number', default: 7 }]);
  });
});
