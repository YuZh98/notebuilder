import { describe, it, expect } from 'vitest';
import { injectNotebook, extractNotebook } from './html-io';

const TEMPLATE =
  '<!doctype html><html><head><style>.x{}</style></head><body>' +
  '<div id="app"></div>' +
  '<script type="application/notebuilder+json" id="notebook-source"></script>' +
  '</body></html>';

describe('injectNotebook / extractNotebook round-trip', () => {
  it('injects a payload and extracts it back verbatim from the HTML string', () => {
    const json = JSON.stringify({ shared: true, notebook: { version: 1, name: 'N' } });
    const html = injectNotebook(TEMPLATE, json);
    expect(extractNotebook(html)).toBe(json);
  });

  it('survives a </script> sequence inside the payload (every < escaped as \\u003c)', () => {
    const json = JSON.stringify({ shared: true, note: 'a </script> b </SCRIPT>' });
    const html = injectNotebook(TEMPLATE, json);
    // the raw closing tag must be escaped so the browser never ends the script early
    expect(html).not.toContain('</script></script>');
    expect(html).toContain('\\u003c/script\\u003e');
    // the extracted text carries the JSON escapes; parsing restores the exact value
    expect(JSON.parse(extractNotebook(html)!)).toEqual(JSON.parse(json));
  });

  it('round-trips unicode and math content', () => {
    const json = JSON.stringify({ shared: false, notebook: { name: '数学 · ∑ x² · café 🎓 · $\\int$' } });
    const html = injectNotebook(TEMPLATE, json);
    expect(extractNotebook(html)).toBe(json);
  });

  it('replaces an existing payload rather than appending a second one', () => {
    const first = injectNotebook(TEMPLATE, '{"a":1}');
    const second = injectNotebook(first, '{"b":2}');
    expect(second.match(/id="notebook-source"/g)?.length).toBe(1);
    expect(extractNotebook(second)).toBe('{"b":2}');
  });

  it('throws when the template has no payload placeholder', () => {
    expect(() => injectNotebook('<html><body></body></html>', '{}')).toThrow();
  });
});

describe('extractNotebook', () => {
  it('returns null when no payload script is present (string)', () => {
    expect(extractNotebook('<html><body>nope</body></html>')).toBeNull();
  });

  it('reads the payload from a live Document', () => {
    const json = JSON.stringify({ shared: true, notebook: { name: 'Doc </script>' } });
    document.documentElement.innerHTML = injectNotebook(TEMPLATE, json)
      .replace(/^<!doctype html><html>/, '')
      .replace(/<\/html>$/, '');
    expect(JSON.parse(extractNotebook(document)!)).toEqual(JSON.parse(json));
  });

  it('returns null from a Document when the script type is wrong', () => {
    document.documentElement.innerHTML =
      '<body><script type="text/plain" id="notebook-source">{"a":1}</script></body>';
    expect(extractNotebook(document)).toBeNull();
  });
});
