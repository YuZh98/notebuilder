import type { Section, Card } from './types';

/** The six per-section services (v1 40-services.js:3-10), split into features and actions (D4). */
export type ServiceKey = 'pin' | 'shuffle' | 'flipAll' | 'reset' | 'search' | 'archive';

export type ServiceDef = { key: ServiceKey; label: string; icon: string };

/** Card-level features: opt-in behaviours that decorate cards rather than run once. */
export const SERVICE_FEATURES: readonly ServiceDef[] = [
  { key: 'pin', label: 'Pin', icon: '📌' },
  { key: 'search', label: 'Search', icon: '🔎' },
  { key: 'archive', label: 'Archive', icon: '🗄' },
];

/** Section-level actions: one-shot operations triggered from the study bar. */
export const SERVICE_ACTIONS: readonly ServiceDef[] = [
  { key: 'shuffle', label: 'Shuffle', icon: '🔀' },
  { key: 'flipAll', label: 'Flip all', icon: '⟳' },
  { key: 'reset', label: 'Reset', icon: '↺' },
];

/** Registry order (v1 40-services.js declaration order). */
export const SERVICE_ORDER: readonly ServiceKey[] = [
  'pin',
  'shuffle',
  'flipAll',
  'reset',
  'search',
  'archive',
];

/** Default study-bar sequence (v1 60-stage.js:150-154): search, archive, then the run actions. */
const BAR_ORDER: readonly ServiceKey[] = ['search', 'archive', 'shuffle', 'flipAll', 'reset'];

const svcRank = (order: string[], key: ServiceKey): number => (order.indexOf(key) + 1) || 99;

/**
 * Enabled study-bar items in display order (v1 60-stage.js:150-154). `pin` never appears in the
 * bar — it is a per-card toggle. A section's `svcOrder` reorders present items; keys it names that
 * are not enabled are ignored, and items it omits keep their default order at the tail.
 */
export function svcBarItems(section: Section): ServiceKey[] {
  const enabled = section.services ?? {};
  const items = BAR_ORDER.filter((k) => enabled[k]);
  const order = section.svcOrder;
  if (!order) return items;
  return [...items].sort((a, b) => svcRank(order, a) - svcRank(order, b));
}

/** Flip-all is offered only when some card actually has a flip face (v1 50-render.js:102). */
export function flipAllApplicable(section: Section): boolean {
  return section.cards.some((c) => c.verbs?.flip);
}

/**
 * Case-insensitive search match (v1 60-stage.js:159, adapted). v1 searched `name`/`content`
 * fields that v2 cards lack, so the haystack is the stringified slots, back face, and tags.
 * An empty query matches everything.
 */
export function cardMatchesSearch(card: Card, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = (
    JSON.stringify(card.slots) +
    JSON.stringify(card.back ?? []) +
    (card.tags ?? []).join(' ')
  ).toLowerCase();
  return hay.includes(needle);
}
