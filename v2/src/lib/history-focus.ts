import { beginEdit, endEdit } from './history.svelte';

/**
 * Coalesce in-place text edits into one undo step (v1 70-events.js:27). The FIRST input
 * event inside a `data-history="edit"` region arms `beginEdit` (snapshotting pre-edit author
 * state, capture-phase so it runs before the field's own write); `focusout` ends the session.
 * Reader fields (search) and transient draft modals carry no attribute, so they never arm.
 */
export function installEditCoalescing(root: Window = window): () => void {
  const arm = (e: Event) => {
    const t = e.target;
    if (t instanceof Element && t.closest('[data-history="edit"]')) beginEdit();
  };
  // Also arm on `change`: discrete controls (checkbox/select) in a webview that fires
  // only `change` (no `input`) would otherwise mutate author state with zero undo steps.
  // `change` fires before `focusout`, so a text field's commit lands in the open session;
  // beginEdit is idempotent, so the input+change double-fire coalesces to one step.
  const onFocusOut = () => endEdit();
  root.addEventListener('input', arm, true);
  root.addEventListener('change', arm, true);
  root.addEventListener('focusout', onFocusOut, true);
  return () => {
    root.removeEventListener('input', arm, true);
    root.removeEventListener('change', arm, true);
    root.removeEventListener('focusout', onFocusOut, true);
  };
}
