// Pure keyboard dispatcher — the full v1 map (src/app/120-keyboard.js) as a decision
// over a context snapshot. App builds the ctx, runs this, and executes the returned action.

export type KeyboardEventLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
};

export type KeyCtx = {
  inField: boolean;
  /** The focused field is a single-line ce field (notebook title / bench name). */
  singleLineField: boolean;
  place: 'house' | 'factory';
  mode: 'edit' | 'study';
  filterActive: boolean;
  selCard: string | null;
  selSection: string | null;
  selProd: string | null;
  /** Non-divider section ids in document order (ArrowUp/Down nav). */
  sectionIds: string[];
  /** Card ids of the section containing the selected card (ArrowLeft/Right nav). */
  cardIdsOfSelectedSection: string[];
  /** Study cursor: the keyboard-focused card id, or null when the session has no cursor yet. */
  studyFocus: string | null;
  /** The focused card can flip — Space only flips (and only preventDefaults) when it can. */
  focusedFlipCapable: boolean;
  /** The shortcut overlay is open — `?` and Escape close it before anything else. */
  helpOpen: boolean;
};

export type KeyAction =
  | { kind: 'undo'; preventDefault: boolean }
  | { kind: 'redo'; preventDefault: boolean }
  | { kind: 'toast-save'; preventDefault: boolean }
  | { kind: 'abort-or-blur'; preventDefault: boolean }
  | { kind: 'clear-filter'; preventDefault: boolean }
  | { kind: 'deselect'; preventDefault: boolean }
  | { kind: 'select-section'; id: string; preventDefault: boolean }
  | { kind: 'select-card'; id: string; preventDefault: boolean }
  | { kind: 'toggle-mode'; preventDefault: boolean }
  | { kind: 'blur-single-line'; preventDefault: boolean }
  | { kind: 'zoom'; delta: 1 | -1 | 0; preventDefault: boolean }
  | { kind: 'study-focus-step'; delta: 1 | -1; preventDefault: boolean }
  | { kind: 'study-focus-clear'; preventDefault: boolean }
  | { kind: 'study-flip'; preventDefault: boolean }
  | { kind: 'study-choice'; digit: number; preventDefault: boolean }
  | { kind: 'study-submit'; preventDefault: boolean }
  | { kind: 'study-tick'; preventDefault: boolean }
  | { kind: 'study-help'; preventDefault: boolean };

function step(ids: string[], current: string, delta: number): string | null {
  const i = ids.indexOf(current);
  if (i < 0) return null;
  const j = Math.max(0, Math.min(ids.length - 1, i + delta));
  return ids[j] ?? null;
}

export function handleAppKey(e: KeyboardEventLike, ctx: KeyCtx): KeyAction | null {
  const mod = e.metaKey || e.ctrlKey;

  // Bare Enter blurs single-line ce fields (v1 120:6). CeText owns the actual blur.
  if (!mod && e.key === 'Enter' && ctx.singleLineField) {
    return { kind: 'blur-single-line', preventDefault: true };
  }
  // Cmd/Ctrl+Enter toggles mode; App resolves house study ⇄ factory preview (v1 120:7).
  if (mod && e.key === 'Enter') {
    return { kind: 'toggle-mode', preventDefault: true };
  }
  // Cmd/Ctrl+S — autosave notice (v1 120:10).
  if (mod && (e.key === 's' || e.key === 'S')) {
    return { kind: 'toast-save', preventDefault: true };
  }
  // Cmd/Ctrl+Z / +Shift+Z, only outside fields so native text undo wins (v1 120:11).
  if (mod && (e.key === 'z' || e.key === 'Z') && !ctx.inField) {
    return e.shiftKey
      ? { kind: 'redo', preventDefault: true }
      : { kind: 'undo', preventDefault: true };
  }
  // Cmd/Ctrl +/-/0 adjust the app zoom, in or out of fields, like a browser.
  if (mod && (e.key === '=' || e.key === '+')) {
    return { kind: 'zoom', delta: 1, preventDefault: true };
  }
  if (mod && (e.key === '-' || e.key === '_')) {
    return { kind: 'zoom', delta: -1, preventDefault: true };
  }
  if (mod && e.key === '0') {
    return { kind: 'zoom', delta: 0, preventDefault: true };
  }
  // In a field: Escape aborts the edit or blurs; every other key is swallowed (v1 120:12-14).
  if (ctx.inField) {
    if (e.key === 'Escape') return { kind: 'abort-or-blur', preventDefault: true };
    return null;
  }
  // Keyboard-first Study (v0.3.0): the study cursor owns the bare-key namespace while studying —
  // Edit mode never sees these bindings. Escape peels one layer at a time: overlay, then cursor,
  // then the Edit-mode meanings below.
  if (ctx.mode === 'study' && ctx.place === 'house' && !mod) {
    if (e.key === '?' || (ctx.helpOpen && e.key === 'Escape')) {
      return { kind: 'study-help', preventDefault: true };
    }
    if (e.key === 'Escape' && ctx.studyFocus) {
      return { kind: 'study-focus-clear', preventDefault: false };
    }
    if (e.key === 'j' || e.key === 'ArrowRight') {
      return { kind: 'study-focus-step', delta: 1, preventDefault: true };
    }
    if (e.key === 'k' || e.key === 'ArrowLeft') {
      return { kind: 'study-focus-step', delta: -1, preventDefault: true };
    }
    if (ctx.studyFocus) {
      // Space stays native scroll unless the focused card actually flips.
      if (e.key === 'f' || e.key === ' ') {
        return ctx.focusedFlipCapable ? { kind: 'study-flip', preventDefault: true } : null;
      }
      if (e.key === 'Enter') return { kind: 'study-submit', preventDefault: true };
      if (e.key === 'x') return { kind: 'study-tick', preventDefault: true };
      if (/^[1-9]$/.test(e.key)) {
        return { kind: 'study-choice', digit: Number(e.key), preventDefault: true };
      }
    }
  }
  // Escape outside a field: clear the matrix filter, else clear selection (v1 120:15).
  if (e.key === 'Escape') {
    if (ctx.filterActive) return { kind: 'clear-filter', preventDefault: false };
    if (ctx.selProd || ctx.selCard || ctx.selSection) {
      return { kind: 'deselect', preventDefault: false };
    }
    return null;
  }
  // ArrowUp/Down move the section selection in the house (v1 120:16).
  if (
    (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
    ctx.place === 'house' &&
    ctx.selSection !== null &&
    ctx.selCard === null
  ) {
    const id = step(ctx.sectionIds, ctx.selSection, e.key === 'ArrowUp' ? -1 : 1);
    return id === null ? null : { kind: 'select-section', id, preventDefault: true };
  }
  // ArrowLeft/Right move the card selection within its section (v1 120:17).
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && ctx.selCard !== null) {
    const id = step(ctx.cardIdsOfSelectedSection, ctx.selCard, e.key === 'ArrowLeft' ? -1 : 1);
    return id === null ? null : { kind: 'select-card', id, preventDefault: true };
  }
  return null;
}
