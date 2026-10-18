import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import Reader from './Reader.svelte';
import { mode } from '../stores/mode';
import { toastState } from '../toast.svelte';
import { exportNotebook, importNotebook, type NotebookJSON } from '../json-io';
import { loadProgress, readerStorageKey } from '../reader-store';
import type { Notebook } from '../types';

// The shared file as the author exported it; every "open" re-imports it with fresh ids.
const PAYLOAD: NotebookJSON = exportNotebook({
  id: 'nb_author',
  name: 'Shared Quiz',
  createdAt: '',
  updatedAt: '',
  sections: [
    {
      id: 's',
      notebookId: 'nb_author',
      name: 'Basics',
      position: 0,
      cards: [
        {
          id: 'a',
          sectionId: 's',
          position: 0,
          slots: [{ id: 'q', type: 'choice', props: { q: 'Pick A', options: ['A', 'B'], answer: [0] } }],
        },
        {
          id: 'b',
          sectionId: 's',
          position: 1,
          slots: [{ id: 't', type: 'text-input', props: { placeholder: 'your answer' } }],
        },
      ],
    },
  ],
});

const KEY = readerStorageKey('nb_author');
const openFile = (): Notebook => importNotebook(structuredClone(PAYLOAD));

function mountReader(over: Record<string, unknown> = {}) {
  const notebook = openFile();
  const initialState = loadProgress(KEY, notebook);
  const r = render(Reader, {
    props: { notebook, shared: true, storageKey: KEY, docId: 'nb_author', initialState, ...over },
  });
  return { ...r, notebook };
}

const flush = () => window.dispatchEvent(new Event('pagehide'));
const stored = () => localStorage.getItem(KEY);

async function answerChoice(container: HTMLElement) {
  await fireEvent.click(container.querySelector('.choice-study button.option') as Element);
  await tick();
  await fireEvent.click(container.querySelector('.choice-study button.submit') as Element);
  await tick();
}

async function typeInto(container: HTMLElement, value: string) {
  const input = container.querySelector('.text-input-study input') as HTMLInputElement;
  await fireEvent.input(input, { target: { value } });
  await tick();
}

afterEach(() => {
  localStorage.clear();
  mode.set('edit');
  vi.restoreAllMocks();
});

describe('Reader — remembers a student’s progress', () => {
  it('saves interactions under stable keys and restores them on the next open', async () => {
    const first = mountReader();
    await answerChoice(first.container);
    await typeInto(first.container, 'mitochondria');
    flush();
    expect(stored()).toContain('mitochondria');
    expect(stored()).not.toContain(first.notebook.sections[0].cards[0].id); // ids never persist
    first.unmount();

    const second = mountReader();
    await tick();
    const input = second.container.querySelector('.text-input-study input') as HTMLInputElement;
    expect(input.value).toBe('mitochondria');
    expect(second.container.querySelector('.choice-study')?.getAttribute('data-verdict')).toBe('correct');
  });

  it('loads by itself when given only a storage key — never saving empty over stored progress', async () => {
    const first = mountReader();
    await typeInto(first.container, 'kept');
    flush();
    first.unmount();

    const { container } = render(Reader, { props: { notebook: openFile(), shared: true, storageKey: KEY } });
    await tick();
    expect((container.querySelector('.text-input-study input') as HTMLInputElement).value).toBe('kept');
    flush();
    expect(stored()).toContain('kept');
  });

  it('saves on its own debounce without waiting for pagehide', async () => {
    vi.useFakeTimers();
    try {
      const { container } = mountReader();
      await typeInto(container, 'debounced');
      expect(stored()).toBeNull();
      vi.advanceTimersByTime(2000);
      expect(stored()).toContain('debounced');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes when the tab is hidden', async () => {
    const { container } = mountReader();
    await typeInto(container, 'hidden-flush');
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vis.mockRestore();
    expect(stored()).toContain('hidden-flush');
  });

  it('stops persisting after Remix — the document has diverged', async () => {
    const { container } = mountReader();
    await typeInto(container, 'before');
    await fireEvent.click(container.querySelector('[data-act="remix"]') as Element);
    await tick();
    expect(stored()).toContain('before'); // pending work was flushed first
    await typeInto(container, 'after');
    flush();
    expect(stored()).toContain('before');
    expect(stored()).not.toContain('after');
  });

  it('does not persist without a storage key (plain mount)', async () => {
    const { container } = render(Reader, { props: { notebook: openFile(), shared: true } });
    await typeInto(container, 'nowhere');
    flush();
    expect(localStorage.length).toBe(0);
    expect(container.querySelector('[data-note="no-storage"]')).toBeNull();
  });

  it('shows a quiet one-line note when this browser cannot keep progress', () => {
    const notebook = openFile();
    const { container } = render(Reader, {
      props: {
        notebook,
        shared: true,
        storageKey: KEY,
        initialState: { readerState: {}, annotations: {}, available: false },
      },
    });
    expect(container.querySelector('[data-note="no-storage"]')?.textContent).toContain(
      'Progress isn’t saved in this browser',
    );
  });

  it('shows the note when a save fails mid-session', async () => {
    const { container } = mountReader();
    expect(container.querySelector('[data-note="no-storage"]')).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    await typeInto(container, 'x');
    flush();
    await tick();
    expect(container.querySelector('[data-note="no-storage"]')).not.toBeNull();
  });

  it('Reset my progress clears stored and in-memory progress after confirming', async () => {
    const { container } = mountReader();
    await typeInto(container, 'to be cleared');
    flush();
    expect(stored()).not.toBeNull();

    await fireEvent.click(container.querySelector('[data-act="results"]') as Element);
    await tick();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await fireEvent.click(container.querySelector('[data-act="reset-progress"]') as Element);
    await tick();
    expect(confirm).toHaveBeenCalledOnce();
    expect(stored()).not.toBeNull();

    confirm.mockReturnValueOnce(true);
    await fireEvent.click(container.querySelector('[data-act="reset-progress"]') as Element);
    await tick();
    flush();
    expect(stored()).toBeNull();
    expect((container.querySelector('.text-input-study input') as HTMLInputElement).value).toBe('');
    expect(toastState.message).toContain('reset');
  });
});

describe('Reader — results and credit', () => {
  it('opens My results from the shared chrome, reflecting live progress', async () => {
    const { container } = mountReader();
    await answerChoice(container);
    const btn = container.querySelector('#topright [data-act="results"]') as HTMLElement;
    expect(btn.textContent).toContain('My results');
    await fireEvent.click(btn);
    await tick();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('1 of 2 cards done');
    expect(dialog.textContent).toContain('1 of 1 answered correct');
    await fireEvent.click(dialog.querySelector('[data-act="close-results"]') as Element);
    await tick();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the locked topbar free of author chrome', () => {
    const { container } = mountReader();
    const right = container.querySelector('#topright') as HTMLElement;
    expect(right.textContent).not.toContain('Edit');
    expect(right.textContent).not.toContain('Study');
  });

  it('credits NoteBuilder with a small external link', () => {
    const { container } = mountReader();
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent?.includes('Made with NoteBuilder'));
    expect(link).toBeDefined();
    expect(link!.getAttribute('href')).toBe('https://github.com/YuZh98/notebuilder');
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toBe('noopener');
  });
});
