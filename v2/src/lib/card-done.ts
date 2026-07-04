import { getSlot } from './slots/registry';
import type { Card, Slot } from './types';

/** Reserved reader-state slot id for card-level state (e.g. flip tracking). */
export const CARD_STATE_KEY = '__card__';

type DoneInput = Pick<Card, 'slots' | 'verbs' | 'back'>;

/**
 * Returns true when every completable slot on a card reports isDone.
 * A card with no completable slots is considered done automatically.
 * A flip card additionally requires both sides seen and its back slots done.
 */
export function isCardDone(
  card: DoneInput,
  statesBySlotId: Record<string, Record<string, unknown>>,
): boolean {
  if (!slotsDone(card.slots, statesBySlotId)) return false;
  if (card.verbs?.flip) {
    if (statesBySlotId[CARD_STATE_KEY]?.seenBack !== true) return false;
    if (!slotsDone(card.back ?? [], statesBySlotId)) return false;
  }
  return true;
}

function slotsDone(slots: Slot[], statesBySlotId: Record<string, Record<string, unknown>>): boolean {
  for (const slot of slots) {
    const type = getSlot(slot.type);
    if (!type || !type.completable) continue;
    const slotState = statesBySlotId[slot.id] ?? {};
    if (!type.isDone?.(slot.props, slotState)) return false;
  }
  return true;
}
