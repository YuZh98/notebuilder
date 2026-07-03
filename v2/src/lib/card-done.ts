import { getSlot } from './slots/registry';
import type { Slot } from './types';

/**
 * Returns true when every completable slot on a card reports isDone.
 * A card with no completable slots is considered done automatically.
 */
export function isCardDone(
  slots: Slot[],
  statesBySlotId: Record<string, Record<string, unknown>>,
): boolean {
  for (const slot of slots) {
    const type = getSlot(slot.type);
    if (!type || !type.completable) continue;
    const slotState = statesBySlotId[slot.id] ?? {};
    if (!type.isDone?.(slot.props, slotState)) return false;
  }
  return true;
}
