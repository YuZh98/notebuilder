// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { exportNotebook, importNotebook, validateNotebook, type NotebookJSON } from './json-io';
import { getSlot } from './slots/registry';
import { canonicalNotebook, genNotebook, resetSimIds, SLOT_TYPES } from './sim-notebook';
import { makeRng, SEEDS } from './sim-rng';
import type { Notebook } from './types';

/** Generated notebooks per property, per seed. */
const CASES = 25;

const wire = (j: NotebookJSON): NotebookJSON => JSON.parse(JSON.stringify(j)) as NotebookJSON;

const roundTrip = (nb: Notebook): Notebook => importNotebook(wire(exportNotebook(nb)));

describe.each(SEEDS)('json-io interchange simulation (seed %i)', (seed) => {
  it('round-trips every generated notebook through JSON unchanged', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r);
      expect(canonicalNotebook(roundTrip(nb)), `seed ${seed} case ${c}`).toEqual(canonicalNotebook(nb));
    }
  });

  it('reaches a fixed point after one round-trip', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const once = wire(exportNotebook(genNotebook(r)));
      const twice = wire(exportNotebook(importNotebook(once)));
      const thrice = wire(exportNotebook(importNotebook(twice)));
      expect(thrice, `seed ${seed} case ${c}`).toEqual(twice);
    }
  });

  it('regenerates a consistent identity spine on import', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = roundTrip(genNotebook(r));
      const where = `seed ${seed} case ${c}`;
      const ids = new Set<string>([nb.id]);
      nb.sections.forEach((s, si) => {
        expect(s.notebookId, `${where} section ${si}`).toBe(nb.id);
        expect(s.position, `${where} section ${si}`).toBe(si);
        expect(ids.has(s.id), `${where} duplicate section id`).toBe(false);
        ids.add(s.id);
        s.cards.forEach((card, ci) => {
          expect(card.sectionId, `${where} card ${si}/${ci}`).toBe(s.id);
          expect(card.position, `${where} card ${si}/${ci}`).toBe(ci);
          expect(ids.has(card.id), `${where} duplicate card id`).toBe(false);
          ids.add(card.id);
          for (const slot of [...card.slots, ...(card.back ?? [])]) {
            expect(ids.has(slot.id), `${where} duplicate slot id ${slot.id}`).toBe(false);
            ids.add(slot.id);
          }
        });
      });
    }
  });

  it('emits interchange JSON that validates without errors', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const json = wire(exportNotebook(genNotebook(r)));
      const { errors } = validateNotebook(json);
      expect(errors, `seed ${seed} case ${c}`).toEqual([]);
    }
  });

  it('generates only props their own slot type accepts', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r);
      for (const section of nb.sections) {
        for (const card of section.cards) {
          for (const slot of [...card.slots, ...(card.back ?? [])]) {
            const errors = getSlot(slot.type)!.validate?.(slot.props) ?? [];
            expect(errors, `seed ${seed} case ${c} slot ${slot.type}`).toEqual([]);
          }
        }
      }
    }
  });

  it('exports deterministically — same notebook, byte-identical JSON', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r);
      expect(JSON.stringify(exportNotebook(nb)), `seed ${seed} case ${c}`).toBe(
        JSON.stringify(exportNotebook(nb)),
      );
    }
  });

  it('preserves card and slot counts across the round trip', () => {
    resetSimIds();
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r);
      const rt = roundTrip(nb);
      const shape = (n: Notebook) =>
        n.sections.map((s) => s.cards.map((card) => [card.slots.length, card.back?.length ?? 0]));
      expect(shape(rt), `seed ${seed} case ${c}`).toEqual(shape(nb));
    }
  });
});

/** A minimal one-card interchange payload, for exercising the import gate directly. */
function cardJSON(slots: unknown[], back: unknown[]): NotebookJSON {
  return {
    version: 2,
    notebook: {
      name: 'gate',
      sections: [{ name: 'S', cards: [{ slots, ...(back.length > 0 && { back }) }] }],
    },
  } as NotebookJSON;
}

const KEYS = ['aa', 'ab', 'ac', 'ad', 'ba', 'bb'];

