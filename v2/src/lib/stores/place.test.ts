import { describe, it, expect } from 'vitest';
import { place, setPlace, togglePlace } from './place';
import { get } from 'svelte/store';

describe('place store', () => {
  it('defaults to house', () => {
    expect(get(place)).toBe('house');
  });

  it('setPlace sets to factory', () => {
    place.set('house');
    setPlace('factory');
    expect(get(place)).toBe('factory');
  });

  it('setPlace sets to house', () => {
    place.set('factory');
    setPlace('house');
    expect(get(place)).toBe('house');
  });

  it('toggles to factory', () => {
    place.set('house');
    togglePlace();
    expect(get(place)).toBe('factory');
  });

  it('toggles back to house', () => {
    place.set('factory');
    togglePlace();
    expect(get(place)).toBe('house');
  });
});
