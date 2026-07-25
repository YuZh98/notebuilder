/**
 * Keyboard-first Study, end to end: the window key handler → the pure modules → reader state,
 * in the app and in the exported Reader. The dispatcher and the effect rules are unit-tested in
 * keyboard.test.ts / study-keys.test.ts; these tests prove the wiring on both surfaces.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../App.svelte';
import Reader from './Reader.svelte';
import { mode } from '../stores/mode';
import { place } from '../stores/place';
import { session, resetSession } from '../session.svelte';
import type { Notebook } from '../types';

beforeAll(() => {
  // jsdom implements no layout, so the cursor's scrollIntoView needs a stub.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  mode.set('edit');
  place.set('house');
  resetSession();
});

async function press(key: string, mods: Record<string, boolean> = {}) {
  await fireEvent.keyDown(window, { key, ...mods });
  await tick();
}

/** Press a key as if the reader had tab-focused an element (a card button, say). */
async function pressOn(target: Element, key: string) {
  await fireEvent.keyDown(target, { key, bubbles: true });
  await tick();
}

const focused = (container: HTMLElement) =>
  container.querySelector('.furn.kfocus')?.getAttribute('data-card') ?? null;

describe('App — the study cursor', () => {
  it('j starts on the first card, j/k walk it, Escape clears it', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();

    expect(focused(container)).toBeNull();

    await press('j');
    expect(focused(container)).toBe('card_1');

    await press('ArrowRight');
    expect(focused(container)).toBe('card_2');

    await press('k');
    expect(focused(container)).toBe('card_1');

    // clamped at the top — k on the first card stays put
    await press('k');
    expect(focused(container)).toBe('card_1');

    await press('Escape');
    expect(focused(container)).toBeNull();
  });

  it('draws no ring in Edit mode, and drops the cursor when the mode flips', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();
    await press('j');
    expect(focused(container)).toBe('card_1');

    mode.set('edit');
    await tick();
    expect(focused(container)).toBeNull();

    // Edit mode has no cursor at all: j is an unbound key there.
    await press('j');
    expect(focused(container)).toBeNull();
  });

  it('space flips the focused flip card and leaves its neighbours alone', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();

    // card_4 is the demo flashcard (verbs.flip); walk the cursor onto it.
    for (let i = 0; i < 4; i++) await press('j');
    expect(focused(container)).toBe('card_4');

    const flipCard = () => container.querySelector('.furn[data-card="card_4"] .fc');
    expect(flipCard()?.classList.contains('flipped')).toBe(false);

    await press(' ');
    expect(flipCard()?.classList.contains('flipped')).toBe(true);

    await press('f');
    expect(flipCard()?.classList.contains('flipped')).toBe(false);
  });

  it('shows the passive hint in Study only', async () => {
    const { container } = render(App);
    await tick();
    expect(container.querySelector('.kb-hint')).toBeNull();

    mode.set('study');
    await tick();
    expect(container.querySelector('.kb-hint')?.textContent).toContain('? help');
  });

  it('? opens the shortcut overlay; ? and Escape close it in turn, before the cursor', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();

    await press('?', { shiftKey: true });
    const dialog = document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]');
    expect(dialog).not.toBeNull();

    await press('?');
    expect(document.querySelector('[aria-label="Keyboard shortcuts"]')).toBeNull();

    // Escape closes the overlay first and only then clears the cursor.
    await press('j');
    await press('?', { shiftKey: true });
    await press('Escape');
    expect(document.querySelector('[aria-label="Keyboard shortcuts"]')).toBeNull();
    expect(focused(container)).toBe('card_1');
    await press('Escape');
    expect(focused(container)).toBeNull();
  });
});

/** A shared file with one answerable card, one checklist card and one flashcard. */
function sharedNotebook(): Notebook {
  return {
    id: 'nb_shared',
    name: 'Shared Deck',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [
      {
        id: 's1',
        notebookId: 'nb_shared',
        name: 'Drill',
        position: 0,
        cards: [
          {
            id: 'q',
            sectionId: 's1',
            position: 0,
            slots: [
              {
                id: 'q-choice',
                type: 'choice',
                props: { q: 'pick', options: ['alpha', 'beta', 'gamma'], answer: [1] },
              },
            ],
          },
          {
            id: 'l',
            sectionId: 's1',
            position: 1,
            slots: [
              { id: 'l-list', type: 'list', props: { items: ['first', 'second'], style: 'check' } },
            ],
          },
          {
            id: 'fc',
            sectionId: 's1',
            position: 2,
            verbs: { flip: true },
            slots: [{ id: 'fc-front', type: 'text', props: { text: 'front' } }],
            back: [{ id: 'fc-back', type: 'text', props: { text: 'back' } }],
          },
        ],
      },
    ],
  };
}

