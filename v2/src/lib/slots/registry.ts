import type { SlotType } from '../slot-contract';
import type { Card, SlotProps } from '../types';
import { textSlot } from './text';
import { sliderSlot } from './slider';
import { computeSlot } from './compute';
import { chartSlot } from './chart';
import { codeSlot } from './code';
import { imageSlot } from './image';
import { tableSlot } from './table';
import { textInputSlot } from './text-input';
import { choiceSlot } from './choice';
import { listSlot } from './list';
import { progressSlot } from './progress';

/** A slot type erased to the base props shape for heterogeneous storage */
export type AnySlotType = SlotType<SlotProps>;

/** Registry of all slot types */
const registry = new Map<string, AnySlotType>();

export function registerSlot<P extends SlotProps>(slot: SlotType<P>): void {
  registry.set(slot.type, slot as unknown as AnySlotType);
}

export function getSlot(type: string): AnySlotType | undefined {
  return registry.get(type);
}

export function allSlots(): AnySlotType[] {
  return [...registry.values()];
}

/** Which layer a card slot's runtime writes belong to; unknown ids (CARD_STATE_KEY) are progress. */
export function stateLayerFor(
  card: Pick<Card, 'slots' | 'back'>,
  slotId: string,
): 'progress' | 'session' {
  const slot = [...card.slots, ...(card.back ?? [])].find((s) => s.id === slotId);
  const type = slot && getSlot(slot.type);
  return type?.stateLayer === 'session' ? 'session' : 'progress';
}

// Register core slots
registerSlot(textSlot);
registerSlot(sliderSlot);
registerSlot(computeSlot);
registerSlot(chartSlot);
registerSlot(codeSlot);
registerSlot(imageSlot);
registerSlot(tableSlot);
registerSlot(textInputSlot);
registerSlot(choiceSlot);
registerSlot(listSlot);
registerSlot(progressSlot);
