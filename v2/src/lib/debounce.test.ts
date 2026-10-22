// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls the function only once after the wait, with the latest args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    d('b');
    d('c');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('resets the timer on each call (trailing behavior)', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1);
    vi.advanceTimersByTime(60);
    d(2);
    vi.advanceTimersByTime(60);
    expect(fn).not.toHaveBeenCalled(); // 120ms elapsed but reset at 60
    vi.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('allows a second independent invocation after the first fires', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d('x');
    vi.advanceTimersByTime(50);
    d('y');
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'x');
    expect(fn).toHaveBeenNthCalledWith(2, 'y');
  });
});

describe('debounce.flush / cancel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flush runs the pending call immediately with the latest args and returns its result', () => {
    const fn = vi.fn((x: number) => x * 2);
    const d = debounce(fn, 100);
    d(1);
    d(21);
    expect(d.pending()).toBe(true);
    expect(d.flush()).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(21);
    expect(d.pending()).toBe(false);
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1); // the timer was consumed, not re-fired
  });

  it('flush returns the promise of an async fn', async () => {
    const d = debounce(async (s: string) => `saved:${s}`, 100);
    d('a');
    await expect(d.flush()).resolves.toBe('saved:a');
  });

  it('flush with nothing pending is a no-op returning undefined', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    expect(d.flush()).toBeUndefined();
    d('x');
    vi.advanceTimersByTime(100);
    expect(d.flush()).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel drops the pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('x');
    d.cancel();
    expect(d.pending()).toBe(false);
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    expect(d.flush()).toBeUndefined();
  });

  it('a call after cancel schedules normally', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('x');
    d.cancel();
    d('y');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('y');
  });

  it('flush called from inside fn does not re-run it', () => {
    let d!: ReturnType<typeof debounce<[string], void>>;
    const fn = vi.fn(() => {
      d.flush();
    });
    d = debounce(fn, 100);
    d('x');
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
