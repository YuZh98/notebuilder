// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { progressSlot, pgShow } from './progress';

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
      track: [],
      show: { mn: true, pct: false, bar: true },
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

describe('pgShow', () => {
  it('undefined → mn/bar on, pct off', () => {
    expect(pgShow(undefined)).toEqual({ mn: true, pct: false, bar: true });
  });

  it('{} → mn/bar on, pct off (defaults)', () => {
    expect(pgShow({})).toEqual({ mn: true, pct: false, bar: true });
  });

  it('{mn:false} → mn off, bar on, pct off', () => {
    expect(pgShow({ mn: false })).toEqual({ mn: false, pct: false, bar: true });
  });

  it('{pct:true} → pct on, mn/bar on', () => {
    expect(pgShow({ pct: true })).toEqual({ mn: true, pct: true, bar: true });
  });

  it('{bar:false} → bar off, mn on, pct off', () => {
    expect(pgShow({ bar: false })).toEqual({ mn: true, pct: false, bar: false });
  });

  it('{mn:false,pct:true,bar:false} → mn off, pct on, bar off', () => {
    expect(pgShow({ mn: false, pct: true, bar: false })).toEqual({ mn: false, pct: true, bar: false });
  });
});

describe('progress slot chapter scope', () => {
  it('validate() accepts chapter scope', () => {
    expect(progressSlot.validate!({ scope: 'chapter', label: 'x', show: {} })).toEqual([]);
  });
});