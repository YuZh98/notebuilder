import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import Reader from './Reader.svelte';
import { mode } from '../stores/mode';
import { toastState } from '../toast.svelte';
import type { Notebook, Section, Card } from '../types';

function card(id: string, sectionId: string): Card {
  return { id, sectionId, position: 0, slots: [{ id: `${id}-s`, type: 'text', props: { text: `body-${id}` } }] };
}

function sec(id: string, over: Partial<Section> = {}): Section {
  return { id, notebookId: 'nb1', name: `name-${id}`, position: 0, cards: [], ...over };
}

function nb(): Notebook {
  return {
    id: 'nb1',
    name: 'Shared Deck',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [sec('s1', { title: 'Chapter One', cards: [card('c1', 's1')] })],
  };
}

afterEach(() => {
  mode.set('edit');
  delete document.body.dataset.theme;
});

const sectionNames = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLInputElement>('.room[data-section] input.section-name')].map(
    (i) => i.value,
  );

async function remixToEdit(container: HTMLElement) {
  await fireEvent.click(container.querySelector('[data-act="remix"]') as Element);
  await tick();
  const editBtn = [...container.querySelectorAll('#topright button')].find(
    (b) => b.textContent?.trim() === 'Edit',
  ) as HTMLElement;
  await fireEvent.click(editBtn);
  await tick();
}

describe('Reader — locked (shared) topbar', () => {
  it('shows the theme menu, brand chip, and a single Remix button; no author chrome', () => {
    const { container } = render(Reader, { props: { notebook: nb(), shared: true } });

    expect(container.querySelector('.themewrap')).not.toBeNull();
    expect(container.querySelector('.brand-nb')?.textContent).toContain('📓 Shared Deck');

    const right = container.querySelector('#topright') as HTMLElement;
    expect(right.querySelector('[data-act="remix"]')?.textContent).toContain('Remix');
    // locked: no Edit/Study toggle, no add/undo controls
    expect(right.textContent).not.toContain('Edit');
    expect(right.textContent).not.toContain('Study');
  });

  it('boots into Study — cards render read-only (editable=false)', async () => {
    const { container } = render(Reader, { props: { notebook: nb(), shared: true } });
    await tick();
    expect(mode).toBeDefined();
    // Study rendering: the section title and card body are present
    expect(container.querySelector('.room.study')).not.toBeNull();
    expect(container.textContent).toContain('body-c1');
    // the author-only lock button never renders in Study
    expect(container.querySelector('.room-lock')).toBeNull();
  });
});

describe('Reader — Remix (D10)', () => {
  it('unlocks authoring: flips shared off, shows the mode toggle, and toasts the exact copy', async () => {
    const { container } = render(Reader, { props: { notebook: nb(), shared: true } });

    await fireEvent.click(container.querySelector('[data-act="remix"]') as Element);
    await tick();

    expect(toastState.message).toBe(
      'Editing unlocked — changes stay in this file (a reload reopens the original)',
    );
    const right = container.querySelector('#topright') as HTMLElement;
    expect(right.querySelector('[data-act="remix"]')).toBeNull();
    expect(right.textContent).toContain('Edit');
    expect(right.textContent).toContain('Study');
    // undo/redo affordances appear post-remix
    expect(right.querySelector('[title="Undo"]')).not.toBeNull();
    expect(right.querySelector('[title="Redo"]')).not.toBeNull();
  });

  it('switching to Edit after Remix exposes the author lock button on a section', async () => {
    const { container } = render(Reader, { props: { notebook: nb(), shared: true } });
    await fireEvent.click(container.querySelector('[data-act="remix"]') as Element);
    await tick();

    const editBtn = [...container.querySelectorAll('#topright button')].find(
      (b) => b.textContent?.trim() === 'Edit',
    ) as HTMLElement;
    await fireEvent.click(editBtn);
    await tick();

    expect(container.querySelector('.room.edit')).not.toBeNull();
    expect(container.querySelector('.room-lock')).not.toBeNull();
  });
});

describe('Reader — review fixes', () => {
  it('the shared-Reader sidebar never offers the Delete-notebook button', async () => {
    const { container } = render(Reader, { props: { notebook: nb(), shared: true } });
    await remixToEdit(container);
    expect(container.querySelector('#side')?.textContent).not.toContain('Delete notebook');
  });

  it('post-Remix Cmd+Z triggers undo; pre-Remix it is inert', async () => {
    const { container } = render(Reader, { props: { notebook: nb(), shared: true } });

    // pre-Remix (locked): the undo path is gated off entirely
    toastState.message = 'sentinel';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    await tick();
    expect(toastState.message).toBe('sentinel');

    await remixToEdit(container);
    // make an undoable change (adds a section, pushing history)
    const addSectionBtn = [...container.querySelectorAll('#topright button')].find((b) =>
      b.textContent?.includes('section'),
    ) as HTMLElement;
    await fireEvent.click(addSectionBtn);
    await tick();
    expect(sectionNames(container)).toEqual(['name-s1', 'Section 2']);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    await tick();
    expect(toastState.message).toBe('undo');
    expect(sectionNames(container), 'the added section must be gone again').toEqual(['name-s1']);
  });

  it('post-Remix text edits in a data-history region arm an undo step', async () => {
    const { container } = render(Reader, { props: { notebook: nb(), shared: true } });
    await remixToEdit(container);

    // A rendered author field (the notebook name) lives inside a data-history="edit" region.
    const field = container.querySelector('[data-history="edit"]') as HTMLInputElement;
    expect(field).not.toBeNull();
    expect(field.value).toBe('Shared Deck');
    field.value = 'Renamed';
    await fireEvent.input(field);
    await fireEvent.change(field);
    await tick();
    expect(container.querySelector('.brand-nb')?.textContent).toContain('📓 Renamed');

    // With installEditCoalescing wired into the Reader, the input armed history: Cmd+Z now undoes.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    await tick();
    expect(toastState.message).toBe('undo');
    expect(container.querySelector('.brand-nb')?.textContent).toContain('📓 Shared Deck');
  });

  it('applies an initialTheme at boot', async () => {
    render(Reader, { props: { notebook: nb(), shared: true, initialTheme: 'cyber' } });
    await tick();
    expect(document.body.dataset.theme).toBe('cyber');
  });

  it('offers the JSON export button only after Remix', async () => {
    const { container } = render(Reader, { props: { notebook: nb(), shared: true } });
    expect(container.querySelector('[data-act="export"]')).toBeNull();
    await fireEvent.click(container.querySelector('[data-act="remix"]') as Element);
    await tick();
    expect(container.querySelector('[data-act="export"]')).not.toBeNull();
    expect(container.querySelector('[data-act="import"]')).not.toBeNull();
  });
});
