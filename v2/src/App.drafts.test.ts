import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from 'vitest';
import { render, fireEvent, waitFor, cleanup, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { mode } from './lib/stores/mode';

const share = vi.hoisted(() => ({ next: null as unknown, shared: [] as unknown[] }));
vi.mock('./lib/share', async (orig) => ({
  ...(await orig<typeof import('./lib/share')>()),
  importNotebookFromFile: vi.fn(async () => share.next),
  shareNotebookToFile: vi.fn(async (nb: unknown) => {
    share.shared.push(nb);
    return { path: 'shared.html' };
  }),
}));

import App from './App.svelte';
import { importNotebook, type NotebookJSON } from './lib/json-io';

const text = (t: string) => ({ slots: [{ type: 'text', props: { text: t } }] });

/** Five cards (so Mark all asks first); the second section opens a chapter the tests can fold. */
const lesson: NotebookJSON = {
  version: 2,
  notebook: {
    name: 'Cells from AI',
    sections: [
      { name: 'Basics', cards: [text('card one'), text('card two'), text('card three')] },
      { name: 'Part II', kind: 'divider', cards: [] },
      { name: 'More', cards: [text('card four'), text('card five')] },
    ],
  },
};

async function createFromAi(container: HTMLElement, json: NotebookJSON = lesson) {
  await fireEvent.click(container.querySelector('button[title="New notebook"]')!);
  await fireEvent.click(await waitFor(() => container.querySelector('[data-new="ai"]')!));
  const modal = await waitFor(() => document.querySelector('.fromai')!);
  const reply = modal.querySelector('textarea[aria-label="AI reply"]') as HTMLTextAreaElement;
  await fireEvent.input(reply, { target: { value: JSON.stringify(json) } });
  await fireEvent.click(modal.querySelector('[data-act="check"]')!);
  await fireEvent.click(modal.querySelector('[data-act="create"]')!);
  await waitFor(() => expect(container.textContent).toContain(json.notebook.name));
}

const drafts = (c: HTMLElement) => c.querySelectorAll('.furn.draft').length;
const bar = (c: HTMLElement) => c.querySelector('.drafts-bar');
const cardWith = (c: HTMLElement, t: string) =>
  [...c.querySelectorAll<HTMLElement>('.furn')].find((el) => el.textContent?.includes(t))!;

let confirmSpy: MockInstance<(message?: string) => boolean>;
let scrolled: Element[];
const nativeScroll = Element.prototype.scrollIntoView;

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  scrolled = [];
  // jsdom has no layout, so no scrollIntoView: record which element Next asked to show.
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this);
  });
});

afterEach(() => {
  cleanup();
  confirmSpy.mockRestore();
  Element.prototype.scrollIntoView = nativeScroll;
  share.next = null;
  share.shared = [];
  mode.set('edit');
});

