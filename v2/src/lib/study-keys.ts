// Keyboard-first Study: the decisions behind the study cursor, with no DOM and no Svelte.
// App and Reader both import this so the exported Reader behaves identically to the app.

import { CARD_STATE_KEY } from './card-done';
import type { Card, Notebook, Slot } from './types';

/** One reader-state write: `readerState[focusedCardId][slotId] = next`. */
export type StudyEffect = { slotId: string; next: Record<string, unknown> };

/** A card's reader state, keyed by slot id (CARD_STATE_KEY holds the card-level flags). */
type CardStates = Record<string, Record<string, unknown>>;

/** Focus order: non-archived cards of non-divider sections, document order. */
export function studyCards(notebook: Notebook): string[] {
  const ids: string[] = [];
  for (const section of notebook.sections) {
    if (section.kind === 'divider') continue;
    for (const card of section.cards) {
      if (!card.archived) ids.push(card.id);
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
  const slot = faceSlots(card).find(
    (s) => s.type === 'choice' && states[s.id]?.submitted !== true,
  );
  if (!slot) return null;
  const options = (slot.props.options as string[] | undefined) ?? [];
  if (idx >= options.length) return null;
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
  const slot = faceSlots(card).find(
    (s) =>
      s.type === 'choice' &&
      states[s.id]?.submitted !== true &&
      selectedOf(states[s.id] ?? {}).length > 0,
  );
  if (!slot) return null;
  return { slotId: slot.id, next: { ...(states[slot.id] ?? {}), submitted: true } };
}

// Mirrors ListStudy.toggle(), one tick at a time. A fully ticked list is skipped rather than
// untoggled, so repeated `x` walks a card's checklists to the end instead of stalling on the first.
function tickEffect(card: Card, states: CardStates): StudyEffect | null {
  for (const slot of faceSlots(card)) {
    if (slot.type !== 'list' || slot.props.style !== 'check') continue;
    const items = (slot.props.items as string[] | undefined) ?? [];
    const state = states[slot.id] ?? {};
    const checked = Array.isArray(state.checked)
      ? (state.checked as boolean[]).slice()
      : items.map(() => false);
    const i = items.findIndex((_item, k) => checked[k] !== true);
    if (i < 0) continue;
    checked[i] = true;
    return { slotId: slot.id, next: { ...state, checked } };
  }
  return null;
}
