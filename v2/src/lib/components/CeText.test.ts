import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/svelte';
import CeText from './CeText.svelte';
import TextEdit from '../slots/TextEdit.svelte';

async function openEditor(container: HTMLElement): Promise<HTMLTextAreaElement> {
  const view = container.querySelector('.ceview');
  if (!view) throw new Error('view element not found');
  await fireEvent.click(view);
  const ta = container.querySelector<HTMLTextAreaElement>('textarea.ce');
  if (!ta) throw new Error('textarea not found');
  return ta;
}

describe('CeText', () => {
  it('commits exactly once on blur with the edited value', async () => {
    const onchange = vi.fn();
    const { container } = render(CeText, { props: { value: 'old', onchange } });

    const ta = await openEditor(container);
    await fireEvent.input(ta, { target: { value: 'new' } });
    await act(() => ta.blur());

    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledWith('new');
    expect(container.querySelector('textarea.ce')).toBeNull();
  });

  it('does not commit when the value is unchanged', async () => {
    const onchange = vi.fn();
    const { container } = render(CeText, { props: { value: 'same', onchange } });

    const ta = await openEditor(container);
    await act(() => ta.blur());

    expect(onchange).not.toHaveBeenCalled();
    expect(container.querySelector('.ceview')).toBeInTheDocument();
  });

  it('discards the draft on Escape', async () => {
    const onchange = vi.fn();
    const { container } = render(CeText, { props: { value: 'keep', onchange } });

    const ta = await openEditor(container);
    await fireEvent.input(ta, { target: { value: 'discard me' } });
    await fireEvent.keyDown(ta, { key: 'Escape' });

    expect(onchange).not.toHaveBeenCalled();
    expect(container.querySelector('textarea.ce')).toBeNull();
    expect(container.querySelector('.ceview')?.textContent).toContain('keep');
  });

  it('single-line: Enter commits once and a second edit session works', async () => {
    const onchange = vi.fn();
    const { container, rerender } = render(CeText, {
      props: { value: 'a', onchange, multiline: false },
    });

    let ta = await openEditor(container);
    await fireEvent.input(ta, { target: { value: 'b' } });
    await fireEvent.keyDown(ta, { key: 'Enter' });

    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenLastCalledWith('b');
    expect(container.querySelector('textarea.ce')).toBeNull();

    await rerender({ value: 'b' });
    ta = await openEditor(container);
    await fireEvent.input(ta, { target: { value: 'c' } });
    await fireEvent.keyDown(ta, { key: 'Enter' });

    expect(onchange).toHaveBeenCalledTimes(2);
    expect(onchange).toHaveBeenLastCalledWith('c');
    expect(container.querySelector('textarea.ce')).toBeNull();
  });

  it('multiline: Enter stays in the editor without committing', async () => {
    const onchange = vi.fn();
    const { container } = render(CeText, { props: { value: 'line', onchange } });

    const ta = await openEditor(container);
    const defaultAllowed = await fireEvent.keyDown(ta, { key: 'Enter' });

    expect(defaultAllowed).toBe(true);
    expect(onchange).not.toHaveBeenCalled();
    expect(container.querySelector('textarea.ce')).toBeInTheDocument();
  });

  it('shows the placeholder when the value is empty', () => {
    const { container } = render(CeText, {
      props: { value: '', onchange: vi.fn(), placeholder: 'Write markdown…' },
    });

    const view = container.querySelector('.ceview.ce-placeholder');
    expect(view).toBeInTheDocument();
    expect(view).toHaveTextContent('Write markdown…');
  });

  it('appends viewClass to the view element', () => {
    const { container } = render(CeText, {
      props: { value: 'x', onchange: vi.fn(), viewClass: 'slot text' },
    });

    expect(container.querySelector('.ceview.slot.text')).toBeInTheDocument();
  });
});

describe('TextEdit view branch', () => {
  it('renders headings inside .slot.text so v1 heading scale applies', () => {
    // The markdown renderer shifts levels: '#' -> h2, '##' -> h3 (page owns h1).
    const { container } = render(TextEdit, {
      props: { props: { text: '# Heading\n## Sub' }, onUpdate: vi.fn() },
    });

    const h2 = container.querySelector('.slot.text h2');
    expect(h2).toBeInTheDocument();
    expect(h2).toHaveTextContent('Heading');
    expect(container.querySelector('.slot.text h3')).toHaveTextContent('Sub');
  });

  it('interpolates card scope variables in the rendered view', () => {
    const { container } = render(TextEdit, {
      props: { props: { text: 'x is {{x}}' }, onUpdate: vi.fn(), scope: { x: 42 } },
    });

    expect(container.querySelector('.slot.text')).toHaveTextContent('x is 42');
  });
});
