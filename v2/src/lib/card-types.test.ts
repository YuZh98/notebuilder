// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stampCard, cardToType, builtinCardTypes, typePreviewCard, placeType, prodIcon, STORES, templateSlot, stampSlot, LEGACY_SEEDED_BUILTINS, unseededBuiltins, parseSeededLedger } from './card-types';
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

describe('D17 seed restore', () => {
  const byId = (id: string) => builtinCardTypes.find((c) => c.id === id)!;

  it('Quiz carries q + explanation inside a single choice slot, no separate text slot', () => {
    const quiz = byId('ct_quiz');
    expect(quiz.slots.map((s) => s.type)).toEqual(['choice']);
    expect(quiz.slots[0].props).toMatchObject({
      q: 'Var of a fair coin flip (0/1)?',
      explanation: 'Var = p(1-p) = 0.25',
      answer: [0],
    });
  });

  it('Quiz Card back is a single choice slot with q + explanation (no text prompt)', () => {
    const qc = byId('ct_quizcard');
    expect(qc.back!.map((s) => s.type)).toEqual(['choice']);
    expect(qc.back![0].props).toMatchObject({
      q: 'Pick the variance:',
      explanation: 'Var = p(1−p) = **0.25**',
    });
  });

  it('Compound Growth sliders are free-entry (showSlider:false) but keep their real ranges', () => {
    const cg = byId('ct_compound');
    const sliders = cg.slots.filter((s) => s.type === 'slider');
    expect(sliders).toHaveLength(2);
    for (const s of sliders) {
      expect(s.props).toMatchObject({ showSlider: false, showName: true, showValue: true });
      expect(typeof (s.props as { min: number }).min).toBe('number');
      expect(typeof (s.props as { max: number }).max).toBe('number');
    }
  });
});

describe('slot width survives sealing and stamping (E)', () => {
  it('templateSlot keeps w, fuse and fuseW; stampSlot restores them', () => {
    const slot = { id: 'sl1', type: 'text', props: { text: 'x' }, w: 4, fuse: true, fuseW: 1.5 };
    const t = templateSlot(slot);
    expect(t).toMatchObject({ w: 4, fuse: true, fuseW: 1.5 });
    const stamped = stampSlot(t);
    expect(stamped).toMatchObject({ type: 'text', w: 4, fuse: true, fuseW: 1.5 });
    expect(stamped.id).not.toBe('sl1');
  });

  it('a width-less slot stays width-less through the round trip', () => {
    const t = templateSlot({ id: 'sl1', type: 'text', props: {} });
    expect('w' in t).toBe(false);
    expect('w' in stampSlot(t)).toBe(false);
  });
});

describe('unseededBuiltins', () => {
  it('returns only builtins missing from the ledger', () => {
    const fresh = unseededBuiltins(LEGACY_SEEDED_BUILTINS);
    expect(fresh.map((b) => b.id)).toEqual(['ct_guided', 'ct_worked', 'ct_practiceset', 'ct_cheatsheet', 'ct_ironfly', 'ct_codecard']);
  });
  it('returns nothing when every builtin is in the ledger', () => {
    expect(unseededBuiltins(builtinCardTypes.map((b) => b.id))).toEqual([]);
  });
  it('legacy ledger covers no ids that are not real builtins', () => {
    const ids = new Set(builtinCardTypes.map((b) => b.id));
    for (const id of LEGACY_SEEDED_BUILTINS) expect(ids.has(id)).toBe(true);
  });
  // The ledger is history: it names what shipped before the ledger existed. Adding a new
  // builtin to it would make old DBs skip seeding that builtin forever.
  it('legacy ledger is exactly the pre-ledger builtin set', () => {
    expect([...LEGACY_SEEDED_BUILTINS]).toEqual([
      'ct_flashcard', 'ct_quiz', 'ct_note', 'ct_tracker', 'ct_mastery',
      'ct_sliderlab', 'ct_gaussian', 'ct_payoff', 'ct_compound', 'ct_quizcard',
    ]);
  });
});

describe('parseSeededLedger', () => {
  it('parses a well-formed ledger', () => {
    expect(parseSeededLedger('["ct_flashcard","ct_quiz"]')).toEqual(['ct_flashcard', 'ct_quiz']);
  });

  it('falls back to the legacy set on garbage JSON', () => {
    expect(parseSeededLedger('not json')).toEqual([...LEGACY_SEEDED_BUILTINS]);
  });

  it('falls back to the legacy set on valid JSON of the wrong shape (number)', () => {
    expect(parseSeededLedger('5')).toEqual([...LEGACY_SEEDED_BUILTINS]);
  });

  it('falls back to the legacy set on valid JSON of the wrong shape (object)', () => {
    expect(parseSeededLedger('{}')).toEqual([...LEGACY_SEEDED_BUILTINS]);
  });

  it('falls back to the legacy set on an array of non-strings', () => {
    expect(parseSeededLedger('[1,2,3]')).toEqual([...LEGACY_SEEDED_BUILTINS]);
  });
});