import { uid } from './uid';
import type { Card, Slot } from './types';
import { stampSlot, templateSlot, type CardType, type Variety } from './card-types';

/**
 * A bench is the Factory's working copy of a product: a live, editable card
 * whose slots carry real instance ids (unlike a CardType's id-less templates).
 */
export type Bench = {
  id: string;
  name: string;
  verbs?: { flip?: boolean; bare?: boolean };
  slots: Slot[];
  back?: Slot[];
  accent?: string;
  note?: string;
  icon?: string;
  varieties?: Variety[];
  src?: { id: string; name: string } | null;
};

type Factory = {
  benches: Bench[];
  active: string | null;
  preview: boolean;
  sel: number | null;
  face: 'front' | 'back';
};

/** Session Factory state; `benches`/`active` persist, `preview`/`sel`/`face` are session-only. */
export const factory: Factory = $state({
  benches: [],
  active: null,
  preview: false,
  sel: null,
  face: 'front',
});

/** A blank bench — v1 30-state.js:13 shape. */
export function freshBench(): Bench {
  return { id: uid('bench'), name: 'New product', slots: [] };
}

/** The active bench, self-healing empty/dangling state (v1 rebuildRefs 30-state.js:174-177). */
export function activeBench(): Bench {
  if (!factory.benches.length) factory.benches.push(freshBench());
  if (!factory.active || !factory.benches.some((b) => b.id === factory.active)) {
    factory.active = factory.benches[0].id;
  }
  return factory.benches.find((b) => b.id === factory.active)!;
}

/** Push a bench, activate it, and clear the slot selection. */
export function addBench(b: Bench = freshBench()): void {
  factory.benches.push(b);
  factory.active = b.id;
  factory.sel = null;
}

/** Deep-clone a bench with fresh slot ids and a ' copy' name, then activate it. */
export function dupBench(id: string): void {
  const src = factory.benches.find((b) => b.id === id);
  if (!src) return;
  const snap = $state.snapshot(src) as Bench;
  const copy: Bench = {
    ...snap,
    id: uid('bench'),
    name: snap.name + ' copy',
    slots: snap.slots.map(reidSlot),
    ...(snap.back && { back: snap.back.map(reidSlot) }),
  };
  addBench(copy);
}

/** Delete a bench, keeping at least one: an emptied factory gets a fresh bench. */
export function delBench(id: string): void {
  factory.benches = factory.benches.filter((b) => b.id !== id);
  if (!factory.benches.length) factory.benches.push(freshBench());
  if (!factory.benches.some((b) => b.id === factory.active)) {
    factory.active = factory.benches[0].id;
  }
  factory.sel = null;
}

/** Seal a bench into a reusable CardType, stripping slot ids (id minted here, seal flow may replace it). */
export function benchToType(b: Bench, name: string): CardType {
  return {
    id: uid('ct'),
    name,
    slots: b.slots.map(templateSlot),
    ...(b.verbs && { verbs: structuredClone($state.snapshot(b.verbs)) }),
    ...(b.back && { back: b.back.map(templateSlot) }),
    ...(b.accent && { accent: b.accent }),
    ...(b.note && { note: b.note }),
    ...(b.icon && { icon: b.icon }),
    ...(b.varieties && { varieties: structuredClone($state.snapshot(b.varieties)) }),
  };
}

/** Fork a CardType into a fresh bench with new slot ids and a src back-reference (v1 loadprod 70-events.js:139). */
export function typeToBench(ct: CardType): Bench {
  return {
    id: uid('bench'),
    name: ct.name,
    slots: ct.slots.map(stampSlot),
    ...(ct.verbs && { verbs: structuredClone(ct.verbs) }),
    ...(ct.back && { back: ct.back.map(stampSlot) }),
    ...(ct.accent && { accent: ct.accent }),
    ...(ct.note && { note: ct.note }),
    ...(ct.icon && { icon: ct.icon }),
    ...(ct.varieties && { varieties: structuredClone(ct.varieties) }),
    src: { id: ct.id, name: ct.name },
  };
}

/**
 * Synthetic Card for Build-mode rendering that SHARES the bench's live slot arrays —
 * editing through the card mutates the bench in place. Preview mode must snapshot instead.
 */
export function benchPreviewCard(b: Bench): Card {
  return {
    id: b.id,
    sectionId: '',
    position: 0,
    slots: b.slots,
    ...(b.verbs && { verbs: b.verbs }),
    ...(b.back && { back: b.back }),
    ...(b.accent && { accent: b.accent }),
  };
}

/** Persisted slice of Factory state — session-only fields are excluded by design. */
export function serializeFactory(): string {
  return JSON.stringify({
    benches: $state.snapshot(factory.benches),
    active: factory.active,
  });
}

/** Restore Factory state, tolerating bad JSON by self-healing to a fresh usable state. */
export function hydrateFactory(json: string | null): void {
  let data: { benches?: unknown; active?: unknown } | null = null;
  try {
    data = json ? JSON.parse(json) : null;
  } catch {
    data = null;
  }
  factory.benches = Array.isArray(data?.benches) ? (data.benches as Bench[]) : [];
  factory.active = typeof data?.active === 'string' ? data.active : null;
  factory.preview = false;
  factory.sel = null;
  factory.face = 'front';
  activeBench();
}

const reidSlot = (s: Slot): Slot => ({ ...s, id: uid('slot') });
