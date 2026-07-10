import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/svelte';
import Toast from './Toast.svelte';
import { toast, dismissToast } from '../toast.svelte';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  dismissToast();
  vi.useRealTimers();
});

describe('Toast', () => {
  it('is hidden initially, shows on toast(), hides after timeout', async () => {
    render(Toast);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await act(() => toast('saved'));
    expect(screen.getByRole('status')).toHaveTextContent('saved');

    await act(() => vi.advanceTimersByTime(1700));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
