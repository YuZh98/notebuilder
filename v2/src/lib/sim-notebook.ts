/**
 * Seeded notebook generators for the generative `*.sim.test.ts` suites.
 * Test-only — no app module imports this.
 *
 * Everything here is built through the real slot registry: props start from
 * `getSlot(type).create()` and are then randomised within each slot's own
 * `validate()` contract, so a generated notebook is always importable.
 */
import { CARD_STATE_KEY } from './card-done';
import { getSlot } from './slots/registry';
import { derivedTagUnion } from './tags';
import type { Card, Notebook, Section, Slot, SlotProps } from './types';
import type { Rng } from './sim-rng';

export const TAG_POOL = ['algebra', 'stats', 'σ-tag', 'review', 'hard'];
const ACCENTS = ['#ff0055', 'var(--accent)', 'rebeccapurple', ''];
const SERVICE_KEYS = ['pin', 'shuffle', 'flipAll', 'reset', 'search', 'archive', 'notes'];
const IMAGE_SRCS = [
  '',
  'https://example.test/a.png',
  'http://example.test/b.jpg',
  'data:image/png;base64,iVBORw0KGgo=',
  'file:///tmp/c.png',
];
const LANGS = ['js', 'python', 'r', ''];
/** Factory card-type ids a generated card can be stamped from. */
const TYPE_IDS = ['ct_flash', 'ct_note', 'ct_cheatsheet', 'ct_code'];
const LIST_STYLES = ['bullets', 'numbered', 'check'] as const;
const PROGRESS_SCOPES = ['section', 'chapter', 'notebook'] as const;

/** Slot types the generator can emit — the full registry. */
export const SLOT_TYPES = [
  'text', 'slider', 'compute', 'chart', 'code', 'image',
  'table', 'text-input', 'choice', 'list', 'progress',
];

/** Completable slot types, for the progress simulation. */
export const COMPLETABLE_TYPES = ['choice', 'text-input', 'list'];

/** Variable keys that never collide with evalExpr's builtin function/constant names. */
const KEY_POOL = ['aa', 'ab', 'ac', 'ad', 'ba', 'bb', 'bc', 'bd', 'ca', 'cb', 'cc', 'cd'];

/** Per-card key allocator: one writer per variable, reads only of earlier keys. */
type CardVars = { free: string[]; declared: string[] };

const takeKey = (v: CardVars): string | undefined => v.free.shift();

function genExpr(r: Rng, vars: string[], depth = 0): string {
  if (vars.length === 0) return String(r.between(1, 20));
  if (depth >= 2 || r.bool(0.4)) return r.bool(0.75) ? r.pick(vars) : String(r.between(1, 20));
  const a = genExpr(r, vars, depth + 1);
  const b = genExpr(r, vars, depth + 1);
  switch (r.int(5)) {
    case 0: return `(${a} + ${b})`;
    case 1: return `(${a} * ${b})`;
    case 2: return `min(${a}, ${b})`;
    case 3: return `sqrt(abs(${a}))`;
    default: return `(${a} - ${b})`;
  }
}

/**
 * Randomise a slot type's props inside its own validate() contract. Returns
 * undefined when the type needs a variable key and the card pool is exhausted.
 */
