import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ImportReport from './ImportReport.svelte';
import type { HintedIssue } from '../import-hints';

// A held-back Share/Export lists problems in the open notebook: no AI wrote them, so the
// report drops its "fix request for your AI" and Close becomes the one (focused) action.
const errors: HintedIssue[] = [
  {
    code: 'slot-props',
    path: 'notebook.sections[1].cards[0].slots[0].props',
    message: 'sections[1].cards[0].slots[0]: problem slot — parameter "e": "e" is reserved — pick another name',
    subject: 'problem',
  },
];

describe('ImportReport fixRequest={false}', () => {
  it('shows the title and every problem with its path, but no AI fix request', () => {
    const { container } = render(ImportReport, {
      props: { errors, title: 'Fix this problem before sharing', fixRequest: false, onclose: vi.fn() },
    });
    expect(container.querySelector('.ir-title')!.textContent).toBe('Fix this problem before sharing');
    expect(container.querySelector('.ir-where')!.textContent).toBe('section 2 › card 1 › slot 1 › props');
    expect(container.querySelector('.ir-what')!.textContent).toMatch(/"e" is reserved/);
    expect(container.querySelector('[data-act="copy-fix"]')).toBeNull();
  });

  it('focuses Close, which closes', async () => {
    const onclose = vi.fn();
    const { container } = render(ImportReport, { props: { errors, fixRequest: false, onclose } });
    const close = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Close')!;
    expect(document.activeElement).toBe(close);
    expect(close.classList.contains('primary')).toBe(true);
    await fireEvent.click(close);
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('keeps the fix request by default', () => {
    const { container } = render(ImportReport, { props: { errors, onclose: vi.fn() } });
    const copy = container.querySelector('[data-act="copy-fix"]');
    expect(copy).toBeTruthy();
    expect(document.activeElement).toBe(copy);
  });
});
