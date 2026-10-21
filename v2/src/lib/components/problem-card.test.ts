import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import CardView from './CardView.svelte';
import { mode } from '../stores/mode';
import { isCardDone, hasCompletableSlot } from '../card-done';
import { drawValues, DEFAULT_SEED, type ProblemProps } from '../slots/problem';
import type { Card } from '../types';

// These tests pin the numbers at DEFAULT_SEED: the start where no practice salt can be stored.
// Per-reader starting seeds are covered by ProblemStudy.salt.test.ts.
vi.mock('../practice-salt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../practice-salt')>()),
  practiceSalt: () => null,
}));

// End-to-end through CardView: the problem slot reads a card variable (a slider) and writes
// its reader state through the same progress channel every completable slot uses.
const problem: ProblemProps = {
  prompt: '{{a}} crates of {{k}} — how many?',
  params: [{ name: 'a', min: 2, max: 9, step: 1 }],
  answer: 'a*k',
  tol: 0,
  need: 2,
};

function card(): Card {
  return {
    id: 'c1',
    sectionId: 's1',
    position: 0,
    slots: [
      { id: 'sl1', type: 'slider', props: { key: 'k', value: 12, min: 1, max: 20, step: 1 } },
      { id: 'p1', type: 'problem', props: problem as unknown as Record<string, unknown> },
    ],
  };
}

function props(state: Record<string, Record<string, unknown>> = {}) {
  return {
    card: card(),
    surface: 'read' as const,
    selected: false,
    state,
    notes: [],
    notesOpen: false,
    onselect: vi.fn(),
    onstate: vi.fn(),
    onmove: vi.fn(),
    ondelete: vi.fn(),
    onverb: vi.fn(),
    ontags: vi.fn(),
    onsavetype: vi.fn(),
    onupdateslot: vi.fn(),
    ondeleteslot: vi.fn(),
    onaddslot: vi.fn(),
    progresscompletion: vi.fn(() => ({ done: 0, total: 0, pct: 0 })),
    ontogglenotes: vi.fn(),
    onaddnote: vi.fn(),
    ondeletenote: vi.fn(),
    ongrip: vi.fn(),
    onresize: vi.fn(),
    onfusew: vi.fn(),
    onpin: vi.fn(),
    onarchive: vi.fn(),
  };
}

afterEach(() => {
  mode.set('edit');
});

describe('problem slot inside a card', () => {
  const { a } = drawValues(problem.params, DEFAULT_SEED);

  it('renders with the card variable in scope and writes progress state keyed by slot id', async () => {
    mode.set('study');
    const p = props();
    const { container } = render(CardView, { props: p });
    expect(container.querySelector('.problem-prompt')?.textContent).toContain(`${a} crates of 12`);
    expect(p.onstate).not.toHaveBeenCalled();

    await fireEvent.input(screen.getByLabelText('Your answer'), { target: { value: String(a * 12) } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await tick();
    expect(p.onstate).toHaveBeenCalledWith('p1', {
      seed: DEFAULT_SEED,
      correct: 1,
      attempts: 1,
      last: { input: String(a * 12), ok: true },
    });
    // the document is untouched
    expect(p.card.slots[1].props).toEqual(problem);
  });

  it('counts toward card completion only after `need` correct answers', () => {
    const c = card();
    expect(hasCompletableSlot(c)).toBe(true);
    expect(isCardDone(c, {})).toBe(false);
    expect(isCardDone(c, { p1: { correct: 1, attempts: 1 } })).toBe(false);
    expect(isCardDone(c, { p1: { correct: 2, attempts: 3 } })).toBe(true);
  });

  it('shows the dice icon in the bench chrome', () => {
    mode.set('edit');
    const { container } = render(CardView, { props: { ...props(), surface: 'bench' as const } });
    const heads = [...container.querySelectorAll('.bs-head')].map((h) => h.textContent ?? '');
    expect(heads.some((t) => t.includes('🎲') && t.includes('problem'))).toBe(true);
  });
});
