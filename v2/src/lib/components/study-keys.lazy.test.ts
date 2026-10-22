/**
 * The window key handler runs on every keystroke, typing included. What the focused card can
 * answer is derived from its variable scope (buildCardScope over every formula on the card), so
 * App and Reader must only work it out when a card key actually reaches the focused card — never
 * for a key typed into a field.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('../card-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../card-scope')>();
  return { ...actual, buildCardScope: vi.fn(actual.buildCardScope) };
});

import App from '../../App.svelte';
import Reader from './Reader.svelte';
import { buildCardScope } from '../card-scope';
import { mode } from '../stores/mode';
import { place } from '../stores/place';
import { resetSession } from '../session.svelte';
import type { Notebook } from '../types';

beforeAll(() => {
  // jsdom implements no layout, so the cursor's scrollIntoView needs a stub.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  document.querySelectorAll('input[data-probe]').forEach((n) => n.remove());
  mode.set('edit');
  place.set('house');
  resetSession();
});

const scopes = () => vi.mocked(buildCardScope).mock.calls.length;
const focused = (container: HTMLElement) =>
  container.querySelector('.furn.kfocus')?.getAttribute('data-card') ?? null;

async function press(key: string) {
  await fireEvent.keyDown(window, { key });
  await tick();
}

/** Type into a text field elsewhere on the page; its keydowns still bubble to the window. */
async function typeIntoField(keys: string[]) {
  const field = document.body.appendChild(document.createElement('input'));
  field.dataset.probe = '';
  field.focus();
  for (const key of keys) await fireEvent.keyDown(field, { key, bubbles: true });
  await tick();
}

// Card keys among them: in a field they are text, and must cost nothing either.
const TYPED = ['h', 'e', 'l', 'l', 'o', ' ', 'f', 'x', '1', 'Enter', 'j', 'Backspace'];

function quizDeck(): Notebook {
  return {
    id: 'nb_lazy',
    name: 'Lazy',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [
      {
        id: 's1',
        notebookId: 'nb_lazy',
        name: 'Drill',
        position: 0,
        cards: [
          {
            id: 'q',
            sectionId: 's1',
            position: 0,
            slots: [
              { id: 'q-choice', type: 'choice', props: { q: 'pick', options: ['alpha', 'beta'], answer: [1] } },
            ],
          },
        ],
      },
    ],
  };
}

describe('Reader — typing never builds the focused card’s scope', () => {
  it('a field’s keystrokes leave the scope builder alone; a card key still answers', async () => {
    const { container } = render(Reader, { props: { notebook: quizDeck(), shared: true } });
    await tick();
    await press('j');
    expect(focused(container)).toBe('q');

    const before = scopes();
    await typeIntoField(TYPED);
    expect(scopes()).toBe(before);
    expect(focused(container)).toBe('q'); // nothing moved either

    // The control: the same cursor, a card key from outside a field, does reach the card.
    await press('2');
    expect(scopes()).toBeGreaterThan(before);
    expect(container.querySelectorAll('.furn[data-card="q"] .option')[1].className).toContain('selected');
  });
});

describe('App — typing never builds the focused card’s scope', () => {
  it('a field’s keystrokes leave the scope builder alone', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();
    await press('j');
    expect(focused(container)).toBe('card_1');

    const before = scopes();
    await typeIntoField(TYPED);
    expect(scopes()).toBe(before);
    expect(focused(container)).toBe('card_1');
  });
});
