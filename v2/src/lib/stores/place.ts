import { writable } from 'svelte/store';

export type Place = 'house' | 'factory';

export const place = writable<Place>('house');

export function setPlace(p: Place) {
  place.set(p);
}

export function togglePlace() {
  place.update((p) => (p === 'house' ? 'factory' : 'house'));
}
