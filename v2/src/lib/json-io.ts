import type { Notebook, Section, Card, Slot } from './types';
import { getSlot } from './slots/registry';
import { findGraphIssues, type GraphDecl } from './variable-graph';
import { uid } from './uid';

const SCHEMA_VERSION = 1;

export type NotebookJSON = {
  version: number;
  notebook: {
    name: string;
    sections: SectionJSON[];
  };
};

type SectionJSON = {
  name: string;
  cards: CardJSON[];
};

type CardJSON = {
  slots: SlotJSON[];
  verbs?: { flip?: boolean; bare?: boolean };
  back?: SlotJSON[];
  tags?: string[];
};

type SlotJSON = {
  type: string;
  props: Record<string, unknown>;
  verbs?: Record<string, unknown>;
  w?: number;
  fuse?: boolean;
  fuseW?: number;
};

/** Export a Notebook to the interchange JSON format */
export function exportNotebook(notebook: Notebook): NotebookJSON {
  return {
    version: SCHEMA_VERSION,
    notebook: {
      name: notebook.name,
      sections: notebook.sections.map((s) => ({
        name: s.name,
        cards: s.cards.map((c) => ({
          slots: c.slots.map(exportSlot),
          ...(c.verbs && { verbs: c.verbs }),
          ...(c.back && { back: c.back.map(exportSlot) }),
          ...(c.tags && c.tags.length > 0 && { tags: c.tags }),
        })),
      })),
    },
  };
}

function exportSlot(slot: Slot): SlotJSON {
  return {
    type: slot.type,
    props: slot.props,
    ...(slot.verbs && { verbs: slot.verbs }),
    ...(slot.w !== undefined && { w: slot.w }),
    ...(slot.fuse !== undefined && { fuse: slot.fuse }),
    ...(slot.fuseW !== undefined && { fuseW: slot.fuseW }),
  };
}

/** Import from JSON interchange format to a Notebook */
export function importNotebook(json: NotebookJSON): Notebook {
  if (json.version !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${json.version}`);
  }

  const notebookId = uid('nb');

  const sections: Section[] = json.notebook.sections.map((s, si) => {
    const sectionId = uid('sec');
    const cards: Card[] = s.cards.map((c, ci) => ({
      id: uid('card'),
      sectionId,
      position: ci,
      slots: c.slots.map(importSlot),
      ...(c.verbs && { verbs: c.verbs }),
      ...(c.back && { back: c.back.map(importSlot) }),
      ...(c.tags && { tags: c.tags }),
    }));
    return {
      id: sectionId,
      notebookId,
      name: s.name,
      position: si,
      cards,
    };
  });

  return {
    id: notebookId,
    name: json.notebook.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections,
  };
}

/** Rebind an imported notebook onto an existing notebook identity, so it replaces it in storage */
export function adoptNotebookIdentity(nb: Notebook, id: string): Notebook {
  return {
    ...nb,
    id,
    sections: nb.sections.map((s) => ({ ...s, notebookId: id })),
  };
}

function importSlot(s: SlotJSON): Slot {
  const slotType = getSlot(s.type);
  if (!slotType) throw new Error(`Unknown slot type: ${s.type}`);
  const validationErrors = slotType.validate?.(s.props) ?? [];
  if (validationErrors.length > 0) {
    throw new Error(`Invalid props for slot "${s.type}": ${validationErrors.join(', ')}`);
  }
  return {
    id: uid('slot'),
    type: s.type,
    props: s.props,
    ...(s.verbs && { verbs: s.verbs as Slot['verbs'] }),
    ...(s.w !== undefined && { w: s.w }),
    ...(s.fuse !== undefined && { fuse: s.fuse }),
    ...(s.fuseW !== undefined && { fuseW: s.fuseW }),
  };
}

/** Validate JSON before importing */
export function validateNotebookJSON(json: unknown): string[] {
  const errors: string[] = [];
  if (!json || typeof json !== 'object') {
    errors.push('JSON must be an object');
    return errors;
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.version !== 'number') errors.push('Missing or invalid "version" field');
  if (!obj.notebook || typeof obj.notebook !== 'object') {
    errors.push('Missing "notebook" field');
    return errors;
  }
  const nb = obj.notebook as Record<string, unknown>;
  if (typeof nb.name !== 'string') errors.push('notebook.name must be a string');
  if (!Array.isArray(nb.sections)) {
    errors.push('notebook.sections must be an array');
    return errors;
  }
  nb.sections.forEach((s, si) => {
    if (!s || typeof s !== 'object') {
      errors.push(`sections[${si}] must be an object`);
      return;
    }
    const cards = (s as Record<string, unknown>).cards;
    if (!Array.isArray(cards)) {
      errors.push(`sections[${si}].cards must be an array`);
      return;
    }
    cards.forEach((c, ci) => {
      const where = `sections[${si}].cards[${ci}]`;
      if (!c || typeof c !== 'object') {
        errors.push(`${where} must be an object`);
        return;
      }
      const slots = (c as Record<string, unknown>).slots;
      validateSlotsField(errors, slots, `${where}.slots`);
      const back = (c as Record<string, unknown>).back;
      if (back !== undefined) validateSlotsField(errors, back, `${where}.back`);
      // Both faces of a flip card share one scope, so the graph check spans them.
      const allSlots = [...(Array.isArray(slots) ? slots : []), ...(Array.isArray(back) ? back : [])];
      validateCardGraph(errors, allSlots, where);
    });
  });
  return errors;
}

/** Static variable-graph check per card: catches missing dependencies and cycles at import time. */
function validateCardGraph(errors: string[], slots: unknown[], where: string): void {
  const decls: GraphDecl[] = [];
  slots.forEach((slot, sli) => {
    if (!slot || typeof slot !== 'object') return;
    const { type, props } = slot as Record<string, unknown>;
    const slotType = typeof type === 'string' ? getSlot(type) : undefined;
    if (!slotType || !props || typeof props !== 'object') return;
    try {
      const { reads, writes } = slotType.variables(props as Record<string, unknown>);
      decls.push({
        id: `${where}.slots[${sli}] (${type})`,
        reads: reads.map((r) => r.key),
        writes: writes.map((w) => w.key),
      });
    } catch {
      // invalid props already reported by slot validation; graph check skips them
    }
  });
  for (const issue of findGraphIssues(decls)) errors.push(`${where}: ${issue}`);
}

function validateSlotsField(errors: string[], slots: unknown, where: string): void {
  if (!Array.isArray(slots)) {
    errors.push(`${where} must be an array`);
    return;
  }
  slots.forEach((slot, sli) => {
    const at = `${where}[${sli}]`;
    if (!slot || typeof slot !== 'object') {
      errors.push(`${at} must be an object`);
      return;
    }
    const type = (slot as Record<string, unknown>).type;
    if (typeof type !== 'string') {
      errors.push(`${at} is missing a string "type"`);
      return;
    }
    if (!getSlot(type)) errors.push(`${at} has unknown slot type: ${type}`);
  });
}
