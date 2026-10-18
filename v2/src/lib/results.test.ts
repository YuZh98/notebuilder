import { describe, it, expect } from 'vitest';
import { buildResults, formatResultsText } from './results';
import { registerSlot } from './slots/registry';
import type { SlotType } from './slot-contract';
import { CARD_STATE_KEY } from './card-done';
import type { Card, Notebook, Section, Slot } from './types';

// A slot type registered only here: results must pick up ANY type implementing score(),
// not a hard-coded list, so types added later (e.g. a problem slot) count automatically.
registerSlot({
  type: 'test-graded',
  kind: 'interact',
  completable: false,
  create: () => ({}),
  variables: () => ({ reads: [], writes: [] }),
  score: (_p: Record<string, unknown>, state: Record<string, unknown> | undefined) =>
    state ? { correct: Number(state.right ?? 0), answered: Number(state.tried ?? 0) } : { correct: 0, answered: 0 },
  renderEdit: {} as never,
  renderStudy: {} as never,
} as SlotType);

const s = (id: string, type: string, props: Record<string, unknown> = {}): Slot => ({ id, type, props });
const q = (id: string, answer: number[] = [0]) => s(id, 'choice', { options: ['a', 'b'], answer });

function c(id: string, slots: Slot[], over: Partial<Card> = {}): Card {
  return { id, sectionId: 'x', position: 0, slots, ...over };
}
function sec(id: string, name: string, cards: Card[], over: Partial<Section> = {}): Section {
  return { id, notebookId: 'nb', name, position: 0, cards, ...over };
}

function deck(): Notebook {
  return {
    id: 'nb',
    name: 'Biology 101',
    createdAt: '',
    updatedAt: '',
    sections: [
      sec('s1', 'Cells', [
        c('c1', [q('q1')]),
        c('c2', [q('q2', [1])]),
        c('c3', [s('t3', 'text', { text: 'reading only' })]),
      ], { title: 'Cells & membranes' }),
      sec('d1', 'Chapter break', [], { kind: 'divider' }),
      sec('s2', 'Genetics', [
        c('c4', [s('ti4', 'text-input')]),
        c('c5', [q('q5', [])]), // ungraded: no answer key
        c('c6', [s('x6', 'text')], { verbs: { flip: true }, back: [q('qb6', [0])] }),
        c('c7', [q('q7')], { archived: true }),
        c('c8', [s('g8', 'test-graded')]),
      ]),
      sec('s3', 'Appendix', [c('c9', [s('t9', 'text')])]),
    ],
  };
}

const state = {
  c1: { q1: { selected: [0], submitted: true } }, // correct
  c2: { q2: { selected: [0], submitted: true } }, // wrong
  c4: { ti4: { value: 'DNA' } },
  c5: { q5: { selected: [1], submitted: true } },
  c6: { qb6: { selected: [0], submitted: true }, [CARD_STATE_KEY]: { seenBack: true, flipped: true } },
  c7: { q7: { selected: [0], submitted: true } }, // archived but answered
  c8: { g8: { right: 2, tried: 3 } },
};

const NOW = new Date('2026-10-18T09:30:00.000Z');