function genProps(r: Rng, type: string, vars: CardVars): SlotProps | undefined {
  const base = getSlot(type)!.create() as SlotProps;
  switch (type) {
    case 'text': {
      const ref = vars.declared.length && r.bool(0.5) ? `{{${r.pick(vars.declared)}}}` : '';
      return { ...base, text: `${r.phrase()} ${ref}`.trim() };
    }
    case 'slider': {
      const key = takeKey(vars);
      if (!key) return undefined;
      vars.declared.push(key);
      const min = r.between(-50, 0);
      const max = min + r.between(1, 100);
      return {
        ...base,
        key,
        value: r.between(min, max),
        min,
        max,
        step: r.pick([1, 0.5, 5]),
        ...(r.bool(0.3) && { showName: r.bool() }),
        ...(r.bool(0.3) && { showValue: r.bool() }),
        ...(r.bool(0.3) && { showSlider: r.bool() }),
      };
    }
    case 'compute': {
      const out = takeKey(vars);
      if (!out) return undefined;
      const expr = genExpr(r, vars.declared);
      vars.declared.push(out);
      return { ...base, expr, out, note: r.phrase(2) };
    }
    case 'chart': {
      const x0 = r.between(-10, 0);
      return {
        ...base,
        fn: genExpr(r, [...vars.declared, 'x']),
        label: r.phrase(2),
        x0,
        x1: x0 + r.between(1, 20),
        y0: r.between(-10, 0),
        y1: r.between(1, 20),
        xticks: r.between(2, 10),
        yticks: r.between(2, 10),
        hover: r.bool(),
      };
    }
    case 'code':
      return { ...base, code: r.phrase(6), ...(r.bool(0.7) && { lang: r.pick(LANGS) }) };
    case 'image':
      return { ...base, src: r.pick(IMAGE_SRCS), alt: r.phrase(3) };
    case 'table': {
      const cols = r.between(1, 4);
      const rows = r.between(1, 4);
      return {
        ...base,
        rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => r.word())),
      };
    }
    case 'text-input':
      return {
        ...base,
        ...(r.bool(0.7) && { placeholder: r.phrase(3) }),
        ...(r.bool(0.5) && { key: r.pick(KEY_POOL) }),
      };
    case 'choice': {
      const options = Array.from({ length: r.between(2, 5) }, () => r.word());
      const answer = r.sample(
        options.map((_, i) => i),
        r.int(3),
      );
      return {
        ...base,
        options,
        answer,
        multi: answer.length > 1 || r.bool(0.3),
        ...(r.bool(0.6) && { q: r.phrase(4) }),
        ...(r.bool(0.4) && { explanation: r.phrase(5) }),
      };
    }
    case 'list':
      return {
        ...base,
        items: Array.from({ length: r.int(6) }, () => r.word()),
        style: r.pick(LIST_STYLES),
      };
    case 'progress':
      return {
        ...base,
        scope: r.pick(PROGRESS_SCOPES),
        ...(r.bool(0.7) && { label: r.phrase(2) }),
        ...(r.bool(0.5) && { track: r.sample(TAG_POOL, r.int(3)) }),
        ...(r.bool(0.6) && { show: { mn: r.bool(), pct: r.bool(), bar: r.bool() } }),
      };
    default:
      return base;
  }
}

let counter = 0;
const nextId = (p: string): string => `${p}-sim-${counter++}`;

/** Reset the id counter so a seed alone determines a generated notebook's shape. */
export function resetSimIds(): void {
  counter = 0;
}

function genSlot(r: Rng, types: readonly string[], vars: CardVars): Slot | undefined {
  const type = r.pick(types);
  const props = genProps(r, type, vars);
  if (!props) return undefined;
  return {
    id: nextId('slot'),
    type,
    props,
    ...(r.bool(0.25) && { verbs: genVerbs(r, vars.declared) }),
    ...(r.bool(0.3) && { w: r.between(1, 12) }),
    ...(r.bool(0.15) && { fuse: r.bool() }),
    ...(r.bool(0.15) && { fuseW: r.between(1, 12) }),
  };
}

function genVerbs(r: Rng, declared: string[]): Slot['verbs'] {
  return {
    ...(declared.length > 0 && r.bool(0.5) && {
      reveal: { key: r.pick(declared), op: r.pick(['==', '!=', '>=', '<=', '>', '<'] as const), val: r.between(0, 10) },
    }),
    ...(r.bool(0.3) && { glow: r.bool() }),
    ...(r.bool(0.3) && { emphasis: r.bool() }),
    ...(r.bool(0.3) && { hint: { content: r.phrase(3) } }),
    ...(r.bool(0.2) && { sequential: r.bool() }),
    ...(r.bool(0.2) && { locked: r.bool() }),
  };
}

