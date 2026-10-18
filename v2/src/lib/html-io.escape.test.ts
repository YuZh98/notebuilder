import { describe, it, expect } from 'vitest';
import { injectNotebook, extractNotebook } from './html-io';

// Shaped like the real Reader template: the payload <script> is followed by the app's own module
// script, so a payload that fails to close swallows the app and the shared file opens blank.
const TEMPLATE =
  '<!doctype html><html><head><meta charset="UTF-8"></head><body>' +
  '<div id="app"></div>' +
  '<script type="application/notebuilder+json" id="notebook-source"></script>' +
  '<script type="module" id="app-code">/* reader bundle */</script>' +
  '</body></html>';

const HOSTILE = [
  '<!--<script>alert(1)</script>',
  '</script>',
  '<!-- never closed <script',
  '<script><!--',
  '</SCRIPT >',
  '-->',
  'a & b > c < d',
  '  ',
];

function payload(code: string) {
  return {
    shared: true,
    docId: 'x',
    notebook: {
      name: 'Hostile strings',
      sections: [{ name: 'S', cards: [{ slots: [{ type: 'code', props: { code } }] }] }],
    },
  };
}

/**
 * Parse the full shared document with a real HTML tokenizer, the way a browser opens it. Under
 * vitest's jsdom environment DOMParser is jsdom's spec parser (same as `new JSDOM(html)`, minus an
 * untyped import).
 */
function parsed(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return {
    document,
    raw: extractNotebook(document),
    scripts: [...document.querySelectorAll('script')].map((s) => s.id),
  };
}

describe('injectNotebook — payload escaping survives a real HTML parser', () => {
  it.each(HOSTILE)('round-trips a code slot containing %j', (code) => {
    const data = payload(code);
    const { raw, scripts } = parsed(injectNotebook(TEMPLATE, JSON.stringify(data)));
    // The payload element closed where it should: the app script after it still exists.
    expect(scripts).toEqual(['notebook-source', 'app-code']);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(data);
  });

  it('keeps the app script alive after "<!--" then "<script" with no "-->" (the blank-file case)', () => {
    // Escaping only `</` left the tokenizer in script-data-double-escaped state here: the real
    // </script> stopped closing the payload, which then swallowed the app code that follows it.
    const data = payload('<!--<script>alert(1)</script> and later </script>');
    const html = injectNotebook(TEMPLATE, JSON.stringify(data));
    const { raw, scripts, document } = parsed(html);
    expect(scripts).toEqual(['notebook-source', 'app-code']);
    expect(document.getElementById('app-code')?.textContent).toBe('/* reader bundle */');
    expect(JSON.parse(raw!)).toEqual(data);
  });

  it('round-trips every hostile string in one notebook', () => {
    const data = payload(HOSTILE.join('\n'));
    const { raw, scripts } = parsed(injectNotebook(TEMPLATE, JSON.stringify(data)));
    expect(scripts).toEqual(['notebook-source', 'app-code']);
    expect(JSON.parse(raw!)).toEqual(data);
  });

  it('leaves no raw <, > or & in the embedded payload text', () => {
    const html = injectNotebook(TEMPLATE, JSON.stringify(payload('<!--<script>&</script>-->')));
    const inner = /id="notebook-source">([\s\S]*?)<\/script>/.exec(html)![1];
    expect(inner).not.toMatch(/[<>&]/);
    expect(inner).toContain('\\u003c!--\\u003cscript\\u003e\\u0026\\u003c/script\\u003e--\\u003e');
  });

  it('the string extractor agrees with the DOM extractor', () => {
    const json = JSON.stringify(payload('<!--<script>alert(1)</script></script>'));
    const html = injectNotebook(TEMPLATE, json);
    expect(JSON.parse(extractNotebook(html)!)).toEqual(JSON.parse(parsed(html).raw!));
  });

  it('still reads files shared before the fix (payloads escaped only as <\\/)', () => {
    const json = JSON.stringify(payload('a </script> b'));
    const legacy = TEMPLATE.replace(
      '<script type="application/notebuilder+json" id="notebook-source"></script>',
      `<script type="application/notebuilder+json" id="notebook-source">${json.replace(/<\//g, '<\\/')}</script>`,
    );
    expect(extractNotebook(legacy)).toBe(json);
    expect(parsed(legacy).raw).toBe(json);
  });
});
