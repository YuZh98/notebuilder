import { describe, it, expect } from 'vitest';
import {
  studyCards,
  stepFocus,
  isFlipCapable,
  studyKeyEffect,
  studySurfaces,
  NO_SURFACES,
} from './study-keys';
import { CARD_STATE_KEY } from './card-done';
import type { SectionView } from './visible-cards';
import type { Card, Notebook, Section, Slot } from './types';
import type { Scope } from './variable-graph';

const OPEN: SectionView = { search: '', showArch: false, shuffle: null, collapsed: false };
/** Focus order with no filters, search, shuffle or collapse in play. */
const order = (nb: Notebook, view: (s: { id: string }) => SectionView = () => OPEN) =>
  studyCards(nb, view, null);

function card(id: string, over: Partial<Card> = {}): Card {
  return { id, sectionId: 's1', position: 0, slots: [], ...over };
}

function section(id: string, cards: Card[], over: Partial<Section> = {}): Section {
  return { id, notebookId: 'nb1', name: id, position: 0, cards, ...over };
}

function notebook(sections: Section[]): Notebook {
  return {
    id: 'nb1',
    name: 'nb',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections,
  };
}

const choice = (id: string, props: Record<string, unknown>): Slot => ({ id, type: 'choice', props });
const list = (id: string, props: Record<string, unknown>): Slot => ({ id, type: 'list', props });
const text = (id: string, body = 'hello'): Slot => ({ id, type: 'text', props: { text: body } });
const FLIPPED = { [CARD_STATE_KEY]: { flipped: true } };

describe('studyCards — focus order is the render order', () => {
  it('is document order across non-divider sections', () => {
    const nb = notebook([
      section('s1', [card('a'), card('b')]),
      section('s2', [card('c')]),
    ]);
    expect(order(nb)).toEqual(['a', 'b', 'c']);
  });

  it('skips divider sections (they hold no cards) and archived cards', () => {
    const nb = notebook([
      section('d1', [card('ghost')], { kind: 'divider' }),
      section('s1', [card('a'), card('b', { archived: true }), card('c')]),
    ]);
    expect(order(nb)).toEqual(['a', 'c']);
  });

  it('is empty for a notebook with no live cards', () => {
    expect(order(notebook([section('s1', [])]))).toEqual([]);
  });

  it('follows the shuffle order the grid is rendering', () => {
    const nb = notebook([section('s1', [card('a'), card('b'), card('c')])]);
    expect(order(nb, () => ({ ...OPEN, shuffle: ['c', 'a', 'b'] }))).toEqual(['c', 'a', 'b']);
  });

  it('drops cards the section search has filtered out', () => {
    const nb = notebook([
      section('s1', [
        card('a', { slots: [{ id: 'a1', type: 'text', props: { text: 'alpha' } }] }),
        card('b', { slots: [{ id: 'b1', type: 'text', props: { text: 'beta' } }] }),
      ]),
    ]);
    expect(order(nb, () => ({ ...OPEN, search: 'beta' }))).toEqual(['b']);
  });

  it('reaches archived cards — and only those — while the archive view is on', () => {
    const nb = notebook([section('s1', [card('a'), card('b', { archived: true })])]);
    expect(order(nb, () => ({ ...OPEN, showArch: true }))).toEqual(['b']);
  });

  it('skips a collapsed section entirely', () => {
    const nb = notebook([section('s1', [card('a')]), section('s2', [card('b')])]);
    const view = (s: { id: string }) => ({ ...OPEN, collapsed: s.id === 's1' });
    expect(order(nb, view)).toEqual(['b']);
  });

  it('skips the sections a folded chapter divider hides', () => {
    const nb = notebook([
      section('d1', [], { kind: 'divider', folded: true }),
      section('s1', [card('a')]),
      section('d2', [], { kind: 'divider' }),
      section('s2', [card('b')]),
    ]);
    expect(order(nb)).toEqual(['b']);
  });

  it('honours the coverage-matrix filter', () => {
    const nb = notebook([section('s1', [card('a'), card('b')])]);
    expect(studyCards(nb, () => OPEN, new Set(['b']))).toEqual(['b']);
  });
});

