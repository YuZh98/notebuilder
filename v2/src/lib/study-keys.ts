// Keyboard-first Study: the decisions behind the study cursor, with no DOM and no Svelte.
// App and Reader both import this so the exported Reader behaves identically to the app.

import { buildCardScope } from './card-scope';
import { CARD_STATE_KEY } from './card-done';
import { getSlot } from './slots/registry';
import { shouldShow, isLocked } from './verbs';
import { visibleSections, visibleSectionCards, type SectionView } from './visible-cards';
import type { Card, Notebook, Slot } from './types';
import type { Scope } from './variable-graph';

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
  /** Options in the target choice slot — digits above this have nothing to pick. */
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

export function studySurfaces(
  card: Card | null | undefined,
  states: CardStates,
  live: Scope = {},
): StudySurfaces {
  if (!card) return NO_SURFACES;
  const slots = addressableSlots(card, states, live);
  const target = targetChoice(slots, states);
  return {
    flip: isFlipCapable(card),
    choiceOptions: target ? optionsOf(target).length : 0,
    canSubmit: target !== undefined && selectedOf(states[target.id] ?? {}).length > 0,
    canTick: findTickable(slots, states) !== undefined,
  };
}

/**
 * The state write a study key performs on the focused card, or null when the card carries no
 * surface for that key. Keys: ` `/`f` flip · `1`-`9` choice option · `Enter` submit · `x` tick.
 * `live` is the card's session-layer input scope — the same one CardView renders from.
 */
export function studyKeyEffect(
  key: string,
  card: Card,
  states: CardStates,
  live: Scope = {},
): StudyEffect | null {
  if (key === ' ' || key === 'f') return flipEffect(card, states);
  if (key !== 'Enter' && key !== 'x' && !/^[1-9]$/.test(key)) return null;
  const slots = addressableSlots(card, states, live);
  if (key === 'Enter') return submitEffect(slots, states);
  if (key === 'x') return tickEffect(slots, states);
  return choiceEffect(slots, states, Number(key) - 1);
}

/** The face turned towards the reader: a flip card shows one at a time, every other card its front. */
function shownFace(card: Card, states: CardStates): Slot[] {
  if (!isFlipCapable(card)) return card.slots;
  return states[CARD_STATE_KEY]?.flipped === true ? (card.back ?? []) : card.slots;
}

// Mirrors CardView.priorComplete: only the slots before it on the same face count.
function priorComplete(face: Slot[], i: number, states: CardStates): boolean {
  for (let j = 0; j < i; j++) {
    const slot = face[j];
    const type = getSlot(slot.type);
    if (type?.completable && type.isDone && !type.isDone(slot.props, states[slot.id] ?? {})) {
      return false;
    }
  }
  return true;
}

// A cycle or a bad expression leaves CardView rendering an empty scope beside its error banner;
// the keys must read whatever scope the reader is actually looking at.
function cardScope(card: Card, live: Scope): Scope {
  try {
    return buildCardScope([...card.slots, ...(card.back ?? [])], live);
  } catch {
    return {};
  }
}

/**
 * The slots a key may address: the shown face's, minus the ones the click path would not offer.
 * `shouldShow` and `isLocked` get exactly the inputs CardView's studyBody gives them — card-wide
 * scope for reveal, same-face priorComplete for sequential and locked — so a slot the reader
 * cannot click is a slot the keyboard cannot answer.
 */
function addressableSlots(card: Card, states: CardStates, live: Scope): Slot[] {
  const face = shownFace(card, states);
  const scope = cardScope(card, live);
  return face.filter((slot, i) => {
    if (!getSlot(slot.type)) return false;
    const prior = priorComplete(face, i, states);
    return shouldShow(slot.verbs, scope, prior) && !isLocked(slot.verbs?.locked, prior);
  });
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

/**
 * The one choice slot the keyboard is on: the first addressable unsubmitted one. Digits pick in it
 * and Enter submits it, so the two keys cannot land on different questions.
 */
function targetChoice(slots: Slot[], states: CardStates): Slot | undefined {
  return slots.find((s) => s.type === 'choice' && states[s.id]?.submitted !== true);
}

/** Index of the first unticked item in a check list, or -1 when it is complete or empty. */
function tickIndex(slot: Slot, state: Record<string, unknown>): number {
  const checked = checkedOf(slot, state);
  return itemsOf(slot).findIndex((_item, k) => checked[k] !== true);
}

/** The checklist `x` ticks: the first addressable check-style list with an item still unticked. */
function findTickable(slots: Slot[], states: CardStates): Slot | undefined {
  return slots.find(
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
function choiceEffect(slots: Slot[], states: CardStates, idx: number): StudyEffect | null {
  const slot = targetChoice(slots, states);
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
function submitEffect(slots: Slot[], states: CardStates): StudyEffect | null {
  const slot = targetChoice(slots, states);
  if (!slot) return null;
  const state = states[slot.id] ?? {};
  if (selectedOf(state).length === 0) return null;
  return { slotId: slot.id, next: { ...state, submitted: true } };
}

// Mirrors ListStudy.toggle(), one tick at a time. A fully ticked list is skipped rather than
// untoggled, so repeated `x` walks a card's checklists to the end instead of stalling on the first.
function tickEffect(slots: Slot[], states: CardStates): StudyEffect | null {
  const slot = findTickable(slots, states);
  if (!slot) return null;
  const state = states[slot.id] ?? {};
  const checked = checkedOf(slot, state);
  checked[tickIndex(slot, state)] = true;
  return { slotId: slot.id, next: { ...state, checked } };
}