describe('App — a notebook made From AI arrives as drafts', () => {
  it('marks every card a draft; Reviewed clears one, Mark all the rest, and undo restores them', async () => {
    const { container } = render(App);
    await createFromAi(container);
    expect(drafts(container)).toBe(5);
    expect(bar(container)?.textContent).toMatch(/5 drafts to review/);

    await fireEvent.click(cardWith(container, 'card one').querySelector('.draft-chip button')!);
    expect(drafts(container)).toBe(4);
    expect(cardWith(container, 'card one')).not.toHaveClass('draft');
    expect(bar(container)?.textContent).toMatch(/4 drafts to review/);

    await fireEvent.click(screen.getByRole('button', { name: /mark all reviewed/i }));
    await tick();
    expect(confirmSpy).toHaveBeenCalledTimes(1); // 4 > 3 drafts: asks first
    expect(String(confirmSpy.mock.calls[0][0])).toMatch(/4 drafts/);
    expect(drafts(container)).toBe(0);
    expect(bar(container)).toBeNull();

    await fireEvent.click(container.querySelector('button[title="Undo"]')!);
    expect(drafts(container)).toBe(4);
    await fireEvent.click(container.querySelector('button[title="Undo"]')!);
    expect(drafts(container)).toBe(5);
    expect(cardWith(container, 'card one')).toHaveClass('draft');
  });

  it('cancelling the Mark all confirmation changes nothing', async () => {
    confirmSpy.mockReturnValue(false);
    const { container } = render(App);
    await createFromAi(container);
    await fireEvent.click(screen.getByRole('button', { name: /mark all reviewed/i }));
    await tick();
    expect(drafts(container)).toBe(5);
  });

  it('Mark all with three or fewer drafts does not ask', async () => {
    const { container } = render(App);
    await createFromAi(container);
    for (const t of ['card one', 'card two']) {
      await fireEvent.click(cardWith(container, t).querySelector('.draft-chip button')!);
    }
    await fireEvent.click(screen.getByRole('button', { name: /mark all reviewed/i }));
    await tick();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(drafts(container)).toBe(0);
  });

  it('Next selects and scrolls to each draft in order, wrapping around', async () => {
    const { container } = render(App);
    await createFromAi(container);
    await fireEvent.click(cardWith(container, 'card two').querySelector('.draft-chip button')!);
    const next = () => fireEvent.click(screen.getByRole('button', { name: /next/i }));

    for (const t of ['card one', 'card three', 'card four', 'card five', 'card one']) {
      await next();
      await waitFor(() => expect(container.querySelector('.furn.sel')).toBe(cardWith(container, t)));
      expect(scrolled.at(-1)).toBe(cardWith(container, t));
    }
  });

  it('Next unfolds a collapsed chapter that hides the next draft (undoably)', async () => {
    const { container } = render(App);
    await createFromAi(container);
    for (const t of ['card one', 'card two', 'card three']) {
      await fireEvent.click(cardWith(container, t).querySelector('.draft-chip button')!);
    }
    await fireEvent.click(container.querySelector('[title="collapse chapter"]')!);
    expect(cardWith(container, 'card four')).toBeUndefined();

    await fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(container.querySelector('.furn.sel')).toBe(cardWith(container, 'card four')));
    expect(scrolled.at(-1)).toBe(cardWith(container, 'card four'));
    await fireEvent.click(container.querySelector('button[title="Undo"]')!);
    expect(cardWith(container, 'card four')).toBeUndefined();
  });

  it('Next shows a locked section’s draft without selecting it, then moves on', async () => {
    const locked: NotebookJSON = {
      version: 2,
      notebook: {
        name: 'Locked from AI',
        sections: [
          { name: 'Fixed', locked: true, cards: [text('card one'), text('card two')] },
          { name: 'Open', cards: [text('card three')] },
        ],
      },
    };
    const { container } = render(App);
    await createFromAi(container, locked);
    const next = () => fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Selecting would open the card inspector and edit around the lock: scroll only.
    await next();
    await waitFor(() => expect(scrolled.at(-1)).toBe(cardWith(container, 'card one')));
    expect(container.querySelector('.furn.sel')).toBeNull();
    await next();
    await waitFor(() => expect(scrolled.at(-1)).toBe(cardWith(container, 'card two')));
    expect(container.querySelector('.furn.sel')).toBeNull();
    await next();
    await waitFor(() => expect(container.querySelector('.furn.sel')).toBe(cardWith(container, 'card three')));

    // Reviewing is not content editing: the chip works on a locked card too.
    await fireEvent.click(cardWith(container, 'card one').querySelector('.draft-chip button')!);
    expect(cardWith(container, 'card one')).not.toHaveClass('draft');
    expect(drafts(container)).toBe(2);
  });

  it('shows no chip or bar in Study mode', async () => {
    const { container } = render(App);
    await createFromAi(container);
    mode.set('study');
    await tick();
    expect(container.querySelector('.draft-chip')).toBeNull();
    expect(bar(container)).toBeNull();
  });

  it('a plain file import does not mark drafts', async () => {
    share.next = { notebook: importNotebook(lesson), warnings: [] };
    const { container } = render(App);
    await fireEvent.click(container.querySelector('button[title="Import a notebook JSON"]')!);
    await waitFor(() => expect(container.textContent).toContain('Cells from AI'));
    expect(drafts(container)).toBe(0);
    expect(bar(container)).toBeNull();
  });
});

describe('App — sharing warns while drafts remain', () => {
  const shareBtn = (c: HTMLElement) => c.querySelector<HTMLElement>('.share-btn')!;

  it('asks first; cancel aborts the share, OK shares anyway', async () => {
    const { container } = render(App);
    await createFromAi(container);
    confirmSpy.mockReturnValue(false);
    await fireEvent.click(shareBtn(container));
    await tick();
    expect(confirmSpy).toHaveBeenCalledWith(
      '5 cards are still drafts (made by AI and not yet reviewed). Share anyway?',
    );
    expect(share.shared).toHaveLength(0);

    confirmSpy.mockReturnValue(true);
    await fireEvent.click(shareBtn(container));
    await waitFor(() => expect(share.shared).toHaveLength(1));
  });

  it('uses the singular for one draft', async () => {
    const { container } = render(App);
    await createFromAi(container, { version: 2, notebook: { name: 'One from AI', sections: [{ name: 'S', cards: [text('solo')] }] } });
    confirmSpy.mockReturnValue(false);
    await fireEvent.click(shareBtn(container));
    await tick();
    expect(confirmSpy).toHaveBeenCalledWith('1 card is still a draft (made by AI and not yet reviewed). Share anyway?');
  });

  it('shares without asking once every draft is reviewed', async () => {
    const { container } = render(App);
    await createFromAi(container);
    await fireEvent.click(screen.getByRole('button', { name: /mark all reviewed/i }));
    await tick();
    confirmSpy.mockClear();
    await fireEvent.click(shareBtn(container));
    await waitFor(() => expect(share.shared).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