describe('Reader — the same cursor in an exported file', () => {
  it('answers and submits a choice card from the keyboard', async () => {
    const { container } = render(Reader, { props: { notebook: sharedNotebook(), shared: true } });
    await tick();

    await press('j');
    expect(focused(container)).toBe('q');

    await press('2');
    const options = () => [...container.querySelectorAll('.furn[data-card="q"] .option')];
    expect(options()[1].className).toContain('selected');

    // Re-pressing a different digit replaces the pick (single-select).
    await press('3');
    expect(options()[1].className).not.toContain('selected');
    expect(options()[2].className).toContain('selected');

    await press('2');
    await press('Enter');
    // Submitted: the options are graded and the Submit button is gone.
    expect(options()[1].className).toContain('correct');
    expect(container.querySelector('.furn[data-card="q"] .submit')).toBeNull();

    // A submitted card is closed — further digits and Enter do nothing.
    await press('1');
    expect(options()[0].className).not.toContain('selected');
    expect(options()[1].className).toContain('correct');
  });

  it('x ticks the checklist one item at a time, then stops', async () => {
    const { container } = render(Reader, { props: { notebook: sharedNotebook(), shared: true } });
    await tick();

    await press('j');
    await press('j');
    expect(focused(container)).toBe('l');

    const boxes = () =>
      [...container.querySelectorAll('.furn[data-card="l"] input[type="checkbox"]')].map(
        (b) => (b as HTMLInputElement).checked,
      );
    expect(boxes()).toEqual([false, false]);

    await press('x');
    expect(boxes()).toEqual([true, false]);
    await press('x');
    expect(boxes()).toEqual([true, true]);
    await press('x');
    expect(boxes()).toEqual([true, true]);
  });

  it('space flips only the focused card, and the ring follows the cursor', async () => {
    const { container } = render(Reader, { props: { notebook: sharedNotebook(), shared: true } });
    await tick();

    // Space with the cursor on a non-flip card does nothing at all.
    await press('j');
    await press(' ');
    expect(container.querySelector('.furn[data-card="q"] .fc')).toBeNull();

    await press('j');
    await press('j');
    expect(focused(container)).toBe('fc');
    await press(' ');
    expect(container.querySelector('.furn[data-card="fc"] .fc')?.classList.contains('flipped')).toBe(
      true,
    );
    // Only one card ever carries the ring.
    expect(container.querySelectorAll('.furn.kfocus')).toHaveLength(1);
  });

  it('carries the hint line and the shortcut overlay', async () => {
    const { container } = render(Reader, { props: { notebook: sharedNotebook(), shared: true } });
    await tick();
    expect(container.querySelector('.kb-hint')?.textContent).toContain('j/k move');

    await press('?', { shiftKey: true });
    expect(document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]')).not.toBeNull();
    await press('Escape');
    expect(document.querySelector('[aria-label="Keyboard shortcuts"]')).toBeNull();
  });
});

describe('Reader — the cursor only reaches what the reader can see', () => {
  it('skips cards the section search has filtered out', async () => {
    const nb = sharedNotebook();
    nb.sections[0].services = { search: true };
    const { container } = render(Reader, { props: { notebook: nb, shared: true } });
    await tick();

    // Search for the checklist card's text: the quiz and the flashcard leave the grid.
    session.search[nb.sections[0].id] = 'second';
    await tick();
    expect([...container.querySelectorAll('.furn[data-card]')].map((f) => f.getAttribute('data-card'))).toEqual(['l']);

    await press('j');
    expect(focused(container)).toBe('l');
    // j/k stay on the only visible card instead of walking onto hidden ones.
    await press('j');
    expect(focused(container)).toBe('l');
    await press('k');
    expect(focused(container)).toBe('l');

    // The hidden quiz card is untouched by keys aimed at the cursor.
    await press('1');
    await press('Enter');
    expect(container.querySelector('.furn[data-card="q"]')).toBeNull();

    session.search[nb.sections[0].id] = '';
    await tick();
    expect(container.querySelector('.furn[data-card="q"] .option.selected')).toBeNull();
  });

  it('follows the shuffle order the grid is showing', async () => {
    const nb = sharedNotebook();
    const { container } = render(Reader, { props: { notebook: nb, shared: true } });
    await tick();

    session.shuf[nb.sections[0].id] = ['fc', 'l', 'q'];
    await tick();

    await press('j');
    expect(focused(container)).toBe('fc');
    await press('j');
    expect(focused(container)).toBe('l');
  });

  it('reaches archived cards only while the archive view is on', async () => {
    const nb = sharedNotebook();
    nb.sections[0].cards[0].archived = true;
    const { container } = render(Reader, { props: { notebook: nb, shared: true } });
    await tick();

    await press('j');
    expect(focused(container)).toBe('l');

    session.showArch[nb.sections[0].id] = true;
    await tick();
    await press('j');
    expect(focused(container)).toBe('q');
  });

  it('skips a collapsed section', async () => {
    const nb = sharedNotebook();
    const { container } = render(Reader, { props: { notebook: nb, shared: true } });
    await tick();

    session.collapsed[nb.sections[0].id] = true;
    await tick();
    expect(container.querySelector('.furn[data-card]')).toBeNull();

    await press('j');
    expect(focused(container)).toBeNull();
  });
});

