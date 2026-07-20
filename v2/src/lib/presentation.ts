import { CARD_STATE_KEY } from './card-done';
import type { ReaderStateMap } from './db';

/**
 * Volatile presentation keys inside the CARD_STATE_KEY bucket (v1 30-state.js:199 PRES_KEYS).
 * v1's `_qord` (choice-option order) has no v2 analog — choice options don't shuffle
 * (staging decision 2) — so only the flip flag is volatile here. `seenBack` is progress
 * (v1 `_seen`), not presentation, and is deliberately preserved.
 */
export const PRES_STATE_KEYS: readonly string[] = ['flipped'];

function stripPresentationKeys(state: ReaderStateMap): ReaderStateMap {
  const next: ReaderStateMap = {};
  for (const cardId of Object.keys(state)) {
    const buckets = state[cardId];
    const cardBucket = buckets[CARD_STATE_KEY];
    if (!cardBucket) {
      next[cardId] = buckets;
      continue;
    }
    const kept: Record<string, unknown> = {};
    for (const key of Object.keys(cardBucket)) {
      if (!PRES_STATE_KEYS.includes(key)) kept[key] = cardBucket[key];
    }
    const nextBuckets = { ...buckets };
    if (Object.keys(kept).length > 0) nextBuckets[CARD_STATE_KEY] = kept;
    else delete nextBuckets[CARD_STATE_KEY];
    next[cardId] = nextBuckets;
  }
  return next;
}

/** Wipe volatile presentation state on Edit→Study entry (v1 resetPresentation). New map. */
export function resetPresentation(state: ReaderStateMap): ReaderStateMap {
  return stripPresentationKeys(state);
}

/** Strip volatile presentation state before persisting so flips never hit SQLite (v1 stripVol). New map. */
export function stripPresentation(state: ReaderStateMap): ReaderStateMap {
  return stripPresentationKeys(state);
}
