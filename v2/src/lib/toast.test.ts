import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast, toastState, dismissToast } from './toast.svelte';

beforeEach(() => {
  vi.useFakeTimers();
  dismissToast();
});

describe('toast', () => {
  it('shows a message and auto-hides after the default 1700ms', () => {
    toast('saved');
    expect(toastState.visible).toBe(true);
    expect(toastState.message).toBe('saved');
    vi.advanceTimersByTime(1699);
    expect(toastState.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(toastState.visible).toBe(false);
  });

  it('a second toast replaces the first and resets the timer', () => {
    toast('one');
    vi.advanceTimersByTime(1000);
    toast('two', 3000);
    expect(toastState.message).toBe('two');
    vi.advanceTimersByTime(1700);
    expect(toastState.visible).toBe(true);
    vi.advanceTimersByTime(1300);
    expect(toastState.visible).toBe(false);
  });
});