export type CardOpts = {
  /** Restrict the slot pool (the progress sim narrows it to completable types). */
  types?: readonly string[];
  /** Force `verbs.flip` on/off instead of drawing it. */
  flip?: boolean;
};

function genCard(r: Rng, sectionId: string, position: number, opts: CardOpts = {}): Card {
  const types = opts.types ?? SLOT_TYPES;
  // Front and back share one card scope, so both faces draw keys from one pool.
  const vars: CardVars = { free: r.shuffle(KEY_POOL), declared: [] };
  const flip = opts.flip ?? r.bool(0.3);

  const slots: Slot[] = [];
  for (let i = 0; i < r.between(1, 4); i++) {
    const slot = genSlot(r, types, vars);
    if (slot) slots.push(slot);
  }
  if (slots.length === 0) {
    slots.push({ id: nextId('slot'), type: 'text', props: { text: r.phrase(3) } });
  }

  const back: Slot[] = [];
  if (flip) {
    for (let i = 0; i < r.between(1, 2); i++) {
      const slot = genSlot(r, types, vars);
      if (slot) back.push(slot);
    }
  }

  const tags = r.sample(TAG_POOL, r.int(3));
  return {
    id: nextId('card'),
    sectionId,
    position,
    slots,
    ...(r.bool(0.35) && { typeId: r.pick(TYPE_IDS) }),
    ...((flip || r.bool(0.2)) && { verbs: { ...(flip && { flip: true }), ...(r.bool(0.3) && { bare: true }) } }),
    ...(flip && { back }),
    ...(r.bool(0.6) && { tags }),
    ...(r.bool(0.4) && { accent: r.pick(ACCENTS) }),
    ...(r.bool(0.4) && { w: r.between(3, 12) }),
    ...(r.bool(0.25) && { archived: r.bool(0.6) }),
  };
}

export type NotebookOpts = CardOpts & {
  minSections?: number;
  maxSections?: number;
  maxCards?: number;
  /** Probability a section is a chapter divider (dividers hold no cards). */
  dividerP?: number;
};

export function genNotebook(r: Rng, opts: NotebookOpts = {}): Notebook {
  const notebookId = nextId('nb');
  const count = r.between(opts.minSections ?? 1, opts.maxSections ?? 5);
  const sections: Section[] = [];

  for (let si = 0; si < count; si++) {
    const sectionId = nextId('sec');
    const divider = si > 0 && r.bool(opts.dividerP ?? 0.25);
    const cards = divider
      ? []
      : Array.from({ length: r.int((opts.maxCards ?? 4) + 1) }, (_, ci) =>
          genCard(r, sectionId, ci, opts),
        );
    sections.push({
      id: sectionId,
      notebookId,
      name: r.phrase(3),
      position: si,
      cards,
      ...(divider && { kind: 'divider' as const }),
      ...(r.bool(0.25) && { locked: r.bool() }),
      ...(r.bool(0.3) && { width: r.between(1, 1600) }),
      ...(r.bool(0.3) && { title: r.phrase(3) }),
      ...(r.bool(0.3) && { subtitle: r.phrase(4) }),
      // folded is local-only and deliberately dropped on export.
      ...(r.bool(0.3) && { folded: r.bool() }),
      ...(r.bool(0.3) && {
        services: Object.fromEntries(r.sample(SERVICE_KEYS, r.between(1, 4)).map((k) => [k, r.bool()])),
      }),
      ...(r.bool(0.25) && { svcOrder: r.sample(SERVICE_KEYS, r.between(1, 5)) }),
      ...(r.bool(0.25) && {
        svcW: Object.fromEntries(r.sample(SERVICE_KEYS, r.between(1, 3)).map((k) => [k, r.between(20, 200)])),
      }),
    });
  }

  const nb: Notebook = {
    id: notebookId,
    name: r.phrase(4),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    sections,
    ...(r.bool(0.5) && { subtitle: r.phrase(5) }),
    ...(r.bool(0.5) && { width: r.pick(['narrow', 'medium', 'wide'] as const) }),
  };
  // Import always materialises cats; leave them off sometimes to exercise the
  // v1 -> v2 derivation path (D26).
  if (r.bool(0.7)) nb.cats = r.shuffle([...TAG_POOL]).slice(0, r.between(0, TAG_POOL.length));
  return nb;
}