describe('studySurfaces — which keys the focused card can answer', () => {
  it('reports nothing for no card', () => {
    expect(studySurfaces(null, {})).toEqual(NO_SURFACES);
  });

  it('reports the flip verb', () => {
    expect(studySurfaces(card('a', { verbs: { flip: true } }), {}).flip).toBe(true);
    expect(studySurfaces(card('a'), {}).flip).toBe(false);
  });

  it('reports the open choice slot’s option count, and 0 once it is submitted', () => {
    const c = card('a', { slots: [choice('q1', { options: ['x', 'y', 'z'] })] });
    expect(studySurfaces(c, {}).choiceOptions).toBe(3);
    expect(studySurfaces(c, { q1: { submitted: true } }).choiceOptions).toBe(0);
  });

  it('reports submittability only with a selection in hand', () => {
    const c = card('a', { slots: [choice('q1', { options: ['x', 'y'] })] });
    expect(studySurfaces(c, {}).canSubmit).toBe(false);
    expect(studySurfaces(c, { q1: { selected: [0] } }).canSubmit).toBe(true);
    expect(studySurfaces(c, { q1: { selected: [0], submitted: true } }).canSubmit).toBe(false);
  });

  it('reports a tickable list until every item is checked', () => {
    const c = card('a', { slots: [list('l1', { items: ['one', 'two'], style: 'check' })] });
    expect(studySurfaces(c, {}).canTick).toBe(true);
    expect(studySurfaces(c, { l1: { checked: [true, false] } }).canTick).toBe(true);
    expect(studySurfaces(c, { l1: { checked: [true, true] } }).canTick).toBe(false);
    const bullets = card('a', { slots: [list('l1', { items: ['one'], style: 'bullets' })] });
    expect(studySurfaces(bullets, {}).canTick).toBe(false);
  });

  it('agrees with studyKeyEffect: no surface means no effect, and vice versa', () => {
    const gated = { reveal: { key: 'show', op: '==' as const, val: true } };
    const cards = [
      card('a'),
      card('a', { verbs: { flip: true } }),
      card('a', { slots: [choice('q1', { options: ['x', 'y'] })] }),
      card('a', { slots: [list('l1', { items: ['one'], style: 'check' })] }),
      card('a', {
        verbs: { flip: true },
        slots: [text('t')],
        back: [choice('q1', { options: ['x', 'y'] }), list('l1', { items: ['one'], style: 'check' })],
      }),
      card('a', {
        slots: [
          { ...choice('q1', { options: ['x', 'y'] }), verbs: gated },
          { ...list('l1', { items: ['one'], style: 'check' }), verbs: gated },
        ],
      }),
    ];
    const states: Record<string, Record<string, unknown>>[] = [
      {},
      { q1: { selected: [1] } },
      { l1: { checked: [true] } },
      { ...FLIPPED, q1: { selected: [1] } },
    ];
    for (const c of cards) {
      for (const st of states) {
        for (const live of [{}, { show: true }] as Scope[]) {
          const s = studySurfaces(c, st, live);
          expect(!!studyKeyEffect('f', c, st, live)).toBe(s.flip);
          expect(!!studyKeyEffect('Enter', c, st, live)).toBe(s.canSubmit);
          expect(!!studyKeyEffect('x', c, st, live)).toBe(s.canTick);
          expect(!!studyKeyEffect('1', c, st, live)).toBe(s.choiceOptions >= 1);
        }
      }
    }
  });
});

describe('stepFocus', () => {
  const order = ['a', 'b', 'c'];

  it('starts the session on the first card whichever way you step', () => {
    expect(stepFocus(order, null, 1)).toBe('a');
    expect(stepFocus(order, null, -1)).toBe('a');
  });

  it('moves forward and back', () => {
    expect(stepFocus(order, 'a', 1)).toBe('b');
    expect(stepFocus(order, 'c', -1)).toBe('b');
  });

  it('clamps at both ends', () => {
    expect(stepFocus(order, 'c', 1)).toBe('c');
    expect(stepFocus(order, 'a', -1)).toBe('a');
  });

  it('recovers to the first card when the focused card is gone (archived, deleted)', () => {
    expect(stepFocus(order, 'zz', 1)).toBe('a');
  });

  it('returns null when there is nothing to focus', () => {
    expect(stepFocus([], null, 1)).toBeNull();
    expect(stepFocus([], 'a', -1)).toBeNull();
  });
});

