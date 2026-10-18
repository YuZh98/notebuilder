import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import Reader from './Reader.svelte';
import { mode } from '../stores/mode';
import type { Notebook } from '../types';

// A shared file can never carry Card.draft (export strips it, import ignores it). Even when a
// notebook handed to the Reader does, the Reader offers no review chip, before or after Remix.
function drafted(): Notebook {
  return {
    id: 'nb1',
    name: 'Shared Deck',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [
      {
        id: 's1',
        notebookId: 'nb1',
        name: 'S',
        position: 0,
        cards: [{ id: 'c1', sectionId: 's1', position: 0, draft: true, slots: [{ id: 'x', type: 'text', props: { text: 'hi' } }] }],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  mode.set('edit');
  delete document.body.dataset.theme;
});

describe('Reader — never shows AI drafts', () => {
  it('no draft chip in the shared Study view', async () => {
    const { container } = render(Reader, { props: { notebook: drafted(), shared: true } });
    await tick();
    expect(container.querySelector('[data-card="c1"]')).not.toBeNull();
    expect(container.querySelector('.draft-chip')).toBeNull();
  });

  it('no draft chip after Remix into Edit', async () => {
    const { container } = render(Reader, { props: { notebook: drafted(), shared: true } });
    await fireEvent.click(container.querySelector('[data-act="remix"]') as Element);
    await tick();
    const edit = [...container.querySelectorAll('#topright button')].find(
      (b) => b.textContent?.trim() === 'Edit',
    ) as HTMLElement;
    await fireEvent.click(edit);
    await tick();
    expect(container.querySelector('.cardtools')).not.toBeNull(); // really in Edit
    expect(container.querySelector('.draft-chip')).toBeNull();
    expect(container.querySelector('.drafts-bar')).toBeNull();
  });
});
