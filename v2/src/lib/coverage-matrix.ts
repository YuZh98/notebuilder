import type { Card, Notebook } from './types';
import type { CardType } from './card-types';

export type MatrixAxis = 'section' | 'product' | 'tag';

/** Untagged/untyped sentinel — the ∅ bucket id on the tag and product axes. */
export const UNTAG = '∅';

const SEP = '␟';

export type AxisValue = { id: string; label: string };

export type AxisDim = {
  key: MatrixAxis;
  label: string;
  values: AxisValue[];
  reorderable: boolean;
};

const AXIS_ORDER: MatrixAxis[] = ['section', 'product', 'tag'];

/** Resolved product name for a card, or null when untyped or unknown-typed. */
function productName(card: Card, types: CardType[]): string | null {
  if (!card.typeId) return null;
  return types.find((t) => t.id === card.typeId)?.name ?? null;
}

function axisMatch(
  card: Card,
  sectionId: string,
  axis: MatrixAxis,
  valueId: string,
  types: CardType[],
): boolean {
  if (axis === 'section') return sectionId === valueId;
  if (axis === 'product') {
    const name = productName(card, types);
    return valueId === UNTAG ? name === null : name === valueId;
  }
  return valueId === UNTAG ? !card.tags?.length : !!card.tags?.includes(valueId);
}

/** v1 60-stage has() predicates — section by sectionId, product by type name, tag by membership. */
export function cardHas(card: Card, axis: MatrixAxis, valueId: string, types: CardType[]): boolean {
  return axisMatch(card, card.sectionId, axis, valueId, types);
}

export function cellKey(rowId: string, colId: string): string {
  return `${rowId}${SEP}${colId}`;
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf(SEP);
  return [key.slice(0, i), key.slice(i + 1)];
}

/** v1 mtxDims 60-stage:58-65 — section (reorderable), product (typeId→name), tag (nb-wide). */
export function matrixDims(nb: Notebook, types: CardType[]): AxisDim[] {
  const section: AxisValue[] = nb.sections
    .filter((s) => s.kind !== 'divider')
    .map((s) => ({ id: s.id, label: s.name }));

  const productNames: string[] = [];
  let hasUntyped = false;
  // cats order leads (D26); tags on cards but absent from cats append first-seen.
  const tags: string[] = [...(nb.cats ?? [])];
  for (const s of nb.sections) {
    for (const c of s.cards) {
      const name = productName(c, types);
      if (name === null) hasUntyped = true;
      else if (!productNames.includes(name)) productNames.push(name);
      for (const t of c.tags ?? []) if (!tags.includes(t)) tags.push(t);
    }
  }

  const product: AxisValue[] = productNames.map((n) => ({ id: n, label: n }));
  if (hasUntyped) product.push({ id: UNTAG, label: 'untyped' });

  const tag: AxisValue[] = tags.map((t) => ({ id: t, label: t }));
  tag.push({ id: UNTAG, label: 'untagged' });

  return [
    { key: 'section', label: 'Sections', values: section, reorderable: true },
    { key: 'product', label: 'Products', values: product, reorderable: false },
    { key: 'tag', label: 'Tags', values: tag, reorderable: false },
  ];
}

/** v1 mtxEffectiveAxes 60-stage:68-71 — pure fallback to the first two qualifying axes. */
export function effectiveAxes(
  dims: AxisDim[],
  row: MatrixAxis | null,
  col: MatrixAxis | null,
): [AxisDim, AxisDim] {
  const byKey = (k: MatrixAxis) => dims.find((d) => d.key === k)!;
  const ok = (d: AxisDim) => d.values.length >= 2;
  const qual = AXIS_ORDER.map(byKey).filter(ok);

  let R = byKey(row ?? 'section');
  let C = byKey(col ?? 'product');
  if ((!ok(R) || !ok(C) || R.key === C.key) && qual.length >= 2) {
    R = qual[0];
    C = qual[1];
  }
  return [R, C];
}

/** v1 mtxCount 60-stage:77 — every card, archived included, matching both axis values. */
export function mtxCount(
  nb: Notebook,
  types: CardType[],
  R: AxisDim,
  C: AxisDim,
  rv: string,
  cv: string,
): number {
  let n = 0;
  for (const s of nb.sections) {
    for (const c of s.cards) {
      if (axisMatch(c, s.id, R.key, rv, types) && axisMatch(c, s.id, C.key, cv, types)) n++;
    }
  }
  return n;
}

/** v1 toggleCells 60-stage:50-55 — all-or-nothing gesture, pure. */
export function toggleCells(sel: string[], keys: string[]): string[] {
  const allOn = keys.length > 0 && keys.every((k) => sel.includes(k));
  if (allOn) return sel.filter((k) => !keys.includes(k));
  const out = [...sel];
  for (const k of keys) if (!out.includes(k)) out.push(k);
  return out;
}

/** v1 pruneCells 60-stage:73-74 — drop keys whose parts are no longer live on R/C. */
export function pruneCells(sel: string[], R: AxisDim, C: AxisDim): string[] {
  const rows = new Set(R.values.map((v) => v.id));
  const cols = new Set(C.values.map((v) => v.id));
  return sel.filter((k) => {
    const [rv, cv] = splitKey(k);
    return rows.has(rv) && cols.has(cv);
  });
}

/** v1 cardMatches 60-stage:75-76 — any selected cell matches both axes; empty = no filter. */
export function cardMatchesFilter(
  card: Card,
  sectionId: string,
  sel: string[],
  R: AxisDim,
  C: AxisDim,
  types: CardType[],
): boolean {
  if (sel.length === 0) return true;
  return sel.some((k) => {
    const [rv, cv] = splitKey(k);
    return axisMatch(card, sectionId, R.key, rv, types) && axisMatch(card, sectionId, C.key, cv, types);
  });
}