describe('Reader — a tab-focused control keeps its own keys', () => {
  it('Enter on a focused Submit button submits that slot once, not the cursor’s', async () => {
    const { container } = render(Reader, { props: { notebook: sharedNotebook(), shared: true } });
    await tick();

    await press('j');
    await press('2');
    const submit = container.querySelector('.furn[data-card="q"] .submit') as HTMLElement;
    submit.focus();
    await pressOn(submit, 'Enter');

    // The cursor did not swallow it: the button is still there to be clicked natively (jsdom does
    // not synthesize the click), and no submission happened behind the reader's back.
    expect(container.querySelector('.furn[data-card="q"] .submit')).not.toBeNull();
    expect(container.querySelector('.furn[data-card="q"] .option.correct')).toBeNull();
  });

  it('digits still answer while a clicked option button holds focus', async () => {
    const { container } = render(Reader, { props: { notebook: sharedNotebook(), shared: true } });
    await tick();

    await press('j');
    const option = container.querySelector('.furn[data-card="q"] .option') as HTMLElement;
    option.focus();
    await pressOn(option, '3');

    const options = [...container.querySelectorAll('.furn[data-card="q"] .option')];
    expect(options[2].className).toContain('selected');
  });
});

/**
 * The order that matters: focus FIRST, then move the view under the cursor. Filtering first only
 * proves the cursor cannot ENTER a hidden card; these prove it cannot STAY on one.
 */
describe('Reader — the view moving under the cursor drops it', () => {
  it('collapse: the graded state of the hidden card is untouched (reviewer repro)', async () => {
    const nb = sharedNotebook();
    const { container } = render(Reader, { props: { notebook: nb, shared: true } });
    await tick();

    // Focus the quiz card while it is on screen.
    await press('j');
    expect(focused(container)).toBe('q');

    // Now collapse the section out from under it.
    session.collapsed[nb.sections[0].id] = true;
    await tick();
    expect(container.querySelector('.furn[data-card]')).toBeNull();
    expect(container.querySelector('.furn.kfocus')).toBeNull();

    // Keys aimed at the vanished card do nothing at all.
    await press('2');
    await press('Enter');
    await press('x');
    await press(' ');

    // Un-hide: the quiz is exactly as the reader left it — unanswered and ungraded.
    session.collapsed[nb.sections[0].id] = false;
    await tick();
    const quiz = container.querySelector('.furn[data-card="q"]') as HTMLElement;
    expect(quiz).not.toBeNull();
    expect(quiz.querySelector('.option.selected')).toBeNull();
    expect(quiz.querySelector('.option.correct')).toBeNull();
    expect(quiz.querySelector('.option.incorrect')).toBeNull();
    expect(quiz.querySelector('.choice-explanation')).toBeNull();
    expect(quiz.querySelector('.submit')).not.toBeNull();
  });

  it('search: a cursor on a card the search then hides is dropped', async () => {
    const nb = sharedNotebook();
    const { container } = render(Reader, { props: { notebook: nb, shared: true } });
    await tick();

    await press('j');
    expect(focused(container)).toBe('q');

    session.search[nb.sections[0].id] = 'second'; // matches only the checklist card
    await tick();
    expect(focused(container)).toBeNull();

    await press('1');
    await press('Enter');

    session.search[nb.sections[0].id] = '';
    await tick();
    const quiz = container.querySelector('.furn[data-card="q"]') as HTMLElement;
    expect(quiz.querySelector('.submit'), 'still unsubmitted').not.toBeNull();
    for (const cls of ['selected', 'correct', 'incorrect', 'missed']) {
      expect(quiz.querySelector(`.option.${cls}`), cls).toBeNull();
    }
  });

  it('archive: archiving the focused card drops the cursor mid-session', async () => {
    const nb = sharedNotebook();
    nb.sections[0].services = { archive: true };
    const { container } = render(Reader, { props: { notebook: nb, shared: true } });
    await tick();

    await press('j');
    await press('j');
    expect(focused(container)).toBe('l');

    // Archive it with its own button — the card leaves the grid under the cursor.
    await fireEvent.click(container.querySelector('.furn[data-card="l"] [data-act="arch"]')!);
    await tick();
    expect(container.querySelector('.furn[data-card="l"]')).toBeNull();
    expect(focused(container)).toBeNull();

    await press('x');

    // Show the archive: the checklist never got ticked behind the reader's back.
    session.showArch[nb.sections[0].id] = true;
    await tick();
    const boxes = [...container.querySelectorAll('.furn[data-card="l"] input[type=checkbox]')].map(
      (b) => (b as HTMLInputElement).checked,
    );
    expect(boxes).toEqual([false, false]);
  });

  it('the cursor restarts from the first visible card after being dropped', async () => {
    const nb = sharedNotebook();
    const { container } = render(Reader, { props: { notebook: nb, shared: true } });
    await tick();

    await press('j');
    await press('j');
    expect(focused(container)).toBe('l');

    session.search[nb.sections[0].id] = 'front'; // only the flashcard survives
    await tick();
    expect(focused(container)).toBeNull();

    await press('j');
    expect(focused(container)).toBe('fc');
  });
});

