import { uid } from './uid';
import type { Card, Slot, SlotProps, VerbConfig } from './types';

/** A slot template inside a card type — no instance id until stamped. */
export type SlotTemplate = {
  type: string;
  props: SlotProps;
  verbs?: VerbConfig;
};

/**
 * A card type: a recipe of slots saved in the Factory/gallery.
 * Stamping produces an independent CardInstance — no live link back.
 */
export type CardType = {
  id: string;
  name: string;
  description?: string;
  verbs?: Card['verbs'];
  slots: SlotTemplate[];
  back?: SlotTemplate[];
};

/** Gallery → notebook: stamp an independent card instance from a type. */
export function stampCard(type: CardType, sectionId: string, position: number): Card {
  return {
    id: uid('card'),
    sectionId,
    typeId: type.id,
    position,
    slots: type.slots.map(stampSlot),
    ...(type.verbs && { verbs: structuredClone(type.verbs) }),
    ...(type.back && { back: type.back.map(stampSlot) }),
  };
}

/** Factory: capture an authored card as a reusable card type. */
export function cardToType(card: Card, name: string): CardType {
  return {
    id: uid('ct'),
    name,
    slots: card.slots.map(templateSlot),
    ...(card.verbs && { verbs: structuredClone(card.verbs) }),
    ...(card.back && { back: card.back.map(templateSlot) }),
  };
}

function stampSlot(t: SlotTemplate): Slot {
  return {
    id: uid('slot'),
    type: t.type,
    props: structuredClone(t.props),
    ...(t.verbs && { verbs: structuredClone(t.verbs) }),
  };
}

function templateSlot(s: Slot): SlotTemplate {
  return {
    type: s.type,
    props: structuredClone(s.props),
    ...(s.verbs && { verbs: structuredClone(s.verbs) }),
  };
}

export const builtinCardTypes: CardType[] = [
  {
    id: 'ct_note',
    name: 'Note',
    description: 'A markdown text card',
    slots: [{ type: 'text', props: { text: '' } }],
  },
  {
    id: 'ct_flashcard',
    name: 'Flashcard',
    description: 'Two-sided card: flip to reveal the answer',
    verbs: { flip: true },
    slots: [{ type: 'text', props: { text: 'Question…' } }],
    back: [{ type: 'text', props: { text: 'Answer…' } }],
  },
  {
    id: 'ct_quiz',
    name: 'Quiz',
    description: 'Multiple-choice question with auto-grading',
    slots: [
      { type: 'text', props: { text: 'Question…' } },
      { type: 'choice', props: { options: ['Option A', 'Option B'], answer: [0], multi: false } },
    ],
  },
  {
    id: 'ct_checklist',
    name: 'Checklist',
    description: 'Interactive check-off list',
    slots: [{ type: 'list', props: { style: 'check', items: ['First step', 'Second step'] } }],
  },
  {
    id: 'ct_reactive',
    name: 'Reactive graph',
    description: 'Slider drives a formula and a live chart',
    slots: [
      { type: 'slider', props: { key: 'a', value: 1, min: -5, max: 5, step: 0.5 } },
      { type: 'compute', props: { expr: 'a * a', out: 'aSq', note: 'a² =' } },
      { type: 'text', props: { text: 'a = {{a}}, a² = {{aSq}}' } },
      { type: 'chart', props: { fn: 'a * x', label: 'y = a·x', x0: -5, x1: 5 } },
    ],
  },
];