describe.each(SEEDS)('json-io import gate simulation (seed %i)', (seed) => {
  it('rejects every generated card-scope cycle as a hard error', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      // A ring of computes: slot i writes keys[i] and reads keys[i+1 mod k].
      const k = r.between(2, KEYS.length);
      const keys = r.shuffle(KEYS).slice(0, k);
      const slots = keys.map((out, i) => ({
        type: 'compute',
        props: { expr: `${keys[(i + 1) % k]} + 1`, out },
      }));
      // Both faces share one card scope, so a ring split across the flip must
      // still be caught, at any split point and in any slot order.
      const order = r.shuffle(slots);
      const split = r.int(order.length + 1);
      const { errors } = validateNotebook(cardJSON(order.slice(0, split), order.slice(split)));
      const where = `seed ${seed} case ${c} ring ${keys.join('->')} split ${split}`;
      expect(errors.filter((e) => e.includes('cycle detected')).length, where).toBeGreaterThan(0);
    }
  });

  it('downgrades a read with no writer to a warning, never an error', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const ghosts = r.sample(['zz', 'qq', 'yy'], r.between(1, 3));
      const slots = [
        { type: 'compute', props: { expr: ghosts.join(' + '), out: r.pick(KEYS) } },
        { type: 'text', props: { text: `body {{${ghosts[0]}}}` } },
      ];
      const { errors, warnings } = validateNotebook(cardJSON(r.shuffle(slots), []));
      const where = `seed ${seed} case ${c} ghosts ${ghosts.join(',')}`;
      expect(errors, where).toEqual([]);
      expect(warnings.filter((w) => w.includes('missing dependency')).length, where).toBe(ghosts.length);
    }
  });
});

/**
 * Guards the suite against a silently degenerate generator: if a future edit
 * stops emitting dividers, flip cards, or empty tag arrays, the properties
 * above would still pass while testing nothing.
 */
it('generates every structural feature the round-trip properties rely on', () => {
  resetSimIds();
  const seen = new Set<string>();
  for (const seed of SEEDS) {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const nb = genNotebook(r);
      if (nb.cats === undefined) seen.add('cats-absent');
      if (nb.cats?.length) seen.add('cats-present');
      if (nb.subtitle !== undefined) seen.add('nb-subtitle');
      if (nb.width !== undefined) seen.add('nb-width');
      for (const s of nb.sections) {
        if (s.kind === 'divider') seen.add('divider');
        if (s.folded !== undefined) seen.add('folded');
        if (s.services) seen.add('services');
        if (s.svcOrder) seen.add('svcOrder');
        if (s.svcW) seen.add('svcW');
        if (s.locked !== undefined) seen.add('locked');
        for (const card of s.cards) {
          if (card.verbs?.flip) seen.add('flip');
          if (card.verbs?.bare) seen.add('bare');
          if (card.back?.length) seen.add('back');
          if (card.tags?.length === 0) seen.add('tags-empty');
          if (card.tags?.length) seen.add('tags-nonempty');
          if (card.archived) seen.add('archived');
          if (card.accent !== undefined) seen.add('accent');
          seen.add(card.w !== undefined ? 'card-w' : 'card-w-absent');
          seen.add(card.typeId !== undefined ? 'typeId' : 'typeId-absent');
          for (const slot of [...card.slots, ...(card.back ?? [])]) {
            seen.add(`slot:${slot.type}`);
            if (slot.verbs?.reveal) seen.add('reveal');
            if (slot.verbs?.glow !== undefined) seen.add('glow');
            if (slot.verbs?.emphasis !== undefined) seen.add('emphasis');
            if (slot.verbs?.hint) seen.add('hint');
            if (slot.verbs?.sequential !== undefined) seen.add('sequential');
            if (slot.verbs?.locked !== undefined) seen.add('verb-locked');
            if (slot.fuse !== undefined) seen.add('fuse');
            if (slot.fuseW !== undefined) seen.add('fuseW');
          }
        }
      }
    }
  }
  const required = [
    'cats-absent', 'cats-present', 'nb-subtitle', 'nb-width',
    'divider', 'folded', 'services', 'svcOrder', 'svcW', 'locked',
    'flip', 'bare', 'back', 'tags-empty', 'tags-nonempty', 'archived', 'accent',
    'card-w', 'card-w-absent', 'typeId', 'typeId-absent',
    'reveal', 'glow', 'emphasis', 'hint', 'sequential', 'verb-locked', 'fuse', 'fuseW',
    ...SLOT_TYPES.map((t) => `slot:${t}`),
  ];
  expect(required.filter((k) => !seen.has(k))).toEqual([]);
});