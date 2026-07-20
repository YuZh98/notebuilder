import type { Notebook } from './types';
import type { CardType } from './card-types';
import type { Bench } from './bench.svelte';

// Memory-only undo/redo (never persisted — v1 30-state.js:179,187-195). Author state only:
// notebook + card types + factory benches. Reader progress/session/matrix are excluded (D2).
export type HistSnapshot = {
  notebook: Notebook;
  cardTypes: CardType[];
  benches: Bench[];
  benchActive: string | null;
};

const DEPTH = 60;

const stacks: { undo: HistSnapshot[]; redo: HistSnapshot[] } = $state({ undo: [], redo: [] });
let editSession = false;

let api: { capture: () => HistSnapshot; restore: (s: HistSnapshot) => void } | null = null;

export function registerHistory(h: { capture: () => HistSnapshot; restore: (s: HistSnapshot) => void }): void {
  api = h;
}

function record(s: HistSnapshot): void {
  stacks.undo.push(s);
  if (stacks.undo.length > DEPTH) stacks.undo.shift();
  stacks.redo.length = 0;
}

/** capture → push undo (shift at DEPTH) → clear redo; ends any edit session (v1 pushHistory). */
export function pushHistory(): void {
  if (!api) return;
  editSession = false;
  record(api.capture());
}

/** Gesture variant: push a snapshot taken at pointer-down, once on release (v1 pushSnap). */
export function pushSnapshot(s: HistSnapshot | null): void {
  if (!api || s == null) return;
  record(s);
}

/** Snapshot the current author state, for gesture starts (paired with pushSnapshot). */
export function captureNow(): HistSnapshot {
  return api ? api.capture() : (null as unknown as HistSnapshot);
}

/** First call in an in-place edit session pushes history; later calls no-op (v1 30-state:189). */
export function beginEdit(): void {
  if (editSession) return;
  pushHistory();
  editSession = true;
}

/** Close the edit session (blur), so the next beginEdit starts a new step. */
export function endEdit(): void {
  editSession = false;
}

/** Esc-in-field: discard the in-progress edit — pop undo WITHOUT a redo entry (v1 120-keyboard:12). */
export function abortEdit(): boolean {
  if (!editSession) return false;
  editSession = false;
  const s = stacks.undo.pop();
  if (!s || !api) return false;
  api.restore(s);
  return true;
}

export function undo(): boolean {
  editSession = false;
  if (!api || !stacks.undo.length) return false;
  stacks.redo.push(api.capture());
  api.restore(stacks.undo.pop()!);
  return true;
}

export function redo(): boolean {
  editSession = false;
  if (!api || !stacks.redo.length) return false;
  stacks.undo.push(api.capture());
  api.restore(stacks.redo.pop()!);
  return true;
}

export function canUndo(): boolean {
  return stacks.undo.length > 0;
}

export function canRedo(): boolean {
  return stacks.redo.length > 0;
}

/** Drop all history — notebook switch/new (v1 clears _undo/_redo on load). */
export function clearHistory(): void {
  stacks.undo.length = 0;
  stacks.redo.length = 0;
  editSession = false;
}