describe('buildResults', () => {
  it('stamps identity: notebook name, docId, time, optional trimmed student', () => {
    const r = buildResults(deck(), state, { docId: 'nb_author', student: '  Ada  ', now: NOW });
    expect(r.notebook).toBe('Biology 101');
    expect(r.docId).toBe('nb_author');
    expect(r.generatedAt).toBe('2026-10-18T09:30:00.000Z');
    expect(r.student).toBe('Ada');
    expect(buildResults(deck(), state, { docId: 'x', student: '   ', now: NOW }).student).toBeUndefined();
    expect('student' in buildResults(deck(), state, { docId: 'x', now: NOW })).toBe(false);
  });

  it('overall matches the in-app progress bar (archived and nothing-to-do cards excluded)', () => {
    const r = buildResults(deck(), state, { docId: 'x', now: NOW });
    // counted: c1 c2 c4 c5 c6 (c3/c9 text-only, c7 archived, c8 non-completable) → all five done
    expect(r.overall).toEqual({ done: 5, total: 5, pct: 100 });
    const empty = buildResults(deck(), {}, { docId: 'x', now: NOW });
    expect(empty.overall).toEqual({ done: 0, total: 5, pct: 0 });
  });

  it('lists each card section with something to finish, skipping dividers', () => {
    const r = buildResults(deck(), { c1: state.c1 }, { docId: 'x', now: NOW });
    expect(r.perSection).toEqual([
      { name: 'Cells', title: 'Cells & membranes', done: 1, total: 2 },
      { name: 'Genetics', done: 0, total: 3 },
    ]);
  });

  it('aggregates graded results over every slot with score(), including back faces and archived cards', () => {
    const r = buildResults(deck(), state, { docId: 'x', now: NOW });
    // choice: c1 ✓, c2 ✗, c6-back ✓, c7 ✓ (q5 ungraded) ; test-graded: 2/3
    expect(r.byType.choice).toEqual({ correct: 3, answered: 4, items: 4 });
    expect(r.byType['test-graded']).toEqual({ correct: 2, answered: 3, items: 1 });
    expect(r.graded).toEqual({ correct: 5, answered: 7, items: 5 });
  });

  it('counts unanswered graded questions as items but not as answered', () => {
    const r = buildResults(deck(), {}, { docId: 'x', now: NOW });
    expect(r.byType.choice).toEqual({ correct: 0, answered: 0, items: 4 });
  });

  it('never throws on a slot whose score() throws or returns junk', () => {
    registerSlot({
      type: 'test-broken',
      kind: 'interact',
      completable: false,
      create: () => ({}),
      variables: () => ({ reads: [], writes: [] }),
      score: () => {
        throw new Error('boom');
      },
      renderEdit: {} as never,
      renderStudy: {} as never,
    } as SlotType);
    registerSlot({
      type: 'test-junk',
      kind: 'interact',
      completable: false,
      create: () => ({}),
      variables: () => ({ reads: [], writes: [] }),
      score: () => ({ correct: NaN, answered: -1 }),
      renderEdit: {} as never,
      renderStudy: {} as never,
    } as SlotType);
    const nb = deck();
    nb.sections[0].cards.push(c('cx', [s('bx', 'test-broken'), s('jx', 'test-junk')]));
    const r = buildResults(nb, state, { docId: 'x', now: NOW });
    expect(r.byType['test-broken']).toBeUndefined();
    expect(r.byType['test-junk']).toBeUndefined();
    expect(r.graded.items).toBe(5);
  });
});

describe('formatResultsText', () => {
  it('renders a plain-text summary a teacher can read pasted into a message', () => {
    const text = formatResultsText(buildResults(deck(), state, { docId: 'nb_author', student: 'Ada', now: NOW }));
    expect(text).toContain('Biology 101');
    expect(text).toContain('Student: Ada');
    expect(text).toContain('2026-10-18T09:30:00.000Z');
    expect(text).toContain('Progress: 5 of 5 cards done (100%)');
    expect(text).toContain('Graded: 5 of 7 answered correct (71%)');
    expect(text).toContain('Cells & membranes: 2/2');
    expect(text).toContain('Genetics: 3/3');
    expect(text).toContain('choice: 3 of 4 answered correct');
    expect(text).toContain('nb_author');
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('omits the student line when unnamed and says when nothing is auto-graded', () => {
    const nb: Notebook = { id: 'n', name: 'Plain', createdAt: '', updatedAt: '', sections: [sec('s', 'S', [c('a', [s('t', 'text-input')])])] };
    const text = formatResultsText(buildResults(nb, {}, { docId: 'n', now: NOW }));
    expect(text).not.toContain('Student:');
    expect(text).toContain('Progress: 0 of 1 cards done (0%)');
    expect(text).toContain('Graded: no auto-graded questions');
  });
});