describe('isFlipCapable', () => {
  it('is true only for a card with the flip verb', () => {
    expect(isFlipCapable(card('a', { verbs: { flip: true } }))).toBe(true);
    expect(isFlipCapable(card('a', { verbs: { bare: true } }))).toBe(false);
    expect(isFlipCapable(card('a'))).toBe(false);
    expect(isFlipCapable(null)).toBe(false);
  });
});

describe('studyKeyEffect — flip (space / f)', () => {
  const flipCard = card('a', { verbs: { flip: true }, slots: [], back: [] });

  it('flips and records seenBack, from either key', () => {
    for (const key of [' ', 'f']) {
      expect(studyKeyEffect(key, flipCard, {})).toEqual({
        slotId: CARD_STATE_KEY,
        next: { flipped: true, seenBack: true },
      });
    }
  });

  it('flips back but keeps seenBack (the back was seen once)', () => {
    const states = { [CARD_STATE_KEY]: { flipped: true, seenBack: true } };
    expect(studyKeyEffect('f', flipCard, states)).toEqual({
      slotId: CARD_STATE_KEY,
      next: { flipped: false, seenBack: true },
    });
  });

  it('preserves other card-level flags', () => {
    const states = { [CARD_STATE_KEY]: { other: 7 } };
    expect(studyKeyEffect('f', flipCard, states)?.next).toEqual({
      other: 7,
      flipped: true,
      seenBack: true,
    });
  });

  it('is null on a card that cannot flip', () => {
    expect(studyKeyEffect('f', card('a'), {})).toBeNull();
    expect(studyKeyEffect(' ', card('a'), {})).toBeNull();
  });
});

describe('studyKeyEffect — choice digits', () => {
  const single = card('a', { slots: [choice('q1', { options: ['x', 'y', 'z'] })] });
  const multi = card('a', { slots: [choice('q1', { options: ['x', 'y', 'z'], multi: true })] });

  it('single-select replaces the selection', () => {
    expect(studyKeyEffect('2', single, {})).toEqual({ slotId: 'q1', next: { selected: [1] } });
    expect(studyKeyEffect('3', single, { q1: { selected: [0] } })).toEqual({
      slotId: 'q1',
      next: { selected: [2] },
    });
  });

  it('multi-select accumulates and toggles off', () => {
    expect(studyKeyEffect('1', multi, { q1: { selected: [2] } })).toEqual({
      slotId: 'q1',
      next: { selected: [2, 0] },
    });
    expect(studyKeyEffect('1', multi, { q1: { selected: [0, 2] } })).toEqual({
      slotId: 'q1',
      next: { selected: [2] },
    });
  });

  it('ignores a digit past the last option', () => {
    expect(studyKeyEffect('4', single, {})).toBeNull();
  });

  it('skips a submitted slot and answers the next open one', () => {
    const two = card('a', {
      slots: [choice('q1', { options: ['x', 'y'] }), choice('q2', { options: ['p', 'q'] })],
    });
    expect(studyKeyEffect('1', two, { q1: { selected: [0], submitted: true } })).toEqual({
      slotId: 'q2',
      next: { selected: [0] },
    });
  });

  it('reaches a choice slot on the back face once the card is flipped', () => {
    const flip = card('a', {
      verbs: { flip: true },
      slots: [],
      back: [choice('qb', { options: ['x', 'y'] })],
    });
    expect(studyKeyEffect('2', flip, FLIPPED)).toEqual({ slotId: 'qb', next: { selected: [1] } });
  });

  it('is null on a card with no open choice slot', () => {
    expect(studyKeyEffect('1', card('a'), {})).toBeNull();
    expect(studyKeyEffect('1', single, { q1: { submitted: true } })).toBeNull();
  });
});

describe('studyKeyEffect — Enter submits', () => {
  const c = card('a', { slots: [choice('q1', { options: ['x', 'y'] })] });

  it('submits the first answered, unsubmitted slot, keeping the selection', () => {
    expect(studyKeyEffect('Enter', c, { q1: { selected: [1] } })).toEqual({
      slotId: 'q1',
      next: { selected: [1], submitted: true },
    });
  });

  it('does nothing with no selection (matches the disabled Submit button)', () => {
    expect(studyKeyEffect('Enter', c, {})).toBeNull();
    expect(studyKeyEffect('Enter', c, { q1: { selected: [] } })).toBeNull();
  });

  it('does nothing once submitted', () => {
    expect(studyKeyEffect('Enter', c, { q1: { selected: [0], submitted: true } })).toBeNull();
  });

  it('stays on the digit’s slot rather than reaching past it to an answered later one', () => {
    const two = card('a', {
      slots: [choice('q1', { options: ['x', 'y'] }), choice('q2', { options: ['p', 'q'] })],
    });
    expect(studyKeyEffect('Enter', two, { q2: { selected: [0] } })).toBeNull();
    expect(studyKeyEffect('Enter', two, { q1: { selected: [0] }, q2: { selected: [0] } })?.slotId)
      .toBe('q1');
  });
});