/**
 * The interchange-visible content of a notebook: everything `exportNotebook`
 * carries, with regenerated identity (ids, positions, timestamps) and the two
 * documented local-only fields (`folded`, empty `tags`) normalised away.
 */
export function canonicalNotebook(nb: Notebook): unknown {
  return {
    name: nb.name,
    subtitle: nb.subtitle,
    width: nb.width,
    cats: nb.cats ?? derivedTagUnion(nb),
    sections: nb.sections.map((s) => ({
      name: s.name,
      kind: s.kind,
      locked: s.locked,
      width: s.width,
      title: s.title,
      subtitle: s.subtitle,
      services: s.services,
      svcOrder: s.svcOrder,
      svcW: s.svcW,
      cards: s.cards.map((c) => ({
        slots: c.slots.map(canonicalSlot),
        typeId: c.typeId,
        verbs: c.verbs,
        back: c.back?.map(canonicalSlot),
        tags: c.tags && c.tags.length > 0 ? c.tags : undefined,
        accent: c.accent,
        w: c.w,
        archived: c.archived,
      })),
    })),
  };
}

const canonicalSlot = (s: Slot): unknown => ({
  type: s.type,
  props: s.props,
  verbs: s.verbs,
  w: s.w,
  fuse: s.fuse,
  fuseW: s.fuseW,
});

/** Reader state, keyed card id -> slot id -> slot state (the shape App/Reader pass). */
export type ReaderState = Record<string, Record<string, Record<string, unknown>>>;

/** One step of a reader's progress: overwrite one slot's state on one card. */
type Step = { cardId: string; slotId: string; state: Record<string, unknown> };

/**
 * The increasing chain of reader states for one completable slot, ending in a
 * state its `isDone` accepts. Non-completable slots yield an empty chain.
 */
function doneChain(r: Rng, slot: Slot): Record<string, unknown>[] {
  const type = getSlot(slot.type);
  if (!type?.completable) return [];
  switch (slot.type) {
    case 'choice':
      return [{ picked: r.int(3) }, { picked: r.int(3), submitted: true }];
    case 'text-input':
      return [{ value: '' }, { value: r.word() || 'answered' }];
    case 'list': {
      const items = (slot.props.items as string[]) ?? [];
      if (slot.props.style !== 'check') return [];
      // Growing prefixes of the checked array: only the last one is done.
      return items.map((_x, i) => ({ checked: items.map((_y, j) => j <= i) }));
    }
    default:
      return [];
  }
}

/**
 * A reader-state sequence that only ever adds completions: every snapshot is a
 * superset of the previous one, and the last snapshot completes every
 * completable slot (and flips every flip card). Returns the snapshots.
 */
export function completionSequence(r: Rng, cards: Card[]): ReaderState[] {
  const chains: Step[][] = [];
  for (const card of cards) {
    for (const slot of [...card.slots, ...(card.back ?? [])]) {
      const chain = doneChain(r, slot);
      if (chain.length) chains.push(chain.map((state) => ({ cardId: card.id, slotId: slot.id, state })));
    }
    if (card.verbs?.flip) {
      chains.push([{ cardId: card.id, slotId: CARD_STATE_KEY, state: { seenBack: true } }]);
    }
  }

  // Interleave the chains randomly while preserving each chain's own order.
  const cursor = chains.map(() => 0);
  const state: ReaderState = {};
  const snapshots: ReaderState[] = [structuredClone(state)];
  for (;;) {
    const pending = cursor.map((c, i) => (c < chains[i].length ? i : -1)).filter((i) => i >= 0);
    if (pending.length === 0) break;
    const pick = pending[r.int(pending.length)];
    const step = chains[pick][cursor[pick]++];
    (state[step.cardId] ??= {})[step.slotId] = step.state;
    snapshots.push(structuredClone(state));
  }
  return snapshots;
}
