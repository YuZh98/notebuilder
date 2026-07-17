import { writable } from 'svelte/store';

export type Place = 'house' | 'factory';

export const place = writable<Place>('house');

export function togglePlace() {
  place.update((p) => (p === 'house' ? 'factory' : 'house'));
}
