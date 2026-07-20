import { pushHistory } from '../history.svelte';

/** Drag/drop commit: capture-at-call, since the engine pushes once, right before the mutation. */
export function pushGestureSnapshot(): void {
  pushHistory();
}
