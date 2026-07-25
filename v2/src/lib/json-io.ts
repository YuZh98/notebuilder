import type { Notebook, Section, Card, Slot } from './types';
import { derivedTagUnion } from './tags';
import { getSlot } from './slots/registry';
import { findGraphIssues, type GraphDecl } from './variable-graph';
import { uid } from './uid';

// v2 (D26): the notebook carries `cats` — author-controlled tag identity and order.
const SCHEMA_VERSION = 2;

export type NotebookJSON = {
  version: number;
  notebook: {
    name: string;
    subtitle?: string;
    width?: 'narrow' | 'medium' | 'wide';
    cats?: string[];
    sections: SectionJSON[];
  };
};

// `folded` is deliberately absent: fold state is local-only and never exported.
type SectionJSON = {
  name: string;
  cards: CardJSON[];
  kind?: 'divider';
  locked?: boolean;
  width?: number;
  title?: string;
  subtitle?: string;
  services?: Record<string, boolean>;
  svcOrder?: string[];
  svcW?: Record<string, number>;
};

type CardJSON = {
  slots: SlotJSON[];
  typeId?: string;
  verbs?: { flip?: boolean; bare?: boolean };
  back?: SlotJSON[];
  tags?: string[];
  accent?: string;
  w?: number;
  archived?: boolean;
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
      ...(notebook.subtitle !== undefined && { subtitle: notebook.subtitle }),
      ...(notebook.width !== undefined && { width: notebook.width }),
      ...(notebook.cats !== undefined && { cats: notebook.cats }),
      sections: notebook.sections.map((s) => ({
        name: s.name,
        ...(s.kind !== undefined && { kind: s.kind }),
        ...(s.locked !== undefined && { locked: s.locked }),
        ...(s.width !== undefined && { width: s.width }),
        ...(s.title !== undefined && { title: s.title }),
        ...(s.subtitle !== undefined && { subtitle: s.subtitle }),
        ...(s.services !== undefined && { services: s.services }),
        ...(s.svcOrder !== undefined && { svcOrder: s.svcOrder }),
        ...(s.svcW !== undefined && { svcW: s.svcW }),
        cards: s.cards.map((c) => ({
          slots: c.slots.map(exportSlot),
          ...(c.typeId !== undefined && { typeId: c.typeId }),
          ...(c.verbs && { verbs: c.verbs }),
          ...(c.back && { back: c.back.map(exportSlot) }),
          ...(c.tags && c.tags.length > 0 && { tags: c.tags }),
          ...(c.accent !== undefined && { accent: c.accent }),
          ...(c.w !== undefined && { w: c.w }),
          ...(c.archived !== undefined && { archived: c.archived }),
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
  // Older payloads migrate below (v1 → v2 derives cats); only a NEWER version is rejected.
  if (json.version > SCHEMA_VERSION) {
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
      ...(c.typeId !== undefined && { typeId: c.typeId }),
      ...(c.verbs && { verbs: c.verbs }),
      ...(c.back && { back: c.back.map(importSlot) }),
      ...(c.tags && { tags: c.tags }),
      ...(c.accent !== undefined && { accent: c.accent }),
      ...(c.w !== undefined && { w: c.w }),
      ...(c.archived !== undefined && { archived: c.archived }),
    }));
    return {
      id: sectionId,
      notebookId,
      name: s.name,
      position: si,
      cards,
      ...(s.kind !== undefined && { kind: s.kind }),
      ...(s.locked !== undefined && { locked: s.locked }),
      ...(s.width !== undefined && { width: s.width }),
      ...(s.title !== undefined && { title: s.title }),
      ...(s.subtitle !== undefined && { subtitle: s.subtitle }),
      ...(s.services !== undefined && { services: s.services }),
      ...(s.svcOrder !== undefined && { svcOrder: s.svcOrder }),
      ...(s.svcW !== undefined && { svcW: s.svcW }),
    };
  });

  const nb: Notebook = {
    id: notebookId,
    name: json.notebook.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections,
    ...(json.notebook.subtitle !== undefined && { subtitle: json.notebook.subtitle }),
    ...(json.notebook.width !== undefined && { width: json.notebook.width }),
  };
  // v1 payloads carry no cats: derive first-seen from card tags (D26 migration).
  nb.cats = json.notebook.cats ?? derivedTagUnion(nb);
  return nb;
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

export type ValidationResult = { errors: string[]; warnings: string[] };

/** Validate JSON before importing, returning hard errors only (back-compat). */
export function validateNotebookJSON(json: unknown): string[] {
  return validateNotebook(json).errors;
}

/**
 * Validate JSON before importing. `errors` reject the import; `warnings` are tolerated
 * (D24): cross-card variable reads are scope smells, not corruption, so they only warn.
 */
export function validateNotebook(json: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!json || typeof json !== 'object') {
    errors.push('JSON must be an object');
    return { errors, warnings };
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.version !== 'number') errors.push('Missing or invalid "version" field');
  else if (obj.version > SCHEMA_VERSION) {
    errors.push('This file is from a newer version of the app — update the app, then import');
  }
  if (!obj.notebook || typeof obj.notebook !== 'object') {
    errors.push('Missing "notebook" field');
    return { errors, warnings };
  }
  const nb = obj.notebook as Record<string, unknown>;
  if (typeof nb.name !== 'string') errors.push('notebook.name must be a string');
  if (nb.subtitle !== undefined && typeof nb.subtitle !== 'string') {
    errors.push('notebook.subtitle must be a string');
  }
  if (nb.width !== undefined && !['narrow', 'medium', 'wide'].includes(nb.width as string)) {
    errors.push("notebook.width must be 'narrow', 'medium', or 'wide'");
  }
  if (nb.cats !== undefined && !(Array.isArray(nb.cats) && nb.cats.every((t) => typeof t === 'string'))) {
    errors.push('notebook.cats must be an array of strings');
  }
  if (!Array.isArray(nb.sections)) {
    errors.push('notebook.sections must be an array');
    return { errors, warnings };
  }
  nb.sections.forEach((s, si) => {
    if (!s || typeof s !== 'object') {
      errors.push(`sections[${si}] must be an object`);
      return;
    }
    const sec = s as Record<string, unknown>;
    if (sec.kind !== undefined && sec.kind !== 'divider') {
      errors.push(`sections[${si}].kind must be 'divider' if present`);
    }
    if (sec.locked !== undefined && typeof sec.locked !== 'boolean') {
      errors.push(`sections[${si}].locked must be a boolean`);
    }
    if (sec.width !== undefined && (typeof sec.width !== 'number' || !Number.isFinite(sec.width) || sec.width <= 0)) {
      errors.push(`sections[${si}].width must be a positive finite number`);
    }
    if (sec.title !== undefined && typeof sec.title !== 'string') {
      errors.push(`sections[${si}].title must be a string`);
    }
    if (sec.subtitle !== undefined && typeof sec.subtitle !== 'string') {
      errors.push(`sections[${si}].subtitle must be a string`);
    }
    if (sec.services !== undefined && !isBoolRecord(sec.services)) {
      errors.push(`sections[${si}].services must be an object of booleans`);
    }
    if (sec.svcOrder !== undefined && !isStringArray(sec.svcOrder)) {
      errors.push(`sections[${si}].svcOrder must be an array of strings`);
    }
    if (sec.svcW !== undefined && !isNumberRecord(sec.svcW)) {
      errors.push(`sections[${si}].svcW must be an object of finite numbers`);
    }
    const cards = sec.cards;
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
      const accent = (c as Record<string, unknown>).accent;
      if (accent !== undefined && typeof accent !== 'string') {
        errors.push(`${where}.accent must be a string`);
      }
      const archived = (c as Record<string, unknown>).archived;
      if (archived !== undefined && typeof archived !== 'boolean') {
        errors.push(`${where}.archived must be a boolean`);
      }
      // resize engine range: card width in twelfths, clamped to [3, 12]
      const w = (c as Record<string, unknown>).w;
      if (w !== undefined && (typeof w !== 'number' || !Number.isFinite(w) || w < 3 || w > 12)) {
        errors.push(`${where}.w must be a number between 3 and 12`);
      }
      const slots = (c as Record<string, unknown>).slots;
      validateSlotsField(errors, slots, `${where}.slots`);
      const back = (c as Record<string, unknown>).back;
      if (back !== undefined) validateSlotsField(errors, back, `${where}.back`);
      // Both faces of a flip card share one scope, so the graph check spans them.
      const allSlots = [...(Array.isArray(slots) ? slots : []), ...(Array.isArray(back) ? back : [])];
      validateCardGraph(errors, warnings, allSlots, where);
    });
  });
  return { errors, warnings };
}

/**
 * Static variable-graph check per card. Cycles are hard errors; missing dependencies
 * (a read with no writer in the card — a cross-card read) are downgraded to warnings (D24).
 */
function validateCardGraph(errors: string[], warnings: string[], slots: unknown[], where: string): void {
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
  for (const issue of findGraphIssues(decls)) {
    if (issue.startsWith('missing dependency')) warnings.push(`${where}: ${issue}`);
    else errors.push(`${where}: ${issue}`);
  }
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

const isBoolRecord = (v: unknown): v is Record<string, boolean> =>
  !!v && typeof v === 'object' && !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === 'boolean');

const isNumberRecord = (v: unknown): v is Record<string, number> =>
  !!v && typeof v === 'object' && !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === 'number' && Number.isFinite(x));

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
    const fuseW = (slot as Record<string, unknown>).fuseW;
    if (fuseW !== undefined && (typeof fuseW !== 'number' || !Number.isFinite(fuseW) || fuseW <= 0)) {
      errors.push(`${at}.fuseW must be a positive number`);
    }
  });
}
