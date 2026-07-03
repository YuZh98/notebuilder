import { writable } from 'svelte/store';

export type Mode = 'edit' | 'study';

export const mode = writable<Mode>('edit');

export function toggleMode() {
  mode.update((m) => (m === 'edit' ? 'study' : 'edit'));
}
