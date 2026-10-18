import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ImportReport from './ImportReport.svelte';
import { checkNotebookText, buildFixRequest, type HintedIssue } from '../import-hints';

function doc(slots: unknown[], card: Record<string, unknown> = {}): string {
  return JSON.stringify({ version: 2, notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots, ...card }] }] } });
}

function report() {
  return checkNotebookText(doc([{ type: 'quiz', props: {} }, { type: 'text', props: { text: 'see {{r}}' } }], { w: 2 }));
}

function setClipboard(writeText: ((t: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

afterEach(() => {
  setClipboard(undefined);
  delete (document as unknown as { execCommand?: unknown }).execCommand; // drop the per-test stub
  vi.restoreAllMocks();
});

describe('ImportReport', () => {
  it('lists every error and warning with location, message and fix hint', () => {
    const { errors, warnings } = report();
    const { container } = render(ImportReport, { props: { errors, warnings, onclose: vi.fn() } });
    const errItems = container.querySelectorAll('.ir-list.error .ir-item');
    const warnItems = container.querySelectorAll('.ir-list.warning .ir-item');
    expect(errItems).toHaveLength(errors.length);
    expect(warnItems).toHaveLength(warnings.length);
    const unknown = container.querySelector('.ir-item[data-code="slot-type-unknown"]')!;
    expect(unknown.querySelector('.ir-where')!.textContent).toBe('section 1 › card 1 › slot 1 › type');
    expect(unknown.querySelector('.ir-where')!.getAttribute('title')).toBe('notebook.sections[0].cards[0].slots[0].type');
    expect(unknown.querySelector('.ir-what')!.textContent).toBe('has unknown slot type: quiz');
    expect(unknown.querySelector('.ir-hint')!.textContent).toContain('Did you mean "choice"?');
    const cross = container.querySelector('.ir-item[data-code="cross-card-read"]')!;
    expect(cross.textContent).toContain('variables never cross cards');
    expect(container.querySelector('.ir-title')!.textContent).toMatch(/can't be imported yet: 2 problems/);
  });

  it('shows the excerpt of a syntax error', () => {
    const { errors } = checkNotebookText('{\n  "a": 1,\n}');
    const { container } = render(ImportReport, { props: { errors, onclose: vi.fn() } });
    expect(container.querySelector('.ir-where')!.textContent).toBe('line 2, column 9');
    expect(container.querySelector('.ir-excerpt')!.textContent).toContain('^');
  });

  it('copies the fix request for the AI and reports it', async () => {
    const writeText = vi.fn((_t: string) => Promise.resolve());
    setClipboard(writeText);
    const oncopied = vi.fn();
    const { errors, warnings } = report();
    const { container } = render(ImportReport, { props: { errors, warnings, onclose: vi.fn(), oncopied } });
    await fireEvent.click(button(container, 'Copy fix request for your AI')!);
    await tick();
    const expected = buildFixRequest(errors, warnings);
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(oncopied).toHaveBeenCalledWith(expected);
    expect(button(container, 'Copied ✓')).toBeDefined();
  });

  it('falls back to showing the text when no clipboard works', async () => {
    setClipboard(undefined);
    (document as unknown as { execCommand: (c: string) => boolean }).execCommand = vi.fn(() => false);
    const { errors } = report();
    const { container } = render(ImportReport, { props: { errors, onclose: vi.fn() } });
    await fireEvent.click(button(container, 'Copy fix request')!);
    await tick();
    await tick();
    const ta = container.querySelector<HTMLTextAreaElement>('.ir-manual textarea');
    expect(ta).not.toBeNull();
    expect(ta!.value).toBe(buildFixRequest(errors));
  });

  it('uses the legacy copy path when the Clipboard API is missing', async () => {
    setClipboard(undefined);
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: (c: string) => boolean }).execCommand = exec;
    const { errors } = report();
    const { container } = render(ImportReport, { props: { errors, onclose: vi.fn() } });
    await fireEvent.click(button(container, 'Copy fix request')!);
    await tick();
    expect(exec).toHaveBeenCalledWith('copy');
    expect(button(container, 'Copied ✓')).toBeDefined();
    expect(document.querySelectorAll('textarea[readonly]').length).toBe(0); // temp textarea removed
  });

  it('Close and Escape call onclose in modal mode', async () => {
    const onclose = vi.fn();
    const { container } = render(ImportReport, { props: { errors: report().errors, onclose } });
    expect(container.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    await fireEvent.click(button(container, 'Close')!);
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(2);
  });

  it('inline mode renders no modal and ignores Escape', async () => {
    const onclose = vi.fn();
    const { container } = render(ImportReport, { props: { errors: report().errors, inline: true, onclose } });
    expect(container.querySelector('.modal')).toBeNull();
    expect(container.querySelector('section.import-report.inline')).not.toBeNull();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.click(button(container, 'Close')!);
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('caps a very long list but keeps the count', () => {
    const many: HintedIssue[] = Array.from({ length: 70 }, (_, k) => ({
      code: 'wrong-type',
      path: `notebook.sections[${k}]`,
      message: `sections[${k}] must be an object`,
    }));
    const { container } = render(ImportReport, { props: { errors: many, onclose: vi.fn() } });
    expect(container.querySelectorAll('.ir-list.error .ir-item')).toHaveLength(50);
    expect(container.textContent).toContain('…and 20 more');
  });

  it('a warnings-only report says it will still load', () => {
    const { warnings } = checkNotebookText(doc([{ type: 'text', props: { text: '{{r}}' } }]));
    const { container } = render(ImportReport, { props: { errors: [], warnings, onclose: vi.fn() } });
    expect(container.querySelector('.ir-title')!.textContent).toBe('1 warning');
    expect(container.textContent).toContain('It will load, but');
  });
});