describe('studyKeyEffect — x ticks a checklist', () => {
  const c = card('a', { slots: [list('l1', { items: ['one', 'two'], style: 'check' })] });

  it('ticks the first unchecked item, seeding the array when absent', () => {
    expect(studyKeyEffect('x', c, {})).toEqual({ slotId: 'l1', next: { checked: [true, false] } });
    expect(studyKeyEffect('x', c, { l1: { checked: [true, false] } })).toEqual({
      slotId: 'l1',
      next: { checked: [true, true] },
    });
  });

  it('ignores bullet and numbered lists', () => {
    const bullets = card('a', { slots: [list('l1', { items: ['one'], style: 'bullets' })] });
    expect(studyKeyEffect('x', bullets, {})).toBeNull();
  });

  it('moves on to the next checklist once one is complete', () => {
    const two = card('a', {
      slots: [
        list('l1', { items: ['one'], style: 'check' }),
        list('l2', { items: ['two'], style: 'check' }),
      ],
    });
    expect(studyKeyEffect('x', two, { l1: { checked: [true] } })).toEqual({
      slotId: 'l2',
      next: { checked: [true] },
    });
  });

  it('is null when every checklist is complete, or there is none', () => {
    expect(studyKeyEffect('x', c, { l1: { checked: [true, true] } })).toBeNull();
    expect(studyKeyEffect('x', card('a'), {})).toBeNull();
  });

  it('is null for an empty check list (nothing to tick)', () => {
    const empty = card('a', { slots: [list('l1', { items: [], style: 'check' })] });
    expect(studyKeyEffect('x', empty, {})).toBeNull();
  });
});

describe('study keys answer only the face the reader can see', () => {
  // Shaped like the builtin ct_quizcard: the prompt is on the front, the choice on the back.
  const quiz = card('a', {
    verbs: { flip: true },
    slots: [text('front', 'What is 2 + 2?')],
    back: [choice('qb', { options: ['3', '4'] })],
  });

  it('front-up, the back choice is invisible to the digits, to Enter and to the surfaces', () => {
    expect(studySurfaces(quiz, {}).choiceOptions).toBe(0);
    expect(studyKeyEffect('1', quiz, {})).toBeNull();
    expect(studySurfaces(quiz, { qb: { selected: [0] } }).canSubmit).toBe(false);
    expect(studyKeyEffect('Enter', quiz, { qb: { selected: [0] } })).toBeNull();
  });

  it('flipped, the back choice answers', () => {
    expect(studySurfaces(quiz, FLIPPED).choiceOptions).toBe(2);
    expect(studyKeyEffect('2', quiz, FLIPPED)).toEqual({ slotId: 'qb', next: { selected: [1] } });
  });

  it('a front choice stops answering once the card is flipped away from it', () => {
    const c = card('a', {
      verbs: { flip: true },
      slots: [choice('qf', { options: ['x', 'y'] })],
      back: [text('b', 'answer')],
    });
    expect(studySurfaces(c, {}).choiceOptions).toBe(2);
    expect(studySurfaces(c, FLIPPED).choiceOptions).toBe(0);
    expect(studyKeyEffect('1', c, FLIPPED)).toBeNull();
  });

  it('a card without the flip verb never answers through a stray back face', () => {
    const c = card('a', { slots: [text('t')], back: [choice('qb', { options: ['x'] })] });
    expect(studySurfaces(c, {}).choiceOptions).toBe(0);
    expect(studyKeyEffect('1', c, {})).toBeNull();
  });

  it('x ticks only the shown face’s checklist', () => {
    const c = card('a', {
      verbs: { flip: true },
      slots: [text('t')],
      back: [list('lb', { items: ['one'], style: 'check' })],
    });
    expect(studySurfaces(c, {}).canTick).toBe(false);
    expect(studyKeyEffect('x', c, {})).toBeNull();
    expect(studySurfaces(c, FLIPPED).canTick).toBe(true);
    expect(studyKeyEffect('x', c, FLIPPED)?.slotId).toBe('lb');
  });
});

