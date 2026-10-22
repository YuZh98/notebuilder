/**
 * Review-flow edges the main From AI drafts test leaves open: Next past a coverage filter that
 * hides the next draft, redo of a review, and a review right after an in-place edit of the same
 * card staying its own undo step (the edit session must not swallow it).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { mode } from './lib/stores/mode';

vi.mock('./lib/share', async (orig) => ({
  ...(await orig<typeof import('./lib/share')>()),
  shareNotebookToFile: vi.fn(async () => ({ path: 'shared.html' })),
}));

import App from './App.svelte';
import type { NotebookJSON } from './lib/json-io';

const text = (t: string) => ({ slots: [{ type: 'text', props: { text: t } }] });

/** Tagged cards across two sections, so the coverage matrix qualifies (sections × tags). */
const lesson: NotebookJSON = {
  version: 2,
  notebook: {
    name: 'Cells from AI',
    sections: [
      { name: 'Basics', cards: [{ ...text('card one'), tags: ['a'] }, text('card two')] },
      { name: 'More', cards: [{ ...text('card four'), tags: ['b'] }, text('card five')] },
    ],
  },
};

async function createFromAi(container: HTMLElement) {
  await fireEvent.click(container.querySelector('button[title="New notebook"]')!);
  await fireEvent.click(await waitFor(() => container.querySelector('[data-new="ai"]')!));
  const modal = await waitFor(() => document.querySelector('.fromai')!);
  const reply = modal.querySelector('textarea[aria-label="AI reply"]') as HTMLTextAreaElement;
  await fireEvent.input(reply, { target: { value: JSON.stringify(lesson) } });
  await fireEvent.click(modal.querySelector('[data-act="check"]')!);
  await fireEvent.click(modal.querySelector('[data-act="create"]')!);
  await waitFor(() => expect(container.textContent).toContain(lesson.notebook.name));
}

const drafts = (c: HTMLElement) => c.querySelectorAll('.furn.draft').length;
const cardWith = (c: HTMLElement, t: string) =>
  [...c.querySelectorAll<HTMLElement>('.furn')].find((el) => el.textContent?.includes(t));
const review = (c: HTMLElement, t: string) =>
  fireEvent.click(cardWith(c, t)!.querySelector('.draft-chip button')!);
const undo = (c: HTMLElement) => fireEvent.click(c.querySelector('button[title="Undo"]')!);
const tagsOf = (c: HTMLElement, t: string) =>
  cardWith(c, t)!.querySelector<HTMLInputElement>('.tags-input')!;

const nativeScroll = Element.prototype.scrollIntoView;
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  // jsdom has no layout, so no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = nativeScroll;
  mode.set('edit');
});

describe('App — AI drafts review edges', () => {
  it('Next clears a coverage filter that hides the next draft, then selects it', async () => {
    const { container } = render(App);
    await createFromAi(container);
    const basics = [...container.querySelectorAll<HTMLElement>('.mtx-rowh')].find((r) =>
      r.textContent?.includes('Basics'),
    )!;
    await fireEvent.click(basics);
    await tick();
    expect(cardWith(container, 'card four')).toBeUndefined(); // filtered out with its section
    await review(container, 'card one');
    await review(container, 'card two');

    await fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(container.querySelector('.furn.sel')).toBe(cardWith(container, 'card four')),
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('redo re-applies an undone review', async () => {
    const { container } = render(App);
    await createFromAi(container);
    await review(container, 'card one');
    expect(drafts(container)).toBe(3);
    await undo(container);
    expect(drafts(container)).toBe(4);
    await fireEvent.click(container.querySelector('button[title="Redo"]')!);
    expect(drafts(container)).toBe(3);
    expect(cardWith(container, 'card one')).not.toHaveClass('draft');
  });

  it('a review right after editing the same card is its own undo step', async () => {
    const { container } = render(App);
    await createFromAi(container);
    const tags = tagsOf(container, 'card two');
    tags.focus();
    await fireEvent.input(tags, { target: { value: 'checked' } });
    await fireEvent.change(tags, { target: { value: 'checked' } });
    await review(container, 'card two');
    expect(drafts(container)).toBe(3);

    await undo(container); // the review only: a draft again, the edit kept
    expect(cardWith(container, 'card two')).toHaveClass('draft');
    expect(tagsOf(container, 'card two').value).toBe('checked');
    await undo(container); // then the edit
    expect(tagsOf(container, 'card two').value).toBe('');
    expect(cardWith(container, 'card two')).toHaveClass('draft');
  });
});
