import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('escapes HTML in interpolated scope values (stored XSS)', () => {
    const out = renderMarkdown('{{name}}', { name: '<img src=x onerror=alert(1)>' });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('escapes author template HTML', () => {
    expect(renderMarkdown('<script>alert(1)</script>', {})).not.toContain('<script>');
    expect(renderMarkdown('<script>', {})).toContain('&lt;script&gt;');
  });

  it('renders bold', () => {
    expect(renderMarkdown('**bold**', {})).toBe('<strong>bold</strong>');
  });

  it('renders italic', () => {
    expect(renderMarkdown('*italic*', {})).toBe('<em>italic</em>');
  });

  it('renders inline code', () => {
    expect(renderMarkdown('`code`', {})).toBe('<code>code</code>');
  });

  it('renders line breaks', () => {
    expect(renderMarkdown('a\nb', {})).toBe('a<br>b');
  });

  it('interpolates a present scope key', () => {
    expect(renderMarkdown('{{key}}', { key: 'val' })).toBe('val');
  });

  it('leaves an absent scope key literal', () => {
    expect(renderMarkdown('{{key}}', {})).toBe('{{key}}');
  });
});
