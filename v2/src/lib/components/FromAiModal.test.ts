import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import FromAiModal from './FromAiModal.svelte';
import { buildAiPrompt, AI_EXAMPLE } from '../ai-prompt';

function setClipboard(writeText: ((t: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value: writeText ? { writeText } : undefined, configurable: true });
}

const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel)!;
const act = (root: ParentNode, name: string) => q<HTMLButtonElement>(root, `[data-act="${name}"]`);

function mount() {
  const onclose = vi.fn();
  const oncreate = vi.fn();
  const oncopied = vi.fn();
  const { container } = render(FromAiModal, { props: { onclose, oncreate, oncopied } });
  return { container, onclose, oncreate, oncopied };
}

async function paste(container: HTMLElement, text: string) {
  await fireEvent.input(q<HTMLTextAreaElement>(container, '[data-fa="reply"]'), { target: { value: text } });
}

afterEach(() => {
  setClipboard(undefined);
  delete (document as unknown as { execCommand?: unknown }).execCommand;
  vi.restoreAllMocks();
});

describe('FromAiModal — step 1: the prompt', () => {
  it('is a labelled modal dialog that focuses the topic field', () => {
    const { container } = mount();
    const dialog = q(container, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent).toMatch(/from AI/);
    expect(document.activeElement).toBe(q(container, '[data-fa="topic"]'));
  });

  it('Copy prompt is disabled until there is a topic', async () => {
    const { container } = mount();
    expect(act(container, 'copy-prompt').disabled).toBe(true);
    await fireEvent.input(q(container, '[data-fa="topic"]'), { target: { value: '   ' } });
    expect(act(container, 'copy-prompt').disabled).toBe(true);
    await fireEvent.input(q(container, '[data-fa="topic"]'), { target: { value: 'Fractions' } });
    expect(act(container, 'copy-prompt').disabled).toBe(false);
  });

  it('copies the prompt built from topic, audience and card count', async () => {
    const writeText = vi.fn((_t: string) => Promise.resolve());
    setClipboard(writeText);
    const { container, oncopied } = mount();
    await fireEvent.input(q(container, '[data-fa="topic"]'), { target: { value: 'Fractions' } });
    await fireEvent.input(q(container, '[data-fa="audience"]'), { target: { value: 'grade 5' } });
    await fireEvent.input(q(container, '[data-fa="cards"]'), { target: { value: '9' } });
    await fireEvent.click(act(container, 'copy-prompt'));
    await tick();
    const expected = buildAiPrompt({ topic: 'Fractions', audience: 'grade 5', cards: 9 });
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(oncopied).toHaveBeenCalledWith('prompt', expected);
    expect(act(container, 'copy-prompt').textContent).toContain('copied');
    // any change makes the copied prompt stale
    await fireEvent.input(q(container, '[data-fa="audience"]'), { target: { value: 'grade 6' } });
    expect(act(container, 'copy-prompt').textContent?.trim()).toBe('Copy prompt');
  });

  it('shows the prompt for a manual copy when the clipboard is unavailable', async () => {
    setClipboard(undefined);
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    const { container } = mount();
    await fireEvent.input(q(container, '[data-fa="topic"]'), { target: { value: 'Fractions' } });
    await fireEvent.click(act(container, 'copy-prompt'));
    await tick();
    await tick();
    const ta = q<HTMLTextAreaElement>(container, '[data-fa="prompt"]');
    expect(ta.value).toBe(buildAiPrompt({ topic: 'Fractions', audience: '' }));
    expect(container.textContent).toMatch(/Couldn't reach the clipboard/);
  });

  it('Show prompt toggles the prompt preview', async () => {
    const { container } = mount();
    expect(container.querySelector('[data-fa="prompt"]')).toBeNull();
    await fireEvent.click(act(container, 'toggle-prompt'));
    expect(container.querySelector('[data-fa="prompt"]')).not.toBeNull();
    expect(act(container, 'toggle-prompt').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('FromAiModal — step 2: check and create', () => {
  it('Check and Create start disabled', () => {
    const { container } = mount();
    expect(act(container, 'check').disabled).toBe(true);
    expect(act(container, 'create').disabled).toBe(true);
  });

  it('a broken reply shows the report inline and keeps Create disabled', async () => {
    const { container, oncreate } = mount();
    await paste(container, 'Here you go:\n```json\n{"version": 2, "notebook": {"name": "N",}}\n```');
    await fireEvent.click(act(container, 'check'));
    const report = q(container, 'section.import-report.inline');
    expect(report.textContent).toMatch(/Trailing comma/);
    expect(report.textContent).toContain('line 3, column');
    expect(act(container, 'create').disabled).toBe(true);
    await fireEvent.click(act(container, 'create'));
    expect(oncreate).not.toHaveBeenCalled();
  });

  it('validation problems show with hints', async () => {
    const { container } = mount();
    const bad = structuredClone(AI_EXAMPLE) as unknown as { notebook: { sections: { cards: { slots: { type: string }[] }[] }[] } };
    bad.notebook.sections[0].cards[0].slots[0].type = 'markdown';
    await paste(container, JSON.stringify(bad));
    await fireEvent.click(act(container, 'check'));
    expect(q(container, '.import-report').textContent).toContain('Did you mean "text"?');
    expect(act(container, 'create').disabled).toBe(true);
  });

  it('a good reply shows a summary and Create hands the JSON to oncreate', async () => {
    const { container, oncreate } = mount();
    await paste(container, 'Sure!\n```json\n' + JSON.stringify(AI_EXAMPLE, null, 2) + '\n```\nEnjoy.');
    await fireEvent.click(act(container, 'check'));
    const summary = q(container, '[data-fa="summary"]');
    expect(summary.textContent).toContain('Compound Growth');
    expect(summary.textContent).toContain('1 section');
    expect(summary.textContent).toContain('5 cards');
    expect(summary.textContent).toContain('1 flashcard');
    expect(container.querySelector('.import-report')).toBeNull();
    expect(act(container, 'create').disabled).toBe(false);
    await fireEvent.click(act(container, 'create'));
    expect(oncreate).toHaveBeenCalledWith(AI_EXAMPLE);
  });

  it('warnings alone still allow Create and can be dismissed', async () => {
    const { container, oncreate } = mount();
    const warn = structuredClone(AI_EXAMPLE) as unknown as { notebook: { sections: { cards: Record<string, unknown>[] }[] } };
    warn.notebook.sections[0].cards[0].title = 'A card title';
    await paste(container, JSON.stringify(warn));
    await fireEvent.click(act(container, 'check'));
    expect(q(container, '[data-fa="summary"]')).not.toBeNull();
    expect(q(container, '.import-report').textContent).toContain('not a NoteBuilder field');
    const close = [...q(container, '.import-report').querySelectorAll('button')].find((b) => b.textContent === 'Close')!;
    await fireEvent.click(close);
    expect(container.querySelector('.import-report')).toBeNull();
    await fireEvent.click(act(container, 'create'));
    expect(oncreate).toHaveBeenCalledOnce();
  });

  it('editing the reply after a check clears the stale result', async () => {
    const { container } = mount();
    await paste(container, JSON.stringify(AI_EXAMPLE));
    await fireEvent.click(act(container, 'check'));
    expect(act(container, 'create').disabled).toBe(false);
    await paste(container, JSON.stringify(AI_EXAMPLE) + 'x');
    expect(container.querySelector('[data-fa="summary"]')).toBeNull();
    expect(act(container, 'create').disabled).toBe(true);
  });

  it('Cancel and Escape call onclose', async () => {
    const { container, onclose } = mount();
    await fireEvent.click(act(container, 'cancel'));
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(2);
  });
});
