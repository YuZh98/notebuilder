// Keyboard-first Study: the decisions behind the study cursor, with no DOM and no Svelte.
// App and Reader both import this so the exported Reader behaves identically to the app.

import { CARD_STATE_KEY } from './card-done';
import { visibleSections, visibleSectionCards, type SectionView } from './visible-cards';
import type { Card, Notebook, Slot } from './types';

/** One reader-state write: `readerState[focusedCardId][slotId] = next`. */
export type StudyEffect = { slotId: string; next: Record<string, unknown> };

/** A card's reader state, keyed by slot id (CARD_STATE_KEY holds the card-level flags). */
type CardStates = Record<string, Record<string, unknown>>;

/**
 * Focus order = exactly what the Study grid renders, in render order: the same visible-cards
 * functions Stage and SectionView draw from, so search, the archive view, shuffle, collapse and
 * the coverage filter all move the cursor with them. A card the reader cannot see is never focusable.
 */
export function studyCards(
  notebook: Notebook,
  view: (section: { id: string }) => SectionView,
  visibleCardIds: Set<string> | null,
): string[] {
  const ids: string[] = [];
  for (const section of visibleSections(notebook, true, visibleCardIds)) {
    for (const card of visibleSectionCards(section, true, view(section), visibleCardIds)) {
      ids.push(card.id);
    }
  }
  return ids;
}

/**
 * Move the cursor by `delta`, clamped at both ends. With no cursor — or one whose card is gone —
 * any step lands on the first card, so the first `j` starts the session.
 */
export function stepFocus(order: string[], current: string | null, delta: number): string | null {
  if (order.length === 0) return null;
  const i = current === null ? -1 : order.indexOf(current);
  if (i < 0) return order[0];
  return order[Math.max(0, Math.min(order.length - 1, i + delta))] ?? null;
}

/** Space only flips (and only preventDefaults) when the focused card actually has a back. */
export function isFlipCapable(card: Pick<Card, 'verbs'> | null | undefined): boolean {
  return card?.verbs?.flip === true;
}

/**
 * Which study keys the focused card can answer, for the dispatcher: a key with no surface here
 * must return no action at all, so it never swallows the browser's own handling of that key.
 * Derived from the same slot finders `studyKeyEffect` writes through, so the two cannot drift.
 */
export type StudySurfaces = {
  flip: boolean;
  /** Options in the first open choice slot — digits above this have nothing to pick. */
  choiceOptions: number;
  canSubmit: boolean;
  canTick: boolean;
};

export const NO_SURFACES: StudySurfaces = {
  flip: false,
  choiceOptions: 0,
  canSubmit: false,
  canTick: false,
};

export function studySurfaces(card: Card | null | undefined, states: CardStates): StudySurfaces {
  if (!card) return NO_SURFACES;
  const open = findOpenChoice(card, states);
  return {
    flip: isFlipCapable(card),
    choiceOptions: open ? optionsOf(open).length : 0,
    canSubmit: findSubmittable(card, states) !== undefined,
    canTick: findTickable(card, states) !== undefined,
  };
}

/**
 * The state write a study key performs on the focused card, or null when the card carries no
 * surface for that key. Keys: ` `/`f` flip · `1`-`9` choice option · `Enter` submit · `x` tick.
 */
export function studyKeyEffect(key: string, card: Card, states: CardStates): StudyEffect | null {
  if (key === ' ' || key === 'f') return flipEffect(card, states);
  if (key === 'Enter') return submitEffect(card, states);
  if (key === 'x') return tickEffect(card, states);
  if (/^[1-9]$/.test(key)) return choiceEffect(card, states, Number(key) - 1);
  return null;
}

/** Both faces in document order — a flip card's back slots are answerable too. */
function faceSlots(card: Card): Slot[] {
  return [...card.slots, ...(card.back ?? [])];
}

function selectedOf(state: Record<string, unknown>): number[] {
  return Array.isArray(state.selected) ? (state.selected as number[]) : [];
}

function optionsOf(slot: Slot): string[] {
  return (slot.props.options as string[] | undefined) ?? [];
}

function itemsOf(slot: Slot): string[] {
  return (slot.props.items as string[] | undefined) ?? [];
}

function checkedOf(slot: Slot, state: Record<string, unknown>): boolean[] {
  return Array.isArray(state.checked)
    ? (state.checked as boolean[]).slice()
    : itemsOf(slot).map(() => false);
}

/** The choice slot a digit addresses: the first one not yet submitted. */
function findOpenChoice(card: Card, states: CardStates): Slot | undefined {
  return faceSlots(card).find((s) => s.type === 'choice' && states[s.id]?.submitted !== true);
}

/** The choice slot Enter submits: the first unsubmitted one that already carries a selection. */
function findSubmittable(card: Card, states: CardStates): Slot | undefined {
  return faceSlots(card).find(
    (s) =>
      s.type === 'choice' &&
      states[s.id]?.submitted !== true &&
      selectedOf(states[s.id] ?? {}).length > 0,
  );
}

/** Index of the first unticked item in a check list, or -1 when it is complete or empty. */
function tickIndex(slot: Slot, state: Record<string, unknown>): number {
  const checked = checkedOf(slot, state);
  return itemsOf(slot).findIndex((_item, k) => checked[k] !== true);
}

/** The checklist `x` ticks: the first check-style list with an item still unticked. */
function findTickable(card: Card, states: CardStates): Slot | undefined {
  return faceSlots(card).find(
    (s) => s.type === 'list' && s.props.style === 'check' && tickIndex(s, states[s.id] ?? {}) >= 0,
  );
}

// Mirrors CardView.flip(): flipping marks the back seen so the card can count as done.
function flipEffect(card: Card, states: CardStates): StudyEffect | null {
  if (!isFlipCapable(card)) return null;
  const prev = states[CARD_STATE_KEY] ?? {};
  const flipped = prev.flipped !== true;
  return {
    slotId: CARD_STATE_KEY,
    next: { ...prev, flipped, seenBack: prev.seenBack === true || flipped },
  };
}

// Mirrors ChoiceStudy.toggle(): multi accumulates, single replaces; a submitted slot is closed.
function choiceEffect(card: Card, states: CardStates, idx: number): StudyEffect | null {
  const slot = findOpenChoice(card, states);
  if (!slot || idx >= optionsOf(slot).length) return null;
  const state = states[slot.id] ?? {};
  const selected = selectedOf(state);
  const next =
    slot.props.multi === true
      ? selected.includes(idx)
        ? selected.filter((i) => i !== idx)
        : [...selected, idx]
      : [idx];
  return { slotId: slot.id, next: { ...state, selected: next } };
}

// Mirrors ChoiceStudy.submit(), which refuses an empty selection.
function submitEffect(card: Card, states: CardStates): StudyEffect | null {
  const slot = findSubmittable(card, states);
  if (!slot) return null;
  return { slotId: slot.id, next: { ...(states[slot.id] ?? {}), submitted: true } };
}

// Mirrors ListStudy.toggle(), one tick at a time. A fully ticked list is skipped rather than
// untoggled, so repeated `x` walks a card's checklists to the end instead of stalling on the first.
function tickEffect(card: Card, states: CardStates): StudyEffect | null {
  const slot = findTickable(card, states);
  if (!slot) return null;
  const state = states[slot.id] ?? {};
  const checked = checkedOf(slot, state);
  checked[tickIndex(slot, state)] = true;
  return { slotId: slot.id, next: { ...state, checked } };
}
