import { beginEdit, endEdit } from './history.svelte';

/**
 * Coalesce in-place text edits into one undo step (v1 70-events.js:27). The FIRST input
 * event inside a `data-history="edit"` region arms `beginEdit` (snapshotting pre-edit author
 * state, capture-phase so it runs before the field's own write); `focusout` ends the session.
 * Reader fields (search) and transient draft modals carry no attribute, so they never arm.
 */
export function installEditCoalescing(root: Window = window): () => void {
  const onInput = (e: Event) => {
    const t = e.target;
    if (t instanceof Element && t.closest('[data-history="edit"]')) beginEdit();
  };
  const onFocusOut = () => endEdit();
  root.addEventListener('input', onInput, true);
  root.addEventListener('focusout', onFocusOut, true);
  return () => {
    root.removeEventListener('input', onInput, true);
    root.removeEventListener('focusout', onFocusOut, true);
  };
}
