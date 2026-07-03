import { describe, it, expect } from 'vitest';
import { mode, toggleMode } from './mode';
import { get } from 'svelte/store';

describe('mode store', () => {
  it('defaults to edit', () => {
    expect(get(mode)).toBe('edit');
  });

  it('toggles to study', () => {
    mode.set('edit');
    toggleMode();
    expect(get(mode)).toBe('study');
  });

  it('toggles back to edit', () => {
    mode.set('study');
    toggleMode();
    expect(get(mode)).toBe('edit');
  });
});
