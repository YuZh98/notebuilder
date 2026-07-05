import { describe, it, expect } from 'vitest';
import { stampCard, cardToType, builtinCardTypes } from './card-types';
import { getSlot } from './slots/registry';
import type { Card } from './types';

const flashcardType = {
  id: 'ct_flash',
  name: 'Flashcard',
  verbs: { flip: true },
  slots: [{ type: 'text', props: { text: 'front' } }],
  back: [{ type: 'text', props: { text: 'back' } }],
};

describe('stampCard', () => {
  it('creates an independent card with fresh ids', () => {
    const a = stampCard(flashcardType, 'sec_1', 0);
    const b = stampCard(flashcardType, 'sec_1', 1);
    expect(a.id).not.toBe(b.id);
    expect(a.slots[0].id).not.toBe(b.slots[0].id);
    expect(a.sectionId).toBe('sec_1');
    expect(a.position).toBe(0);
    expect(a.typeId).toBe('ct_flash');
    expect(a.verbs).toEqual({ flip: true });
    expect(a.back).toHaveLength(1);
  });

  it('deep-copies props so instances have no live link to the type', () => {
    const card = stampCard(flashcardType, 'sec_1', 0);
    (card.slots[0].props as { text: string }).text = 'edited';
    expect(flashcardType.slots[0].props.text).toBe('front');
  });
});

describe('cardToType', () => {
  it('captures slots, back, and verbs without instance ids', () => {
    const card: Card = {
      id: 'card_1',
      sectionId: 'sec_1',
      position: 0,
      verbs: { flip: true },
      slots: [{ id: 'slot_1', type: 'text', props: { text: 'Q' } }],
      back: [{ id: 'slot_2', type: 'text', props: { text: 'A' } }],
    };
    const ct = cardToType(card, 'My Card');
    expect(ct.name).toBe('My Card');
    expect(ct.slots).toEqual([{ type: 'text', props: { text: 'Q' } }]);
    expect(ct.back).toEqual([{ type: 'text', props: { text: 'A' } }]);
    expect(ct.verbs).toEqual({ flip: true });
  });

  it('deep-copies props so later card edits do not mutate the type', () => {
    const card: Card = {
      id: 'card_1',
      sectionId: 'sec_1',
      position: 0,
      slots: [{ id: 'slot_1', type: 'text', props: { text: 'Q' } }],
    };
    const ct = cardToType(card, 'T');
    (card.slots[0].props as { text: string }).text = 'changed';
    expect((ct.slots[0].props as { text: string }).text).toBe('Q');
  });
});

describe('builtinCardTypes', () => {
  it('exist and use only registered slot types with valid props', () => {
    expect(builtinCardTypes.length).toBeGreaterThanOrEqual(4);
    for (const ct of builtinCardTypes) {
      for (const t of [...ct.slots, ...(ct.back ?? [])]) {
        const slotType = getSlot(t.type);
        expect(slotType, `${ct.name}: unknown slot type ${t.type}`).toBeDefined();
        expect(slotType!.validate?.(t.props) ?? []).toEqual([]);
      }
    }
  });

  it('stamped builtins are valid cards', () => {
    for (const ct of builtinCardTypes) {
      const card = stampCard(ct, 'sec_x', 0);
      expect(card.slots.length).toBeGreaterThan(0);
      const ids = [...card.slots, ...(card.back ?? [])].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
