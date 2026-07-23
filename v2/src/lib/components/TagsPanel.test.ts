import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TagsPanel from './TagsPanel.svelte';

function baseProps(over: Record<string, unknown> = {}) {
  return {
    tags: ['algebra', 'geometry', 'pinned'],
    cardTags: null as string[] | null,
    ontoggle: vi.fn(),
    onrename: vi.fn(),
    ondelete: vi.fn(),
    onadd: vi.fn(),
    ongrip: vi.fn(),
    ...over,
  };
}

describe('TagsPanel — chips', () => {
  it('renders one chip per tag with the count in the header', () => {
    const { container } = render(TagsPanel, { props: baseProps() });
    expect(container.querySelectorAll('[data-tag]')).toHaveLength(3);
    expect(container.querySelector('h4')?.textContent).toContain('3');
  });

  it('shows an empty hint when no tags exist', () => {
    const { container } = render(TagsPanel, { props: baseProps({ tags: [] }) });
    expect(container.querySelectorAll('[data-tag]')).toHaveLength(0);
    expect(container.textContent).toContain('none yet');
  });

  it('marks chips carried by the selected card with .on', () => {
    const { container } = render(TagsPanel, { props: baseProps({ cardTags: ['algebra'] }) });
    expect(container.querySelector('[data-tag="algebra"]')?.classList.contains('on')).toBe(true);
    expect(container.querySelector('[data-tag="geometry"]')?.classList.contains('on')).toBe(false);
  });

  it('chip click with a selected card fires ontoggle', async () => {
    const props = baseProps({ cardTags: [] });
    const { container } = render(TagsPanel, { props });
    await fireEvent.click(container.querySelector('[data-tag="algebra"]')!);
    expect(props.ontoggle).toHaveBeenCalledWith('algebra');
  });

  it('chip click without a selected card does nothing', async () => {
    const props = baseProps({ cardTags: null });
    const { container } = render(TagsPanel, { props });
    await fireEvent.click(container.querySelector('[data-tag="algebra"]')!);
    expect(props.ontoggle).not.toHaveBeenCalled();
  });

  it('chips start the pointer drag, never native DnD', () => {
    const props = baseProps();
    const { container } = render(TagsPanel, { props });
    const chip = container.querySelector('[data-tag="algebra"]') as HTMLElement;
    expect(container.querySelector('[draggable="true"]')).toBeNull();
    fireEvent(
      chip,
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true }) as PointerEvent,
    );
    expect(props.ongrip).toHaveBeenCalledWith(
      'algebra',
      expect.anything(),
      expect.any(HTMLElement),
    );
  });
});

describe('TagsPanel — rename', () => {
  it('committing a changed name fires onrename(old, next)', async () => {
    const props = baseProps();
    const { container } = render(TagsPanel, { props });
    const input = container.querySelector('[data-tag="algebra"] input') as HTMLInputElement;
    input.value = 'linear-algebra';
    await fireEvent.change(input);
    expect(props.onrename).toHaveBeenCalledWith('algebra', 'linear-algebra');
  });

  it('the pinned chip is not renamable (v1 parity — the pin button owns it)', () => {
    const { container } = render(TagsPanel, { props: baseProps() });
    const input = container.querySelector('[data-tag="pinned"] input') as HTMLInputElement | null;
    expect(input === null || input.disabled).toBe(true);
  });
});

describe('TagsPanel — delete and add', () => {
  it('✕ fires ondelete for the chip', async () => {
    const props = baseProps();
    const { container } = render(TagsPanel, { props });
    await fireEvent.click(container.querySelector('[data-tag="geometry"] .tagx')!);
    expect(props.ondelete).toHaveBeenCalledWith('geometry');
  });

  it('the add input fires onadd with the trimmed name and clears', async () => {
    const props = baseProps();
    const { container } = render(TagsPanel, { props });
    const input = container.querySelector('.tag-add input') as HTMLInputElement;
    input.value = '  calculus ';
    await fireEvent.input(input);
    await fireEvent.click(container.querySelector('.tag-add button')!);
    expect(props.onadd).toHaveBeenCalledWith('calculus');
    expect(input.value).toBe('');
  });

  it('an empty add is ignored', async () => {
    const props = baseProps();
    const { container } = render(TagsPanel, { props });
    await fireEvent.click(container.querySelector('.tag-add button')!);
    expect(props.onadd).not.toHaveBeenCalled();
  });
});
