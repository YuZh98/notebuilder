import { benchToType, type Bench } from './bench.svelte';
import type { CardType, Variety } from './card-types';

/** The editable metadata captured in the Seal modal (v1 view.sealDraft). */
export type SealDraft = {
  name: string;
  note: string;
  icon: string;
  store: string | null;
  varieties: Variety[];
};

export type SealOutcome =
  | { kind: 'new'; type: CardType }
  | { kind: 'replace'; type: CardType };

/**
 * Prefill the draft from the bench, or from its source type when forked (v1 openSeal 80-actions:22).
 * A forked bench inherits the source's icon/store; its own varieties win over the source's.
 */
export function openSealDraft(b: Bench, existing: CardType | null): SealDraft {
  const varieties = b.varieties ?? existing?.varieties ?? [];
  return {
    name: b.name,
    note: b.note ?? '',
    store: existing ? (existing.store ?? null) : null,
    icon: existing ? (existing.icon ?? '') : (b.icon ?? ''),
    varieties: varieties.map((v) => ({ name: v.name, accent: v.accent })),
  };
}

function withDraft(ct: CardType, d: SealDraft): CardType {
  const out: CardType = { ...ct, name: d.name, store: d.store };
  if (d.note) out.note = d.note;
  else delete out.note;
  if (d.icon) out.icon = d.icon;
  else delete out.icon;
  if (d.varieties.length) out.varieties = d.varieties.map((v) => ({ name: v.name, accent: v.accent }));
  else delete out.varieties;
  return out;
}

/**
 * Seal a fresh product. D1: a colliding name returns `name-taken` instead of v1's silent `--2` rename.
 * The minted type keeps benchToType's fresh id.
 */
export function sealAsNew(b: Bench, d: SealDraft, taken: string[]): SealOutcome | { kind: 'name-taken' } {
  if (taken.includes(d.name)) return { kind: 'name-taken' };
  return { kind: 'new', type: withDraft(benchToType(b, d.name), d) };
}

/** Overwrite the source type in place: same id, fields from the draft (v1 sealConfirm 'replace'). */
export function sealReplace(b: Bench, d: SealDraft, existing: CardType): SealOutcome {
  return { kind: 'replace', type: { ...withDraft(benchToType(b, d.name), d), id: existing.id } };
}
