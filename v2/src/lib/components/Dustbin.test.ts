import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Dustbin from './Dustbin.svelte';
import { dustState } from '../drag/dust.svelte';

afterEach(() => {
  dustState.show = false;
  dustState.hot = false;
});

describe('Dustbin', () => {
  it('renders the v1 dustbin markup, hidden by default', () => {
    const { container } = render(Dustbin);
    const bin = container.querySelector('#dustbin');
    expect(bin).toBeInTheDocument();
    expect(bin?.getAttribute('title')).toBe('drop here to delete');
    expect(bin?.textContent).toBe('🗑drop to delete');
    expect(bin?.querySelector('span.sm')?.textContent).toBe('drop to delete');
    expect(bin?.classList.contains('show')).toBe(false);
    expect(bin?.classList.contains('hot')).toBe(false);
  });

  it('reacts to the engine dust store: show and hot classes', async () => {
    const { container } = render(Dustbin);
    const bin = container.querySelector('#dustbin');
    dustState.show = true;
    await tick();
    expect(bin?.classList.contains('show')).toBe(true);
    dustState.hot = true;
    await tick();
    expect(bin?.classList.contains('hot')).toBe(true);
    dustState.show = false;
    dustState.hot = false;
    await tick();
    expect(bin?.classList.contains('show')).toBe(false);
    expect(bin?.classList.contains('hot')).toBe(false);
  });
});
