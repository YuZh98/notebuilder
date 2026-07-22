import { writable, get } from 'svelte/store';

export type Place = 'house' | 'factory';

export const place = writable<Place>('house');

/** Set the place. Returns true if the place actually changed, false if already there. */
export function setPlace(p: Place): boolean {
  if (get(place) === p) return false;
  place.set(p);
  return true;
}
