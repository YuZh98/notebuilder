// Pure keyboard dispatcher — the full v1 map (src/app/120-keyboard.js) as a decision
// over a context snapshot. App builds the ctx, runs this, and executes the returned action.

import type { StudySurfaces } from './study-keys';

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
  /**
   * What the focused card can answer (study-keys `studySurfaces`): Space/f flip only a card that
   * flips, digits stop at its last option, Enter needs a selection, `x` an unticked item. A thunk,
   * because computing it builds the card's variable scope: it is called at most once, and only
   * when a bare card key reaches a focused card — never for typing in a field, a chord, a cursor
   * move or Edit mode.
   */
  focusedSurfaces: () => StudySurfaces;
  /** The key landed on a control the browser activates itself (button, link, …) — see
   * `isInteractiveTarget`. Space and Enter belong to that control, not to the study cursor. */
  targetInteractive: boolean;
  /** The shortcut overlay is open — `?` and Escape close it before anything else. */
  helpOpen: boolean;
};

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Does the key belong to a form field? A `<select>` counts: arrows, letters and Enter are its own
 * keyboard interface, so the app's bare-key bindings must keep their hands off it.
 */
export function isFieldTarget(target: EventTarget | null | undefined): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return FIELD_TAGS.has(el.tagName) || el.isContentEditable === true;
}

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'SUMMARY', 'SELECT']);
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'option', 'menuitem',
  'menuitemcheckbox', 'menuitemradio',
]);

/**
 * Does the key's target activate itself on Space/Enter? Pure over the element (no globals), so the
 * dispatcher stays a decision over a snapshot while App and Reader share one definition.
 */
export function isInteractiveTarget(target: EventTarget | null | undefined): boolean {
  const el = target as Element | null;
  // A window-targeted key event has no element at all — that is the plain, non-interactive case.
  if (!el || typeof el.getAttribute !== 'function') return false;
  if (INTERACTIVE_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute('role');
  return role !== null && INTERACTIVE_ROLES.has(role);
}

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

/** The keys that act on the focused card itself: flip, submit, tick and the option digits. */
function isCardKey(key: string): boolean {
  return key === 'f' || key === ' ' || key === 'Enter' || key === 'x' || /^[1-9]$/.test(key);
}

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
    // The overlay is modal: nothing moves the cursor or answers a card behind it.
    if (ctx.helpOpen) return null;
    if (e.key === 'Escape' && ctx.studyFocus) {
      return { kind: 'study-focus-clear', preventDefault: false };
    }
    // All four arrows walk the cursor: the study grid stacks vertically, so Up/Down is what a
    // reader reaches for. They shadow the Edit-mode section/card nav below, which needs a
    // selection Study never has.
    if (e.key === 'j' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      return { kind: 'study-focus-step', delta: 1, preventDefault: true };
    }
    if (e.key === 'k' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      return { kind: 'study-focus-step', delta: -1, preventDefault: true };
    }
    if (ctx.studyFocus && isCardKey(e.key)) {
      // A key with no surface on the focused card returns nothing at all, so the browser keeps
      // whatever it would have done with it: Space scrolls, Enter and Space activate a control the
      // reader has tabbed to, and a digit past the last option is simply not ours.
      const card = ctx.focusedSurfaces();
      if (e.key === 'f' || e.key === ' ') {
        if (!card.flip) return null;
        if (e.key === ' ' && ctx.targetInteractive) return null;
        return { kind: 'study-flip', preventDefault: true };
      }
      if (e.key === 'Enter') {
        if (!card.canSubmit || ctx.targetInteractive) return null;
        return { kind: 'study-submit', preventDefault: true };
      }
      if (e.key === 'x') {
        return card.canTick ? { kind: 'study-tick', preventDefault: true } : null;
      }
      const digit = Number(e.key);
      return digit <= card.choiceOptions ? { kind: 'study-choice', digit, preventDefault: true } : null;
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
