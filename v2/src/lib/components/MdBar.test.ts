import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/svelte';
import MdBar from './MdBar.svelte';
import CeText from './CeText.svelte';

const bar = () => document.getElementById('mdbar');

let extras: HTMLElement[] = [];

function addCeTextarea(): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.className = 'ce';
  document.body.appendChild(ta);
  extras.push(ta);
  return ta;
}

async function openCeTextEditor(container: HTMLElement): Promise<HTMLTextAreaElement> {
  const view = container.querySelector('.ceview');
  if (!view) throw new Error('view element not found');
  await fireEvent.click(view);
  const ta = container.querySelector<HTMLTextAreaElement>('textarea.ce');
  if (!ta) throw new Error('textarea not found');
  return ta;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const el of extras) el.remove();
  extras = [];
  vi.useRealTimers();
});

describe('MdBar', () => {
  it('appears when a .ce textarea gains focus', async () => {
    render(MdBar);
    const ta = addCeTextarea();

    expect(bar()).toBeNull();
    await act(() => ta.focus());
    expect(bar()).toBeInTheDocument();
  });

  it('hides after the grace period once the textarea blurs', async () => {
    render(MdBar);
    const ta = addCeTextarea();
    await act(() => ta.focus());

    await act(() => ta.blur());
    expect(bar()).toBeInTheDocument();

    await act(() => vi.advanceTimersByTime(150));
    expect(bar()).toBeNull();
  });

  it('stays visible when focus hops between .ce textareas', async () => {
    render(MdBar);
    const a = render(CeText, { props: { value: 'a', onchange: vi.fn() } });
    const b = render(CeText, { props: { value: 'b', onchange: vi.fn() } });

    await openCeTextEditor(a.container);
    const tb = await openCeTextEditor(b.container);
    // Focusing b's textarea blur-commits a's CeText, unmounting its textarea.
    expect(a.container.querySelector('textarea.ce')).toBeNull();
    expect(document.activeElement).toBe(tb);

    await act(() => vi.advanceTimersByTime(300));
    expect(bar()).toBeInTheDocument();
  });

  it('stays visible when focus moves from the textarea into a bar button', async () => {
    render(MdBar);
    const { container } = render(CeText, {
      props: { value: 'v', onchange: vi.fn() },
    });

    await openCeTextEditor(container);
    const btn = bar()?.querySelector<HTMLButtonElement>('button.mdbtn');
    expect(btn).not.toBeNull();

    await act(() => btn?.focus());
    expect(container.querySelector('textarea.ce')).toBeNull();

    await act(() => vi.advanceTimersByTime(300));
    expect(bar()).toBeInTheDocument();
  });

  it('hides after Enter-commit on a single-line CeText', async () => {
    render(MdBar);
    const { container } = render(CeText, {
      props: { value: 'v', onchange: vi.fn(), multiline: false },
    });

    const ta = await openCeTextEditor(container);
    expect(bar()).toBeInTheDocument();

    await fireEvent.keyDown(ta, { key: 'Enter' });
    expect(container.querySelector('textarea.ce')).toBeNull();

    await act(() => vi.advanceTimersByTime(150));
    expect(bar()).toBeNull();
  });

  it('keeps the bar when a padding click strands focus on it, and buttons no-op safely', async () => {
    render(MdBar);
    const { container } = render(CeText, {
      props: { value: 'v', onchange: vi.fn() },
    });

    const ta = await openCeTextEditor(container);
    const barEl = bar();
    expect(barEl).toBeInTheDocument();

    // Clicking bar padding (not a button/summary) is not pointerdown-cancelled,
    // so focus moves into the bar and CeText blur-commits, unmounting the textarea.
    await act(() => barEl?.focus());
    expect(container.querySelector('textarea.ce')).toBeNull();

    // Focus is inside the bar, so it must stay visible past the grace period.
    await act(() => vi.advanceTimersByTime(300));
    expect(bar()).toBeInTheDocument();

    // The stale target is detached: button clicks must not mutate it.
    const before = ta.value;
    const btn = bar()?.querySelector<HTMLButtonElement>('button.mdbtn');
    expect(btn).not.toBeNull();
    if (btn) await fireEvent.click(btn);
    expect(ta.value).toBe(before);
  });
});
