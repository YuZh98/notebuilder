import type { Notebook, Section, Card, Slot } from './types';
import { derivedTagUnion } from './tags';
import { getSlot } from './slots/registry';
import { findGraphIssues, type GraphDecl } from './variable-graph';
import { uid } from './uid';
import { wellFormedDeep } from './well-formed';

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
export function importNotebook(input: NotebookJSON): Notebook {
  // Older payloads migrate below (v1 → v2 derives cats); only a NEWER version is rejected.
  if (input.version > SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${input.version}`);
  }
  // The import boundary: a lone UTF-16 surrogate (JSON.parse accepts "\ud83e") has no UTF-8
  // form, so it would reach SQLite as invalid bytes and fail every later save. Every string,
  // keys included, is made well-formed here — on a copy, so the caller's JSON is untouched.
  const json = wellFormedDeep(input);

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

/**
 * One validation finding. `code` is stable — hints and tooling key off it, never the prose.
 * `path` locates the finding from the document root (`notebook.sections[0].cards[1].w`;
 * `''` is the whole document). `message` is the sentence validateNotebook has always returned
 * (it may abbreviate the path as `sections[0]…`). `subject` names the offending value when a
 * fix needs it: the unknown slot type, the unwritten variable, the slot type whose props failed.
 */
export type Issue = { code: string; path: string; message: string; subject?: string };
export type IssueReport = { errors: Issue[]; warnings: Issue[] };

/** Validate JSON before importing, returning hard errors only (back-compat). */
export function validateNotebookJSON(json: unknown): string[] {
  return validateNotebook(json).errors;
}

/**
 * Validate JSON before importing. `errors` reject the import; `warnings` are tolerated
 * (D24): cross-card variable reads are scope smells, not corruption, so they only warn.
 */
export function validateNotebook(json: unknown): ValidationResult {
  const { errors, warnings } = validateNotebookIssues(json);
  return { errors: errors.map((i) => i.message), warnings: warnings.map((i) => i.message) };
}

/** A location carried two ways: the rooted path for tooling, the legacy prefix for messages. */
type Loc = { p: string; m: string };
const key = (l: Loc, k: string): Loc => ({ p: `${l.p}.${k}`, m: `${l.m}.${k}` });
const idx = (l: Loc, i: number): Loc => ({ p: `${l.p}[${i}]`, m: `${l.m}[${i}]` });
type Report = (code: string, path: string, message: string, subject?: string) => void;

/** Structured validation: the same checks as validateNotebook, as coded, path-addressed issues. */
export function validateNotebookIssues(json: unknown): IssueReport {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const into =
    (list: Issue[]): Report =>
    (code, path, message, subject) =>
      list.push(subject === undefined ? { code, path, message } : { code, path, message, subject });
  const err = into(errors);
  const warn = into(warnings);

  if (!json || typeof json !== 'object') {
    err('not-object', '', 'JSON must be an object');
    return { errors, warnings };
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.version !== 'number') err('version-missing', 'version', 'Missing or invalid "version" field');
  else if (obj.version > SCHEMA_VERSION) {
    err('version-newer', 'version', 'This file is from a newer version of the app — update the app, then import');
  }
  if (!obj.notebook || typeof obj.notebook !== 'object') {
    err('notebook-missing', 'notebook', 'Missing "notebook" field');
    return { errors, warnings };
  }
  const nb = obj.notebook as Record<string, unknown>;
  if (typeof nb.name !== 'string') err('wrong-type', 'notebook.name', 'notebook.name must be a string');
  if (nb.subtitle !== undefined && typeof nb.subtitle !== 'string') {
    err('wrong-type', 'notebook.subtitle', 'notebook.subtitle must be a string');
  }
  if (nb.width !== undefined && !['narrow', 'medium', 'wide'].includes(nb.width as string)) {
    err('bad-value', 'notebook.width', "notebook.width must be 'narrow', 'medium', or 'wide'");
  }
  if (nb.cats !== undefined && !isStringArray(nb.cats)) {
    err('wrong-type', 'notebook.cats', 'notebook.cats must be an array of strings');
  }
  if (!Array.isArray(nb.sections)) {
    err('wrong-type', 'notebook.sections', 'notebook.sections must be an array');
    return { errors, warnings };
  }
  nb.sections.forEach((s, si) => {
    const sl: Loc = { p: `notebook.sections[${si}]`, m: `sections[${si}]` };
    const at = (k: string) => key(sl, k);
    if (!s || typeof s !== 'object') {
      err('wrong-type', sl.p, `${sl.m} must be an object`);
      return;
    }
    const sec = s as Record<string, unknown>;
    if (sec.kind !== undefined && sec.kind !== 'divider') {
      err('bad-value', at('kind').p, `${at('kind').m} must be 'divider' if present`);
    }
    if (sec.locked !== undefined && typeof sec.locked !== 'boolean') {
      err('wrong-type', at('locked').p, `${at('locked').m} must be a boolean`);
    }
    if (sec.width !== undefined && (typeof sec.width !== 'number' || !Number.isFinite(sec.width) || sec.width <= 0)) {
      err('section-width-range', at('width').p, `${at('width').m} must be a positive finite number`);
    }
    for (const k of ['title', 'subtitle'] as const) {
      if (sec[k] !== undefined && typeof sec[k] !== 'string') err('wrong-type', at(k).p, `${at(k).m} must be a string`);
    }
    if (sec.services !== undefined && !isBoolRecord(sec.services)) {
      err('wrong-type', at('services').p, `${at('services').m} must be an object of booleans`);
    }
    if (sec.svcOrder !== undefined && !isStringArray(sec.svcOrder)) {
      err('wrong-type', at('svcOrder').p, `${at('svcOrder').m} must be an array of strings`);
    }
    if (sec.svcW !== undefined && !isNumberRecord(sec.svcW)) {
      err('wrong-type', at('svcW').p, `${at('svcW').m} must be an object of finite numbers`);
    }
    const cards = sec.cards;
    if (!Array.isArray(cards)) {
      err('wrong-type', at('cards').p, `${at('cards').m} must be an array`);
      return;
    }
    cards.forEach((c, ci) => {
      const cl = idx(at('cards'), ci);
      const where = cl.m;
      if (!c || typeof c !== 'object') {
        err('wrong-type', cl.p, `${where} must be an object`);
        return;
      }
      const card = c as Record<string, unknown>;
      if (card.accent !== undefined && typeof card.accent !== 'string') {
        err('wrong-type', key(cl, 'accent').p, `${where}.accent must be a string`);
      }
      if (card.archived !== undefined && typeof card.archived !== 'boolean') {
        err('wrong-type', key(cl, 'archived').p, `${where}.archived must be a boolean`);
      }
      // resize engine range: card width in twelfths, clamped to [3, 12]
      const w = card.w;
      if (w !== undefined && (typeof w !== 'number' || !Number.isFinite(w) || w < 3 || w > 12)) {
        err('card-width-range', key(cl, 'w').p, `${where}.w must be a number between 3 and 12`);
      }
      if (card.tags !== undefined && !isStringArray(card.tags)) {
        err('wrong-type', key(cl, 'tags').p, `${where}.tags must be an array of strings`);
      }
      validateCardVerbs(err, card.verbs, key(cl, 'verbs'));
      const slots = card.slots;
      validateSlotsField(err, slots, key(cl, 'slots'));
      const back = card.back;
      if (back !== undefined) validateSlotsField(err, back, key(cl, 'back'));
      // Both faces of a flip card share one scope, so the graph check spans them.
      validateCardGraph(err, warn, Array.isArray(slots) ? slots : [], Array.isArray(back) ? back : [], cl);
    });
  });
  return { errors, warnings };
}

/**
 * Static variable-graph check per card. Cycles are hard errors; missing dependencies
 * (a read with no writer in the card — a cross-card read) are downgraded to warnings (D24).
 */
function validateCardGraph(err: Report, warn: Report, front: unknown[], back: unknown[], card: Loc): void {
  const decls: GraphDecl[] = [];
  const collect = (slots: unknown[], face: 'slots' | 'back') =>
    slots.forEach((slot, sli) => {
      if (!slot || typeof slot !== 'object') return;
      const { type, props } = slot as Record<string, unknown>;
      const slotType = typeof type === 'string' ? getSlot(type) : undefined;
      if (!slotType || !props || typeof props !== 'object') return;
      try {
        const { reads, writes } = slotType.variables(props as Record<string, unknown>);
        decls.push({
          id: `${face}[${sli}] (${type})`,
          reads: reads.map((r) => r.key),
          writes: writes.map((w) => w.key),
        });
      } catch {
        // invalid props already reported by slot validation; graph check skips them
      }
    });
  collect(front, 'slots');
  collect(back, 'back');
  for (const issue of findGraphIssues(decls)) {
    const missing = /^missing dependency: "([^"]*)"/.exec(issue);
    if (missing) warn('cross-card-read', card.p, `${card.m}: ${issue}`, missing[1]);
    else err('cycle', card.p, `${card.m}: ${issue}`);
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

const isBoolRecord = (v: unknown): v is Record<string, boolean> =>
  isPlainObject(v) && Object.values(v).every((x) => typeof x === 'boolean');

const isNumberRecord = (v: unknown): v is Record<string, number> =>
  isPlainObject(v) && Object.values(v).every((x) => typeof x === 'number' && Number.isFinite(x));

const REVEAL_OPS = ['==', '!=', '>=', '<=', '>', '<'];
const FLAG_VERBS = ['glow', 'emphasis', 'sequential', 'locked'] as const;

/** Card verbs: `{ flip?: boolean, bare?: boolean }`. */
function validateCardVerbs(err: Report, verbs: unknown, at: Loc): void {
  if (verbs === undefined) return;
  if (!isPlainObject(verbs)) {
    err('bad-verbs', at.p, `${at.m} must be an object`);
    return;
  }
  for (const k of ['flip', 'bare'] as const) {
    if (verbs[k] !== undefined && typeof verbs[k] !== 'boolean') {
      err('bad-verbs', key(at, k).p, `${key(at, k).m} must be a boolean`);
    }
  }
}

/** Slot verbs: boolean flags, `reveal: { key, op, val }`, `hint: { content }` (types.ts VerbConfig). */
function validateSlotVerbs(err: Report, verbs: unknown, at: Loc): void {
  if (verbs === undefined) return;
  if (!isPlainObject(verbs)) {
    err('bad-verbs', at.p, `${at.m} must be an object`);
    return;
  }
  for (const k of FLAG_VERBS) {
    if (verbs[k] !== undefined && typeof verbs[k] !== 'boolean') {
      err('bad-verbs', key(at, k).p, `${key(at, k).m} must be a boolean`);
    }
  }
  const r = verbs.reveal;
  if (r !== undefined) {
    // val is optional and may be null: an Infinity typed into the reveal field serializes as null.
    const ok =
      isPlainObject(r) &&
      typeof r.key === 'string' &&
      REVEAL_OPS.includes(r.op as string) &&
      (r.val === undefined || r.val === null || ['number', 'string', 'boolean'].includes(typeof r.val));
    if (!ok) {
      const at2 = key(at, 'reveal');
      err('bad-verbs', at2.p, `${at2.m} must be { key: string, op: one of ${REVEAL_OPS.join(' ')}, val: number | string | boolean }`);
    }
  }
  const h = verbs.hint;
  if (h !== undefined && !(isPlainObject(h) && typeof h.content === 'string')) {
    err('bad-verbs', key(at, 'hint').p, `${key(at, 'hint').m} must be { content: string }`);
  }
}

function validateSlotsField(err: Report, slots: unknown, where: Loc): void {
  if (!Array.isArray(slots)) {
    err('wrong-type', where.p, `${where.m} must be an array`);
    return;
  }
  slots.forEach((slot, sli) => {
    const at = idx(where, sli);
    if (!slot || typeof slot !== 'object') {
      err('wrong-type', at.p, `${at.m} must be an object`);
      return;
    }
    const s = slot as Record<string, unknown>;
    const type = s.type;
    if (typeof type !== 'string') {
      err('slot-type-missing', key(at, 'type').p, `${at.m} is missing a string "type"`);
      return;
    }
    const slotType = getSlot(type);
    if (!slotType) err('slot-type-unknown', key(at, 'type').p, `${at.m} has unknown slot type: ${type}`, type);
    const fuseW = s.fuseW;
    if (fuseW !== undefined && (typeof fuseW !== 'number' || !Number.isFinite(fuseW) || fuseW <= 0)) {
      err('fuse-width-range', key(at, 'fuseW').p, `${at.m}.fuseW must be a positive number`);
    }
    validateSlotVerbs(err, s.verbs, key(at, 'verbs'));
    if (!slotType) return;
    // Mirrors importSlot, which runs the same validate() and throws on any problem it reports.
    if (!isPlainObject(s.props)) {
      err('props-not-object', key(at, 'props').p, `${at.m}.props must be an object`, type);
      return;
    }
    let problems: unknown = [];
    try {
      problems = slotType.validate?.(s.props) ?? [];
    } catch (e) {
      problems = [`props are malformed (${e instanceof Error ? e.message : String(e)})`];
    }
    for (const p of Array.isArray(problems) ? problems : []) {
      err('slot-props', key(at, 'props').p, `${at.m}: ${type} slot — ${String(p)}`, type);
    }
  });
}
