/**
 * "My results" is a modal dialog: while it is open the study keys belong to it, not to the card
 * the cursor was on behind it. Before, a digit or Enter pressed in the dialog bubbled to the
 * Reader's window handler, answered the focused quiz card and saved that answer.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import Reader from './Reader.svelte';
import { mode } from '../stores/mode';
import { resetSession } from '../session.svelte';
import { readerStorageKey } from '../reader-store';
import type { Notebook } from '../types';

beforeAll(() => {
  // jsdom implements no layout, so the cursor's scrollIntoView needs a stub.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  localStorage.clear();
  mode.set('edit');
  resetSession();
});

function deck(): Notebook {
  return {
    id: 'nb_modal',
    name: 'Modal Deck',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [
      {
        id: 's1',
        notebookId: 'nb_modal',
        name: 'Drill',
        position: 0,
        cards: [
          {
            id: 'q',
            sectionId: 's1',
            position: 0,
            slots: [
              { id: 'q-choice', type: 'choice', props: { q: 'pick', options: ['alpha', 'beta', 'gamma'], answer: [1] } },
            ],
          },
          {
            id: 'fc',
            sectionId: 's1',
            position: 1,
            verbs: { flip: true },
            slots: [{ id: 'fc-front', type: 'text', props: { text: 'front' } }],
            back: [{ id: 'fc-back', type: 'text', props: { text: 'back' } }],
          },
        ],
      },
    ],
  };
}

const KEY = readerStorageKey('nb_modal');

async function press(key: string, target: Element | Window = window) {
  await fireEvent.keyDown(target, { key, bubbles: true });
  await tick();
}

const focused = (container: HTMLElement) =>
  container.querySelector('.furn.kfocus')?.getAttribute('data-card') ?? null;
const selectedOptions = (container: HTMLElement) =>
  container.querySelectorAll('.furn[data-card="q"] .option.selected').length;
/** Picked, or graded after a submit: any trace of an answer on the quiz card. */
const answerMarks = (container: HTMLElement) =>
  container.querySelectorAll(
    '.furn[data-card="q"] .option:is(.selected, .correct, .incorrect, .missed)',
  ).length;
const flipped = (container: HTMLElement) =>
  container.querySelector('.furn[data-card="fc"] .fc')?.classList.contains('flipped') ?? false;
const dialog = () => document.querySelector('.results-modal [role="dialog"]');
const helpOverlay = () => document.querySelector('[aria-label="Keyboard shortcuts"]');

async function openResults(container: HTMLElement) {
  await fireEvent.click(container.querySelector('[data-act="results"]') as Element);
  await tick();
  expect(dialog()).not.toBeNull();
}

async function closeResults() {
  await fireEvent.click(document.querySelector('[data-act="close-results"]') as Element);
  await tick();
  expect(dialog()).toBeNull();
}

describe('Reader — the open results dialog owns the keyboard', () => {
  it('digits, Enter, x, j/k and ? do nothing to the focused card behind it', async () => {
    const { container } = render(Reader, {
      props: { notebook: deck(), shared: true, storageKey: KEY, docId: 'nb_modal' },
    });
    await tick();
    await press('j');
    expect(focused(container)).toBe('q');

    await openResults(container);
    // Keys typed with the dialog focused (it focuses itself on open) bubble to the window too.
    for (const k of ['2', 'Enter', 'x', 'j', 'k', '?']) await press(k, dialog()!);
    for (const k of ['1', 'Enter', 'j', '?']) await press(k);

    expect(answerMarks(container)).toBe(0);
    expect(focused(container)).toBe('q');
    expect(helpOverlay()).toBeNull();
    expect(dialog()).not.toBeNull();

    // Nothing reached the progress layer either: no answer was saved behind the dialog.
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEY)).toBeNull();

    // Control: with the dialog closed, the very same key answers the card.
    await closeResults();
    await press('2');
    expect(selectedOptions(container)).toBe(1);
  });

  it('Space and f do not flip the focused flashcard behind it', async () => {
    const { container } = render(Reader, { props: { notebook: deck(), shared: true } });
    await tick();
    await press('j');
    await press('j');
    expect(focused(container)).toBe('fc');

    // One key at a time: two flips would cancel out and hide a leak.
    await openResults(container);
    await press(' ', dialog()!);
    expect(flipped(container)).toBe(false);
    await press('f');
    expect(flipped(container)).toBe(false);

    await closeResults();
    await press('f');
    expect(flipped(container)).toBe(true);
  });

  it('takes the shell behind it out of the focus order, and gives it back on close', async () => {
    const { container } = render(Reader, { props: { notebook: deck(), shared: true } });
    await tick();
    const inert = () =>
      ['#top', '#main', '#sidebump'].map((s) => document.querySelector(s)?.hasAttribute('inert'));
    expect(inert()).toEqual([false, false, false]);

    await openResults(container);
    expect(inert()).toEqual([true, true, true]);
    expect(document.querySelector('.results-modal')?.hasAttribute('inert')).toBe(false);

    await closeResults();
    expect(inert()).toEqual([false, false, false]);
  });
});
