import { getSlot } from './slots/registry';
import { uid } from './uid';
import type { Notebook, Section, Card, Slot } from './types';

export function createNotebook(name: string): Notebook {
  const id = uid('nb');
  const now = new Date().toISOString();
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    sections: [{ id: uid('sec'), notebookId: id, name: 'Section 1', position: 0, cards: [] }],
  };
}

export function addSection(nb: Notebook, name?: string): Section {
  const section: Section = {
    id: uid('sec'),
    notebookId: nb.id,
    name: name ?? `Section ${nb.sections.length + 1}`,
    position: nb.sections.length,
    cards: [],
  };
  nb.sections.push(section);
  return section;
}

export function renameSection(nb: Notebook, sectionId: string, name: string): void {
  const section = nb.sections.find((s) => s.id === sectionId);
  if (section) section.name = name;
}

export function deleteSection(nb: Notebook, sectionId: string): void {
  nb.sections = nb.sections.filter((s) => s.id !== sectionId);
  renumber(nb.sections);
}

export function moveSection(nb: Notebook, sectionId: string, dir: -1 | 1): void {
  swap(nb.sections, nb.sections.findIndex((s) => s.id === sectionId), dir);
}

export function addCard(nb: Notebook, sectionId: string): Card {
  const section = nb.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error(`No such section: ${sectionId}`);
  const card: Card = {
    id: uid('card'),
    sectionId,
    position: section.cards.length,
    slots: [newSlot('text')],
  };
  section.cards.push(card);
  return card;
}

export function deleteCard(nb: Notebook, cardId: string): void {
  for (const section of nb.sections) {
    if (section.cards.some((c) => c.id === cardId)) {
      section.cards = section.cards.filter((c) => c.id !== cardId);
      renumber(section.cards);
      return;
    }
  }
}

export function moveCard(nb: Notebook, cardId: string, dir: -1 | 1): void {
  for (const section of nb.sections) {
    const i = section.cards.findIndex((c) => c.id === cardId);
    if (i !== -1) {
      swap(section.cards, i, dir);
      return;
    }
  }
}

/** Drag-and-drop: move a card into targetSectionId, before beforeCardId (null = append). */
export function moveCardBefore(
  nb: Notebook,
  cardId: string,
  targetSectionId: string,
  beforeCardId: string | null,
): void {
  const target = nb.sections.find((s) => s.id === targetSectionId);
  if (!target || cardId === beforeCardId) return;

  let card: Card | undefined;
  for (const section of nb.sections) {
    const i = section.cards.findIndex((c) => c.id === cardId);
    if (i !== -1) {
      [card] = section.cards.splice(i, 1);
      renumber(section.cards);
      break;
    }
  }
  if (!card) return;

  card.sectionId = targetSectionId;
  const at = beforeCardId === null ? target.cards.length : target.cards.findIndex((c) => c.id === beforeCardId);
  target.cards.splice(at === -1 ? target.cards.length : at, 0, card);
  renumber(target.cards);
}

/** Drag-and-drop: move a section before beforeSectionId (null = append). */
export function moveSectionBefore(nb: Notebook, sectionId: string, beforeSectionId: string | null): void {
  if (sectionId === beforeSectionId) return;
  const i = nb.sections.findIndex((s) => s.id === sectionId);
  if (i === -1) return;
  const [section] = nb.sections.splice(i, 1);
  const at = beforeSectionId === null ? nb.sections.length : nb.sections.findIndex((s) => s.id === beforeSectionId);
  nb.sections.splice(at === -1 ? nb.sections.length : at, 0, section);
  renumber(nb.sections);
}

export function addSlot(nb: Notebook, cardId: string, type: string, face: 'front' | 'back' = 'front'): Slot {
  const card = findCard(nb, cardId);
  if (!card) throw new Error(`No such card: ${cardId}`);
  const slot = newSlot(type);
  if (face === 'back') {
    (card.back ??= []).push(slot);
  } else {
    card.slots.push(slot);
  }
  return slot;
}

export function deleteSlot(nb: Notebook, cardId: string, slotId: string): void {
  const card = findCard(nb, cardId);
  if (!card) return;
  card.slots = card.slots.filter((s) => s.id !== slotId);
  if (card.back) card.back = card.back.filter((s) => s.id !== slotId);
}

export function findCard(nb: Notebook, cardId: string): Card | undefined {
  for (const section of nb.sections) {
    const card = section.cards.find((c) => c.id === cardId);
    if (card) return card;
  }
  return undefined;
}

function newSlot(type: string): Slot {
  const slotType = getSlot(type);
  if (!slotType) throw new Error(`Unknown slot type: ${type}`);
  return { id: uid('slot'), type, props: slotType.create() };
}

function renumber(items: { position: number }[]): void {
  items.forEach((item, i) => (item.position = i));
}

function swap(items: { position: number }[], i: number, dir: -1 | 1): void {
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  renumber(items);
}
