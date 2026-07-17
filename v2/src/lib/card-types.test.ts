import { describe, it, expect } from 'vitest';
import { stampCard, cardToType, builtinCardTypes, typePreviewCard, placeType, prodIcon, STORES } from './card-types';
import type { CardType } from './card-types';
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

describe('STORES', () => {
  it('lists write, practice, live in order', () => {
    expect(STORES.map((s) => s.id)).toEqual(['write', 'practice', 'live']);
    expect(STORES.map((s) => s.name)).toEqual(['Write', 'Practice', 'Live']);
  });
});

describe('CardType product metadata', () => {
  it('round-trips a fully-populated type through JSON (blob persistence shape)', () => {
    const ct: CardType = {
      id: 'ct_x',
      name: 'X',
      description: 'desc',
      verbs: { flip: true },
      slots: [{ type: 'text', props: { text: 'front' } }],
      back: [{ type: 'text', props: { text: 'back' } }],
      accent: '#6ea8fe',
      note: 'a note',
      icon: '🎚',
      store: 'live',
      varieties: [{ name: 'Blue', accent: '#6ea8fe' }],
    };
    const round = JSON.parse(JSON.stringify(ct)) as CardType;
    expect(round).toEqual(ct);
  });

  it('cardToType output still round-trips through stampCard', () => {
    const card: Card = {
      id: 'card_1',
      sectionId: 'sec_1',
      position: 0,
      verbs: { flip: true },
      slots: [{ id: 'slot_1', type: 'text', props: { text: 'Q' } }],
      back: [{ id: 'slot_2', type: 'text', props: { text: 'A' } }],
    };
    const ct = cardToType(card, 'Captured');
    const stamped = stampCard(ct, 'sec_2', 3);
    expect(stamped.typeId).toBe(ct.id);
    expect(stamped.sectionId).toBe('sec_2');
    expect(stamped.position).toBe(3);
    expect(stamped.slots.map((s) => s.props)).toEqual([{ text: 'Q' }]);
    expect(stamped.back?.map((s) => s.props)).toEqual([{ text: 'A' }]);
    expect(stamped.verbs).toEqual({ flip: true });
  });
});

describe('placeType', () => {
  const ct: CardType = {
    id: 'ct_v',
    name: 'V',
    accent: '#111111',
    slots: [{ type: 'text', props: { text: 'hi' } }],
    varieties: [{ name: 'Red', accent: '#ff0000' }],
  };

  it('stamps fresh ids and sets typeId', () => {
    const a = placeType(ct, 'sec_1', 2);
    const b = placeType(ct, 'sec_1', 3);
    expect(a.id).not.toBe(b.id);
    expect(a.slots[0].id).not.toBe(b.slots[0].id);
    expect(a.typeId).toBe('ct_v');
    expect(a.sectionId).toBe('sec_1');
    expect(a.position).toBe(2);
  });

  it('prefers the variety accent over the type accent', () => {
    expect(placeType(ct, 's', 0, ct.varieties![0]).accent).toBe('#ff0000');
  });

  it('falls back to the type accent when no variety is given', () => {
    expect(placeType(ct, 's', 0).accent).toBe('#111111');
  });

  it('leaves accent unset when neither variety nor type carries one', () => {
    const plain: CardType = { id: 'ct_p', name: 'P', slots: [{ type: 'text', props: { text: 'x' } }] };
    expect(placeType(plain, 's', 0).accent).toBeUndefined();
  });
});

describe('prodIcon', () => {
  it('returns the type icon when present', () => {
    expect(prodIcon({ id: 'a', name: 'Widget', icon: '🎚', slots: [] })).toBe('🎚');
  });

  it('falls back to the uppercased first letter of the name', () => {
    expect(prodIcon({ id: 'a', name: 'widget', slots: [] })).toBe('W');
  });

  it('falls back to a box when the name is blank', () => {
    expect(prodIcon({ id: 'a', name: '  ', slots: [] })).toBe('📦');
  });
});

describe('typePreviewCard', () => {
  it('yields a card whose slots have ids', () => {
    const ct = builtinCardTypes.find((c) => c.back)!;
    const preview = typePreviewCard(ct);
    for (const s of [...preview.slots, ...(preview.back ?? [])]) {
      expect(s.id).toBeTruthy();
    }
  });

  it('deep-clones props so mutating the preview never touches the type', () => {
    const ct = builtinCardTypes[0];
    const original = JSON.stringify(ct.slots[0].props);
    const preview = typePreviewCard(ct);
    (preview.slots[0].props as Record<string, unknown>).text = 'mutated';
    expect(JSON.stringify(ct.slots[0].props)).toBe(original);
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
