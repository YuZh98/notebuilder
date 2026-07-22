import { describe, it, expect } from 'vitest';
import { place, setPlace } from './place';
import { get } from 'svelte/store';

describe('place store', () => {
  it('defaults to house', () => {
    expect(get(place)).toBe('house');
  });

  it('setPlace to factory returns true and changes the value', () => {
    place.set('house');
    expect(setPlace('factory')).toBe(true);
    expect(get(place)).toBe('factory');
  });

  it('setPlace to house returns true and changes the value', () => {
    place.set('factory');
    expect(setPlace('house')).toBe(true);
    expect(get(place)).toBe('house');
  });

  it('setPlace to the same value returns false and does not fire', () => {
    place.set('house');
    expect(setPlace('house')).toBe(false);
    expect(get(place)).toBe('house');
  });
});