describe('study keys respect the verb gates the click path applies', () => {
  const reveal = { key: 'show', op: '==' as const, val: true };
  const revealCard = card('a', {
    slots: [{ ...choice('q1', { options: ['x', 'y'] }), verbs: { reveal } }],
  });
  const afterList = (verbs: Slot['verbs']) =>
    card('a', {
      slots: [
        list('l1', { items: ['one'], style: 'check' }),
        { ...choice('q2', { options: ['p', 'q'] }), verbs },
      ],
    });

  it('a reveal-gated choice is unreachable while its condition is unmet', () => {
    expect(studySurfaces(revealCard, {}).choiceOptions).toBe(0);
    expect(studyKeyEffect('1', revealCard, {})).toBeNull();
    expect(studySurfaces(revealCard, { q1: { selected: [0] } }).canSubmit).toBe(false);
    expect(studyKeyEffect('Enter', revealCard, { q1: { selected: [0] } })).toBeNull();
  });

  it('the same choice answers once the live scope satisfies the reveal', () => {
    expect(studySurfaces(revealCard, {}, { show: true }).choiceOptions).toBe(2);
    expect(studyKeyEffect('1', revealCard, {}, { show: true })).toEqual({
      slotId: 'q1',
      next: { selected: [0] },
    });
  });

  it('a sequential choice waits for its prior slots, exactly as the rendered face does', () => {
    const c = afterList({ sequential: true });
    expect(studySurfaces(c, {}).choiceOptions).toBe(0);
    expect(studyKeyEffect('1', c, {})).toBeNull();
    expect(studyKeyEffect('1', c, { l1: { checked: [true] } })?.slotId).toBe('q2');
  });

  it('a locked choice is answerable only once it is unlocked', () => {
    const c = afterList({ locked: true });
    expect(studySurfaces(c, {}).choiceOptions).toBe(0);
    expect(studyKeyEffect('1', c, {})).toBeNull();
    expect(studyKeyEffect('1', c, { l1: { checked: [true] } })?.slotId).toBe('q2');
  });

  it('x skips a checklist the reader cannot see', () => {
    const c = card('a', {
      slots: [{ ...list('l1', { items: ['one'], style: 'check' }), verbs: { reveal } }],
    });
    expect(studySurfaces(c, {}).canTick).toBe(false);
    expect(studyKeyEffect('x', c, {})).toBeNull();
    expect(studyKeyEffect('x', c, {}, { show: true })?.slotId).toBe('l1');
  });
});

describe('digits and Enter address one and the same choice slot', () => {
  const two = card('a', {
    slots: [choice('q1', { options: ['x', 'y'] }), choice('q2', { options: ['p', 'q'] })],
  });

  it('Enter never submits a slot the digits do not address', () => {
    const states = { q2: { selected: [0] } };
    expect(studyKeyEffect('1', two, states)?.slotId).toBe('q1');
    expect(studyKeyEffect('Enter', two, states)).toBeNull();
    expect(studySurfaces(two, states).canSubmit).toBe(false);
  });

  it('answer-then-submit walks the card one choice at a time', () => {
    let states: Record<string, Record<string, unknown>> = {};
    const apply = (key: string) => {
      const effect = studyKeyEffect(key, two, states);
      if (effect) states = { ...states, [effect.slotId]: effect.next };
      return effect;
    };
    apply('1');
    apply('Enter');
    expect(states.q1).toEqual({ selected: [0], submitted: true });
    apply('2');
    apply('Enter');
    expect(states.q2).toEqual({ selected: [1], submitted: true });
    expect(apply('Enter')).toBeNull();
  });
});

describe('studyKeyEffect — unbound keys', () => {
  it('returns null', () => {
    const c = card('a', {
      verbs: { flip: true },
      slots: [choice('q1', { options: ['x'] }), list('l1', { items: ['i'], style: 'check' })],
    });
    for (const key of ['0', 'j', 'k', 'q', 'Escape', 'ArrowRight', '?']) {
      expect(studyKeyEffect(key, c, {}), key).toBeNull();
    }
  });
});
