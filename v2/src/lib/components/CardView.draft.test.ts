import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import CardView from './CardView.svelte';
import { mode } from '../stores/mode';
import type { Card } from '../types';

function cardOf(over: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    sectionId: 's1',
    position: 0,
    slots: [{ id: 'sl1', type: 'text', props: { text: 'AI wrote this' } }],
    ...over,
  };
}

function props(card: Card, over: Record<string, unknown> = {}) {
  return {
    card,
    surface: 'notebook' as 'bench' | 'notebook' | 'read',
    selected: false,
    state: {},
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
    onreviewed: vi.fn(),
    ...over,
  };
}

const chip = (c: HTMLElement) => c.querySelector('.draft-chip');

afterEach(() => {
  cleanup();
  mode.set('edit');
});

describe('CardView — AI draft chip', () => {
  it('shows a labelled Draft chip with a Reviewed button on a draft card in Edit mode', () => {
    const { container } = render(CardView, { props: props(cardOf({ draft: true })) });
    expect(chip(container)).not.toBeNull();
    expect(container.querySelector('.furn')).toHaveClass('draft');
    expect(screen.getByRole('group', { name: /draft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reviewed' })).toBeInTheDocument();
  });

  it('Reviewed calls onreviewed once — it neither selects nor mutates the card itself', async () => {
    const card = cardOf({ draft: true });
    const p = props(card);
    render(CardView, { props: p });
    await fireEvent.click(screen.getByRole('button', { name: 'Reviewed' }));
    expect(p.onreviewed).toHaveBeenCalledTimes(1);
    expect(p.onselect).not.toHaveBeenCalled();
    expect(card.draft).toBe(true);
  });

  it('is hidden in Study mode', () => {
    mode.set('study');
    const { container } = render(CardView, { props: props(cardOf({ draft: true })) });
    expect(chip(container)).toBeNull();
    expect(container.querySelector('.furn')).not.toHaveClass('draft');
  });

  it('is hidden when a preview forces Study', () => {
    const { container } = render(CardView, { props: props(cardOf({ draft: true }), { forceMode: 'study' }) });
    expect(chip(container)).toBeNull();
  });

  it('is hidden on a card that is not a draft', () => {
    const { container } = render(CardView, { props: props(cardOf()) });
    expect(chip(container)).toBeNull();
    expect(container.querySelector('.furn')).not.toHaveClass('draft');
  });

  it('is hidden without a review handler (the shared Reader passes none)', () => {
    const { container } = render(CardView, { props: props(cardOf({ draft: true }), { onreviewed: undefined }) });
    expect(chip(container)).toBeNull();
  });

  it('is hidden on a Factory bench', () => {
    const { container } = render(CardView, { props: props(cardOf({ draft: true }), { surface: 'bench' }) });
    expect(chip(container)).toBeNull();
  });

  it('still shows on a locked section card in Edit (read surface) so it can be reviewed', () => {
    const { container } = render(CardView, { props: props(cardOf({ draft: true }), { surface: 'read' }) });
    expect(chip(container)).not.toBeNull();
  });
});
