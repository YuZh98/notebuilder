import { describe, it, expect } from 'vitest';
import { renderMarkdown, renderInline, interp, escapeHtml } from './markdown';
import type { Scope } from './variable-graph';

describe('escapeHtml', () => {
  it('escapes &, <, >, "', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe('interp', () => {
  it('substitutes a present scope key', () => {
    expect(interp('v={{a}}', { a: 2 })).toBe('v=2');
  });

  it('substitutes booleans', () => {
    expect(interp('{{ok}}', { ok: true })).toBe('true');
  });

  it('renders ? for a missing key (v1 parity)', () => {
    expect(interp('v={{a}}', {})).toBe('v=?');
    expect(interp('v={{a}}')).toBe('v=?');
  });

  it('substitutes raw BEFORE the pipeline, so the pipeline escapes it', () => {
    const scope = { name: '<img src=x onerror=alert(1)>' } as unknown as Scope;
    const out = renderMarkdown('{{name}}', scope);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
});

describe('renderMarkdown — headings', () => {
  it('maps # to h2 and ### to h4 (v1 offset)', () => {
    expect(renderMarkdown('# T')).toBe('<h2>T</h2>');
    expect(renderMarkdown('## T')).toBe('<h3>T</h3>');
    expect(renderMarkdown('### T')).toBe('<h4>T</h4>');
  });
});

describe('renderMarkdown — GFM tables', () => {
  it('renders header and body cells', () => {
    const out = renderMarkdown('|a|b|\n|-|-|\n|1|2|');
    expect(out).toContain('<table class="md-table">');
    expect(out).toContain('<th>a</th>');
    expect(out).toContain('<th>b</th>');
    expect(out).toContain('<td>1</td>');
    expect(out).toContain('<td>2</td>');
  });

  it('applies column alignment from the separator row', () => {
    const out = renderMarkdown('|a|b|\n|:-:|-|\n|1|2|');
    expect(out).toContain('<th style="text-align:center">a</th>');
    expect(out).toContain('<td style="text-align:center">1</td>');
    expect(out).toContain('<th>b</th>');
  });

  it('supports right and left alignment', () => {
    const out = renderMarkdown('|a|b|\n|--:|:--|\n|1|2|');
    expect(out).toContain('<th style="text-align:right">a</th>');
    expect(out).toContain('<th style="text-align:left">b</th>');
  });

  it('rejects single-column separators (v1 isSep requires two cells)', () => {
    expect(renderMarkdown('|a|\n|:-:|\n|1|')).not.toContain('<table');
  });
});

describe('renderMarkdown — block elements', () => {
  it('renders blockquote from post-escape &gt;', () => {
    expect(renderMarkdown('> q')).toBe('<blockquote>q</blockquote>');
  });

  it('groups consecutive - items into one ul', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('renders ordered lists from numbered lines', () => {
    expect(renderMarkdown('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  it('closes a list when a plain line follows', () => {
    expect(renderMarkdown('- a\np')).toBe('<ul><li>a</li></ul><div>p</div>');
  });

  it('wraps plain lines in div and empty lines become br', () => {
    expect(renderMarkdown('a\n\nb')).toBe('<div>a</div><br><div>b</div>');
  });

  it('preserves leading indentation as &nbsp;', () => {
    expect(renderMarkdown('  x')).toBe('<div>&nbsp;&nbsp;x</div>');
  });
});

describe('renderMarkdown — inline marks', () => {
  it('renders bold as <b>', () => {
    expect(renderMarkdown('**bold**')).toBe('<div><b>bold</b></div>');
  });

  it('renders italic as <i>', () => {
    expect(renderMarkdown('*italic*')).toBe('<div><i>italic</i></div>');
    expect(renderMarkdown('_italic_')).toBe('<div><i>italic</i></div>');
  });

  it('renders strikethrough', () => {
    expect(renderMarkdown('~~x~~')).toBe('<div><s>x</s></div>');
  });

  it('renders highlight mark', () => {
    expect(renderMarkdown('==x==')).toBe('<div><mark>x</mark></div>');
  });

  it('renders color spans from the palette', () => {
    expect(renderMarkdown('{c:accent}x{/c}')).toBe(
      '<div><span style="color:var(--accent)">x</span></div>'
    );
  });

  it('falls back to ink for a bad palette key', () => {
    expect(renderMarkdown('{c:hotpink}x{/c}')).toBe(
      '<div><span style="color:var(--ink)">x</span></div>'
    );
  });

  it('renders bg marks with accent2 fallback', () => {
    expect(renderMarkdown('{bg:good}x{/bg}')).toContain('var(--good)');
    expect(renderMarkdown('{bg:zzz}x{/bg}')).toContain('var(--accent2)');
  });
});

describe('renderMarkdown — links', () => {
  it('renders allowed schemes with target and rel', () => {
    expect(renderMarkdown('[t](https://x)')).toBe(
      '<div><a href="https://x" target="_blank" rel="noopener noreferrer">t</a></div>'
    );
  });

  it('allows mailto, hash and relative hrefs', () => {
    expect(renderMarkdown('[m](mailto:a@b.c)')).toContain('href="mailto:a@b.c"');
    expect(renderMarkdown('[h](#frag)')).toContain('href="#frag"');
    expect(renderMarkdown('[r](/path)')).toContain('href="/path"');
  });

  it('rewrites disallowed schemes to #', () => {
    const out = renderMarkdown('[t](javascript:alert(1))');
    expect(out).toContain('href="#"');
    expect(out).not.toContain('javascript:');
  });
});

describe('renderMarkdown — math', () => {
  it('renders inline math via KaTeX', () => {
    expect(renderMarkdown('$x^2$')).toContain('class="katex"');
  });

  it('renders display math with katex-display', () => {
    expect(renderMarkdown('$$x^2$$')).toContain('katex-display');
  });

  it('ignores $ with space-adjacent content (not math)', () => {
    const out = renderMarkdown('a $ b $ c');
    expect(out).not.toContain('katex');
  });

  it('does not throw on invalid TeX and emits no raw script', () => {
    let out = '';
    expect(() => {
      out = renderMarkdown('$\\undefinedcmd{$');
    }).not.toThrow();
    expect(/katex|math-err/.test(out)).toBe(true);
    expect(out).not.toContain('<script');
  });

  it('math content cannot break out into HTML', () => {
    expect(renderMarkdown('$x<script>$')).not.toContain('<script');
  });
});

describe('renderMarkdown — escape-first', () => {
  it('escapes author template HTML', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });

  it('code spans keep literal escaped content', () => {
    expect(renderMarkdown('`<b>`')).toBe('<div><code>&lt;b&gt;</code></div>');
  });

  it('renders inline code', () => {
    expect(renderMarkdown('`code`')).toBe('<div><code>code</code></div>');
  });
});

describe('renderMarkdown — interpolation through the pipeline', () => {
  it('interpolates a present scope key', () => {
    expect(renderMarkdown('{{key}}', { key: 2 })).toBe('<div>2</div>');
  });

  it('renders ? for an absent scope key (v1 parity)', () => {
    expect(renderMarkdown('{{key}}', {})).toBe('<div>?</div>');
  });
});

describe('renderInline', () => {
  it('turns newlines into <br> and emits no block elements', () => {
    expect(renderInline('a\nb')).toBe('a<br>b');
    expect(renderInline('# T')).toBe('# T');
    expect(renderInline('- a')).toBe('- a');
  });

  it('applies inline marks and math', () => {
    expect(renderInline('**b**')).toBe('<b>b</b>');
    expect(renderInline('$x^2$')).toContain('class="katex"');
  });

  it('interpolates scope', () => {
    expect(renderInline('v={{a}}', { a: 3 })).toBe('v=3');
    expect(renderInline('v={{a}}')).toBe('v=?');
  });
});
