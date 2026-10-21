import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from './clipboard';

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

afterEach(() => {
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (document as { execCommand?: unknown }).execCommand; // drop the own-property stub
});

const leftovers = () => document.querySelectorAll('textarea').length;

describe('copyText', () => {
  it('uses the async Clipboard API when it is there', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    document.execCommand = vi.fn(() => true);
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when the API refuses (file:// pages, unfocused windows)', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    let selected = '';
    document.execCommand = vi.fn(() => {
      selected = document.querySelector('textarea')?.value ?? '';
      return true;
    });
    expect(await copyText('fallback text')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(selected).toBe('fallback text');
    expect(leftovers()).toBe(0);
  });

  it('reports false when neither path works, so the caller can show the text instead', async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => false);
    expect(await copyText('x')).toBe(false);
    expect(leftovers()).toBe(0);
  });

  it('reports false without execCommand at all', async () => {
    setClipboard(undefined);
    expect(await copyText('x')).toBe(false);
    expect(leftovers()).toBe(0);
  });

  it('never leaves its hidden textarea behind, even when execCommand throws', async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => {
      throw new Error('SecurityError');
    });
    expect(await copyText('x')).toBe(false);
    expect(leftovers()).toBe(0);
  });
});
