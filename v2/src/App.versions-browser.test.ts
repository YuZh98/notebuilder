import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from './App.svelte';

afterEach(() => cleanup());

describe('App versions — browser demo', () => {
  it('shows no Versions panel: there is no storage to keep versions in', async () => {
    const { container } = render(App);
    await tick();
    // The notebook panel itself is there (Edit mode)…
    expect(container.querySelector('#side input[placeholder="notebook name"]')).toBeTruthy();
    // …but nothing about versions.
    expect(container.querySelector('.versions-panel')).toBeNull();
    expect(screen.queryByRole('button', { name: /versions/i })).toBeNull();
  });
});
