import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ResultsModal from './ResultsModal.svelte';
import { copyText } from '../clipboard';
import type { Notebook } from '../types';

// A pass-through spy: the dialog must copy through the shared helper, not a private copy of it.
vi.mock('../clipboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../clipboard')>();
  return { copyText: vi.fn(actual.copyText) };
});

function nb(): Notebook {
  return {
    id: 'nb_x',
    name: 'Quiz: Cells',
    createdAt: '',
    updatedAt: '',
    sections: [
      {
        id: 's1',
        notebookId: 'nb_x',
        name: 'Cells',
        position: 0,
        cards: [
          { id: 'c1', sectionId: 's1', position: 0, slots: [{ id: 'q1', type: 'choice', props: { options: ['a', 'b'], answer: [0] } }] },
          { id: 'c2', sectionId: 's1', position: 1, slots: [{ id: 'q2', type: 'choice', props: { options: ['a', 'b'], answer: [1] } }] },
        ],
      },
    ],
  };
}

const state = { c1: { q1: { selected: [0], submitted: true } } };

function setup(extra: Record<string, unknown> = {}) {
  const onclose = vi.fn();
  const r = render(ResultsModal, { props: { notebook: nb(), readerState: state, docId: 'nb_x', onclose, ...extra } });
  return { ...r, onclose };
}

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (document as { execCommand?: unknown }).execCommand; // drop the own-property stub
});

describe('ResultsModal', () => {
  it('summarises progress and graded answers', () => {
    const { container } = setup();
    const text = container.textContent ?? '';
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text).toContain('1 of 2 cards done');
    expect(text).toContain('1 of 1 answered correct');
    expect(text).toContain('Cells');
  });

  it('shows practice tries on their own row, apart from the graded questions', () => {
    const book = nb();
    book.sections[0].cards.push({
      id: 'c3',
      sectionId: 's1',
      position: 2,
      slots: [{ id: 'p3', type: 'problem', props: { prompt: 'x', params: [], answer: '6', tol: 0, need: 1 } }],
    });
    const { container } = setup({ notebook: book, readerState: { ...state, c3: { p3: { seed: 1, correct: 2, attempts: 5 } } } });
    const graded = container.querySelector('[data-results="graded"]')?.textContent ?? '';
    expect(graded).toContain('2 of 2 answered correct');
    expect(graded).toContain('3 questions');
    expect(container.querySelector('[data-results="practice"]')?.textContent).toContain('2 correct in 5 tries');
  });

  it('has no practice row when nothing was practised', () => {
    expect(setup().container.querySelector('[data-results="practice"]')).toBeNull();
  });

  it('copies the plain-text summary, including the optional name', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const { container } = setup();
    const name = container.querySelector('input[data-results="name"]') as HTMLInputElement;
    await fireEvent.input(name, { target: { value: 'Ada' } });
    await fireEvent.click(container.querySelector('[data-act="copy-results"]') as Element);
    await tick();
    expect(writeText).toHaveBeenCalledOnce();
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('Student: Ada');
    expect(copied).toContain('Quiz: Cells');
  });

  it('copies through the shared clipboard helper', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    const { container } = setup();
    await fireEvent.click(container.querySelector('[data-act="copy-results"]') as Element);
    await tick();
    expect(vi.mocked(copyText)).toHaveBeenCalledOnce();
    expect(vi.mocked(copyText).mock.calls[0][0]).toContain('Quiz: Cells');
  });

  it('falls back to showing selectable text when the clipboard is unavailable', async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => false);
    const { container } = setup();
    await fireEvent.click(container.querySelector('[data-act="copy-results"]') as Element);
    await tick();
    await tick();
    const fallback = container.querySelector('textarea[data-results="text"]') as HTMLTextAreaElement;
    expect(fallback).not.toBeNull();
    expect(fallback.value).toContain('Quiz: Cells');
    // the selectable text follows later edits (e.g. typing the name after a failed copy)
    await fireEvent.input(container.querySelector('input[data-results="name"]') as Element, { target: { value: 'Bo' } });
    expect(fallback.value).toContain('Student: Bo');
  });

  it('downloads a .json file via a blob — no network', async () => {
    const parts: BlobPart[][] = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      'Blob',
      class extends RealBlob {
        constructor(p: BlobPart[] = [], o?: BlobPropertyBag) {
          super(p, o);
          parts.push(p);
        }
      },
    );
    URL.createObjectURL = () => 'blob:results';
    URL.revokeObjectURL = () => {};
    let downloadName = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = setup();
    await fireEvent.input(container.querySelector('input[data-results="name"]') as Element, {
      target: { value: 'Ada / L' },
    });
    await fireEvent.click(container.querySelector('[data-act="download-results"]') as Element);

    expect(click).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(downloadName).toMatch(/\.json$/);
    expect(downloadName).not.toContain('/');
    expect(downloadName).not.toContain(':');
    const json = JSON.parse(parts[0][0] as string);
    expect(json.format).toBe('notebuilder-results');
    expect(json.student).toBe('Ada / L');
    expect(json.docId).toBe('nb_x');
    expect(json.graded).toEqual({ correct: 1, answered: 1, items: 2 });
  });

  it('closes from the close button, the backdrop and Escape', async () => {
    const { container, onclose } = setup();
    await fireEvent.click(container.querySelector('[data-act="close-results"]') as Element);
    expect(onclose).toHaveBeenCalledTimes(1);
    await fireEvent.click(container.querySelector('.results-modal') as Element);
    expect(onclose).toHaveBeenCalledTimes(2);
    await fireEvent.keyDown(container.querySelector('[role="dialog"]') as Element, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(3);
  });

  it('offers Reset my progress only when given a handler', async () => {
    expect(setup().container.querySelector('[data-act="reset-progress"]')).toBeNull();
    const onreset = vi.fn();
    const { container } = setup({ onreset });
    await fireEvent.click(container.querySelector('[data-act="reset-progress"]') as Element);
    expect(onreset).toHaveBeenCalledOnce();
  });
});
