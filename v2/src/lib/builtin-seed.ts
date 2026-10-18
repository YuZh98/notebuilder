import type { CardType } from './card-types';

/** Preference key: a JSON array of every built-in card type id ever seeded into this install. */
export const BUILTIN_SEEDED_PREF = 'builtin_seeded';

/**
 * The built-ins that shipped before seeding was tracked. Those installs seeded all of them on
 * first launch (the table was empty), so a missing one was deleted by its user, not never seeded.
 */
export const LEGACY_BUILTIN_IDS: readonly string[] = [
  'ct_flashcard', 'ct_quiz', 'ct_note', 'ct_tracker', 'ct_mastery',
  'ct_sliderlab', 'ct_gaussian', 'ct_payoff', 'ct_compound', 'ct_quizcard',
];

export type SeedPlan = {
  /** Built-ins to write to the card_types table now (independent copies), in catalog order. */
  toSeed: CardType[];
  /** The record to store under BUILTIN_SEEDED_PREF afterwards. */
  nextSeeded: string[];
};

/** The stored record's ids, or null when there is no usable record (absent or malformed). */
function parseSeeded(pref: string | null): string[] | null {
  if (pref === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(pref);
  } catch {
    return null;
  }
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((x): x is string => typeof x === 'string'))];
}

/**
 * Which built-in card types to seed at startup. Each built-in is seeded at most once per install,
 * ever: one the user deleted never comes back, while built-ins added in a later version still reach
 * existing users. Without a record, a brand-new install (empty table) seeds everything; an install
 * from before the record existed counts the legacy built-ins as already seeded. A built-in already
 * in the table is never rewritten (it may hold the user's edits) — only recorded. Pure.
 */
export function planBuiltinSeed(input: {
  existingIds: Iterable<string>;
  seededPref: string | null;
  builtins: readonly CardType[];
}): SeedPlan {
  const existing = new Set(input.existingIds);
  const recorded = parseSeeded(input.seededPref) ?? (existing.size === 0 ? [] : [...LEGACY_BUILTIN_IDS]);
  const seeded = new Set(recorded);
  const toSeed: CardType[] = [];
  const nextSeeded = [...recorded];
  for (const ct of input.builtins) {
    if (seeded.has(ct.id)) continue;
    seeded.add(ct.id);
    nextSeeded.push(ct.id);
    if (!existing.has(ct.id)) toSeed.push(structuredClone(ct));
  }
  return { toSeed, nextSeeded };
}
