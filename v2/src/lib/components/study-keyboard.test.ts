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
import type { Notebook } from '../types';

beforeAll(() => {
  // jsdom implements no layout, so the cursor's scrollIntoView needs a stub.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  mode.set('edit');
  place.set('house');
});

async function press(key: string, mods: Record<string, boolean> = {}) {
  await fireEvent.keyDown(window, { key, ...mods });
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
