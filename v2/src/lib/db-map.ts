import type { Notebook, Section, Card, Slot } from './types';

export type NotebookRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type SectionRow = {
  id: string;
  notebook_id: string;
  name: string;
  position: number;
};

export type CardRow = {
  id: string;
  section_id: string;
  type_id: string | null;
  position: number;
  data: string; // JSON.stringify of { slots, verbs?, back?, tags? }
};

type CardData = {
  slots: Slot[];
  verbs?: Card['verbs'];
  back?: Slot[];
  tags?: string[];
};

export function notebookToRows(nb: Notebook): {
  notebook: NotebookRow;
  sections: SectionRow[];
  cards: CardRow[];
} {
  const notebook: NotebookRow = {
    id: nb.id,
    name: nb.name,
    created_at: nb.createdAt,
    updated_at: nb.updatedAt,
  };

  const sections: SectionRow[] = nb.sections.map((s) => ({
    id: s.id,
    notebook_id: nb.id,
    name: s.name,
    position: s.position,
  }));

  const cards: CardRow[] = nb.sections.flatMap((s) =>
    s.cards.map((c) => {
      const data: CardData = { slots: c.slots };
      if (c.verbs) data.verbs = c.verbs;
      if (c.back) data.back = c.back;
      if (c.tags) data.tags = c.tags;
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
        return card;
      });

    return {
      id: s.id,
      notebookId: notebookRow.id,
      name: s.name,
      position: s.position,
      cards: sectionCards,
    };
  });

  return {
    id: notebookRow.id,
    name: notebookRow.name,
    createdAt: notebookRow.created_at,
    updatedAt: notebookRow.updated_at,
    sections,
  };
}
