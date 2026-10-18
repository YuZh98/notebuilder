import { derivedTagUnion } from './tags';
import { wellFormed } from './well-formed';
import type { Notebook, Section, Card, Slot } from './types';
import type { CardType } from './card-types';

export type NotebookRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  data: string; // JSON.stringify of { subtitle?, width? }
};

export type SectionRow = {
  id: string;
  notebook_id: string;
  name: string;
  position: number;
  data: string; // JSON.stringify of { kind?, locked?, width?, title?, subtitle?, folded? }
};

export type CardRow = {
  id: string;
  section_id: string;
  type_id: string | null;
  position: number;
  data: string; // JSON.stringify of { slots, verbs?, back?, tags?, accent?, w?, archived?, draft? }
};

type CardData = {
  slots: Slot[];
  verbs?: Card['verbs'];
  back?: Slot[];
  tags?: string[];
  accent?: string;
  w?: number;
  archived?: boolean;
  draft?: boolean;
};

type SectionData = Pick<
  Section,
  'kind' | 'locked' | 'width' | 'title' | 'subtitle' | 'folded' | 'services' | 'svcOrder' | 'svcW'
>;

type NotebookData = Pick<Notebook, 'subtitle' | 'width' | 'cats'>;

export function notebookToRows(nb: Notebook): {
  notebook: NotebookRow;
  sections: SectionRow[];
  cards: CardRow[];
} {
  const nbData: NotebookData = {};
  if (nb.subtitle !== undefined) nbData.subtitle = nb.subtitle;
  if (nb.width !== undefined) nbData.width = nb.width;
  if (nb.cats !== undefined) nbData.cats = nb.cats;

  // Names are bound as plain strings (notebook) or read out of a JSON array by json_extract
  // (sections): a lone surrogate there would be invalid UTF-8 and break every later save.
  const notebook: NotebookRow = {
    id: nb.id,
    name: wellFormed(nb.name),
    created_at: nb.createdAt,
    updated_at: nb.updatedAt,
    data: JSON.stringify(nbData),
  };

  const sections: SectionRow[] = nb.sections.map((s) => {
    const data: SectionData = {};
    if (s.kind !== undefined) data.kind = s.kind;
    if (s.locked !== undefined) data.locked = s.locked;
    if (s.width !== undefined) data.width = s.width;
    if (s.title !== undefined) data.title = s.title;
    if (s.subtitle !== undefined) data.subtitle = s.subtitle;
    if (s.folded !== undefined) data.folded = s.folded;
    if (s.services !== undefined) data.services = s.services;
    if (s.svcOrder !== undefined) data.svcOrder = s.svcOrder;
    if (s.svcW !== undefined) data.svcW = s.svcW;
    return {
      id: s.id,
      notebook_id: nb.id,
      name: wellFormed(s.name),
      position: s.position,
      data: JSON.stringify(data),
    };
  });

  const cards: CardRow[] = nb.sections.flatMap((s) =>
    s.cards.map((c) => {
      const data: CardData = { slots: c.slots };
      if (c.verbs) data.verbs = c.verbs;
      if (c.back) data.back = c.back;
      if (c.tags) data.tags = c.tags;
      if (c.accent !== undefined) data.accent = c.accent;
      if (c.w !== undefined) data.w = c.w;
      if (c.archived !== undefined) data.archived = c.archived;
      if (c.draft !== undefined) data.draft = c.draft;
      return {
        id: c.id,
        section_id: s.id,
        type_id: c.typeId ?? null,
        position: c.position,
        data: JSON.stringify(data),
      };
    })
  );

  return { notebook, sections, cards };
}

export function rowsToNotebook(
  notebookRow: NotebookRow,
  sectionRows: SectionRow[],
  cardRows: CardRow[]
): Notebook {
  const sorted = [...sectionRows].sort((a, b) => a.position - b.position);

  const sections: Section[] = sorted.map((s) => {
    const sectionCards = cardRows
      .filter((c) => c.section_id === s.id)
      .sort((a, b) => a.position - b.position)
      .map((c): Card => {
        const data: CardData = JSON.parse(c.data) as CardData;
        const card: Card = {
          id: c.id,
          sectionId: s.id,
          position: c.position,
          slots: data.slots,
        };
        if (c.type_id !== null) card.typeId = c.type_id;
        if (data.verbs !== undefined) card.verbs = data.verbs;
        if (data.back !== undefined) card.back = data.back;
        if (data.tags !== undefined) card.tags = data.tags;
        if (data.accent !== undefined) card.accent = data.accent;
        if (data.w !== undefined) card.w = data.w;
        if (data.archived !== undefined) card.archived = data.archived;
        if (data.draft !== undefined) card.draft = data.draft;
        return card;
      });

    const data: SectionData = JSON.parse(s.data || '{}') as SectionData;
    const section: Section = {
      id: s.id,
      notebookId: notebookRow.id,
      // A column the driver could not decode comes back null; the next save stores '' instead.
      name: s.name ?? '',
      position: s.position,
      cards: sectionCards,
    };
    if (data.kind !== undefined) section.kind = data.kind;
    if (data.locked !== undefined) section.locked = data.locked;
    if (data.width !== undefined) section.width = data.width;
    if (data.title !== undefined) section.title = data.title;
    if (data.subtitle !== undefined) section.subtitle = data.subtitle;
    if (data.folded !== undefined) section.folded = data.folded;
    if (data.services !== undefined) section.services = data.services;
    if (data.svcOrder !== undefined) section.svcOrder = data.svcOrder;
    if (data.svcW !== undefined) section.svcW = data.svcW;
    return section;
  });

  const nbData: NotebookData = JSON.parse(notebookRow.data || '{}') as NotebookData;
  const notebook: Notebook = {
    id: notebookRow.id,
    name: notebookRow.name ?? '',
    createdAt: notebookRow.created_at,
    updatedAt: notebookRow.updated_at,
    sections,
  };
  if (nbData.subtitle !== undefined) notebook.subtitle = nbData.subtitle;
  if (nbData.width !== undefined) notebook.width = nbData.width;
  // Pre-D26 blob: derive cats from card tags so it is never undefined downstream.
  notebook.cats = nbData.cats ?? derivedTagUnion(notebook);
  return notebook;
}

/**
 * Writes that bring stored card types in line with `next` after an undo/redo swapped the whole
 * list in memory: upsert every type that is new or differs, delete every type that vanished.
 */
export function cardTypeChanges(prev: CardType[], next: CardType[]): { upsert: CardType[]; remove: string[] } {
  const before = new Map(prev.map((t) => [t.id, JSON.stringify(t)]));
  const kept = new Set(next.map((t) => t.id));
  return {
    upsert: next.filter((t) => before.get(t.id) !== JSON.stringify(t)),
    remove: prev.filter((t) => !kept.has(t.id)).map((t) => t.id),
  };
}
