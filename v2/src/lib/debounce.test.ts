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