describe('Reader — the coverage filter moving under the cursor drops it', () => {
  /** Two sections and a tag, so the matrix has two qualifying axes and renders. */
  function taggedNotebook(): Notebook {
    const nb = sharedNotebook();
    nb.cats = ['drill'];
    nb.sections[0].cards[0].tags = ['drill'];
    nb.sections.push({
      id: 's2',
      notebookId: 'nb_shared',
      name: 'Later',
      position: 1,
      cards: [
        {
          id: 'z',
          sectionId: 's2',
          position: 0,
          slots: [{ id: 'z1', type: 'text', props: { text: 'later card' } }],
        },
      ],
    });
    return nb;
  }

  it('a cell picked after focusing leaves the hidden card unanswered', async () => {
    const { container } = render(Reader, { props: { notebook: taggedNotebook(), shared: true } });
    await tick();

    await press('j');
    expect(focused(container)).toBe('q');

    // Filter to the other section, which the focused quiz card is not in.
    const cell = [...container.querySelectorAll('.mtx-cell')].find((b) =>
      (b.getAttribute('title') ?? '').startsWith('Later'),
    ) as HTMLElement;
    expect(cell, 'the matrix should render for this notebook').toBeTruthy();
    await fireEvent.click(cell);
    await tick();

    expect(container.querySelector('.furn[data-card="q"]')).toBeNull();
    expect(focused(container)).toBeNull();

    await press('1');
    await press('Enter');
    await press(' ');

    // Escape clears the filter (no cursor is left to clear first): the quiz is untouched.
    await press('Escape');
    await tick();
    const quiz = container.querySelector('.furn[data-card="q"]') as HTMLElement;
    expect(quiz).not.toBeNull();
    expect(quiz.querySelector('.option.selected')).toBeNull();
    expect(quiz.querySelector('.choice-explanation')).toBeNull();
  });
});

describe('Study keys and a focused <select>', () => {
  it('a select keeps its own arrows, letters and Enter', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();

    await press('j');
    expect(focused(container)).toBe('card_1');

    // Any select on the page stands in for one inside a card (Study renders none by default).
    const select = document.createElement('select');
    select.innerHTML = '<option>a</option><option>b</option>';
    container.appendChild(select);
    select.focus();

    await pressOn(select, 'ArrowRight');
    await pressOn(select, 'j');
    // The cursor never moved: the keys belonged to the select.
    expect(focused(container)).toBe('card_1');
    select.remove();
  });
});

describe('App — the same confinement in the app shell', () => {
  it('collapsing the focused card’s section drops the cursor and its keys', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();

    await press('j');
    await press('j');
    await press('j');
    await press('j');
    expect(focused(container)).toBe('card_4'); // the demo flashcard

    // Collapse its section with the room's own ▾ control.
    const room = container.querySelector('.furn[data-card="card_4"]')!.closest('.room')!;
    await fireEvent.click(room.querySelector('.rcollapse')!);
    await tick();
    expect(container.querySelector('.furn[data-card="card_4"]')).toBeNull();
    expect(container.querySelector('.furn.kfocus')).toBeNull();

    // One flip key only — pressing both would flip twice and hide the bug behind a round trip.
    await press(' ');

    // Expand again: the flashcard was never flipped behind the reader's back.
    await fireEvent.click(room.querySelector('.rcollapse')!);
    await tick();
    expect(
      container.querySelector('.furn[data-card="card_4"] .fc')?.classList.contains('flipped'),
    ).toBe(false);
  });
});
