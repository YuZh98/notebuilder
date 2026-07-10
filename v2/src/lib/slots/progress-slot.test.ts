import { describe, it, expect } from 'vitest';
import { progressSlot } from './progress';

describe('progressSlot', () => {
  it('has correct metadata', () => {
    expect(progressSlot.type).toBe('progress');
    expect(progressSlot.kind).toBe('track');
    expect(progressSlot.completable).toBe(false);
  });

  it('create() returns default props', () => {
    expect(progressSlot.create()).toEqual({
      scope: 'section',
      label: 'Progress',
      show: { mn: true, pct: true, bar: true },
    });
  });

  it('variables() returns empty reads and writes', () => {
    expect(progressSlot.variables(progressSlot.create())).toEqual({ reads: [], writes: [] });
  });

  it('isDone is not defined (not completable)', () => {
    expect(progressSlot.isDone).toBeUndefined();
  });

  it('validate() returns no errors for valid props', () => {
    expect(progressSlot.validate!(progressSlot.create())).toEqual([]);
  });

  it('validate() errors on invalid scope', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = progressSlot.validate!({ scope: 'bad' as any, label: 'x', show: {} });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('progress slot chapter scope', () => {
  it('validate() accepts chapter scope', () => {
    expect(progressSlot.validate!({ scope: 'chapter', label: 'x', show: {} })).toEqual([]);
  });
});
