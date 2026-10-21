// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { notebookToRows, rowsToNotebook } from './db-map';
import { derivedTagUnion } from './tags';
import { genNotebook, resetSimIds } from './sim-notebook';
import { makeRng, SEEDS } from './sim-rng';
import type { Notebook } from './types';

/** Generated notebooks per property, per seed. */
const CASES = 25;

const roundTrip = (nb: Notebook): Notebook => {
  const { notebook, sections, cards } = notebookToRows(nb);
  return rowsToNotebook(notebook, sections, cards);
};

// Unlike interchange export, DB persistence is identity-preserving: ids, positions
// and local-only fields (folded) all survive. The one asymmetry is that loading
// always materialises cats (deriving them from card tags for pre-D26 blobs).
const dbExpected = (nb: Notebook): Notebook => {
  const expected = structuredClone(nb);
  expected.cats = expected.cats ?? derivedTagUnion(expected);
  return expected;
};

describe.each(SEEDS)('db-map row simulation (seed %i)', (seed) => {
  it('round-trips every generated notebook through rows exactly', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r);
      expect(roundTrip(nb), `seed ${seed} case ${c}`).toEqual(dbExpected(nb));
    }
  });

  it('rebuilds section and card order from positions, not row order', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r);
      const { notebook, sections, cards } = notebookToRows(nb);
      const rebuilt = rowsToNotebook(notebook, r.shuffle(sections), r.shuffle(cards));
      expect(rebuilt, `seed ${seed} case ${c}`).toEqual(dbExpected(nb));
    }
  });

  it('generates the shapes the round-trip property must cover', () => {
    resetSimIds();
    const r = makeRng(seed);
    const seen = new Set<string>();
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r);
      seen.add(nb.cats ? 'cats-present' : 'cats-absent');
      for (const s of nb.sections) {
        if (s.kind === 'divider') seen.add('divider');
        if (s.folded !== undefined) seen.add('folded');
        if (s.svcW) seen.add('svcW');
        for (const card of s.cards) {
          seen.add(card.typeId ? 'typed' : 'untyped');
          seen.add(card.w !== undefined ? 'w-present' : 'w-absent');
          if (card.archived !== undefined) seen.add('archived');
          if (card.back) seen.add('back');
        }
      }
    }
    const required = [
      'cats-present',
      'cats-absent',
      'divider',
      'folded',
      'svcW',
      'typed',
      'untyped',
      'w-present',
      'w-absent',
      'archived',
      'back',
    ];
    for (const shape of required) {
      expect(seen.has(shape), `seed ${seed} never generated ${shape}`).toBe(true);
    }
  });
});