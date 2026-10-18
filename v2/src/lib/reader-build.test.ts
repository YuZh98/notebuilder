// The shared Reader file must be self-contained: no third-party font request (privacy — every
// student's IP would reach Google — and offline it only logs an error). build-reader.mjs strips
// remote @import rules from the inlined CSS and refuses to write a template that still fetches.
import { describe, it, expect } from 'vitest';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync } from 'node:fs';
import { stripRemoteImports, externalRefs } from '../../scripts/reader-inline.mjs';

// Read from disk: vitest serves .css imports (even ?raw) as empty modules.
const appCss: string = readFileSync('src/app.css', 'utf8');

const GOOGLE = 'https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=Fraunces:opsz,wght@9..144,400&display=swap';
const page = (css: string, body = '') => `<!doctype html><html><head><style>\n${css}\n</style></head><body>${body}</body></html>`;

describe('stripRemoteImports', () => {
  it('drops the authoring app’s Google Fonts import and keeps every other rule', () => {
    expect(appCss).toMatch(/@import url\("https:\/\/fonts\.googleapis\.com/); // the app keeps its fonts
    const { css, removed } = stripRemoteImports(appCss);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toContain('fonts.googleapis.com');
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/googleapis|https?:\/\//);
    // nothing else moved: the stripped sheet is the original minus that one rule
    expect(css.trim()).toBe(appCss.replace(removed[0], '').trim());
  });

  it.each([
    [`@import"${GOOGLE}";.a{color:red}`, '.a{color:red}'],
    [`@import url("${GOOGLE}");.a{color:red}`, '.a{color:red}'],
    [`@import url('${GOOGLE}') screen and (min-width: 1px);\n.a{color:red}`, '\n.a{color:red}'],
    [`@import url(https://cdn.example.com/x.css);.a{}`, '.a{}'],
    [`@import '//cdn.example.com/x.css' layer(base);.a{}`, '.a{}'],
    [`@IMPORT "HTTP://cdn.example.com/x.css";.a{}`, '.a{}'],
    [`.a{}@import"${GOOGLE}"`, '.a{}'],
  ])('strips %j', (input, expected) => {
    expect(stripRemoteImports(input).css).toBe(expected);
  });

  it('leaves local imports and url() font sources alone (the assertion judges those)', () => {
    const css = `@import "./local.css";@font-face{src:url(data:font/woff2;base64,AA//8=)}.a{}`;
    expect(stripRemoteImports(css)).toEqual({ css, removed: [] });
  });
});

describe('externalRefs — the build’s self-contained assertion', () => {
  it('catches the minified @import"https://…" form the url() scan used to miss', () => {
    expect(externalRefs(page(`@import"${GOOGLE}";body{margin:0}`))).not.toEqual([]);
  });

  it.each([
    `@import url("${GOOGLE}");`,
    `@import url(${GOOGLE});`,
    `@import '//cdn.example.com/x.css';`,
    `@import "./local.css";`,
    `.a{background:url(https://cdn.example.com/a.png)}`,
    `.a{background:url("//cdn.example.com/a.png")}`,
    `@font-face{font-family:X;src:url(fonts/x.woff2) format("woff2")}`,
  ])('flags %j', (css) => {
    expect(externalRefs(page(css)).length).toBeGreaterThan(0);
  });

  it('passes a self-contained page: data: fonts, in-page anchors, URLs inside scripts', () => {
    const html = page(
      '@font-face{font-family:K;src:url(data:font/woff2;base64,d09GMgABAAAA//8AAA==) format("woff2")}.a{color:red}',
      '<a href="#top">top</a><script type="module">const u = "https://example.com"; const s = `src="x.js"`;</script>',
    );
    expect(externalRefs(html)).toEqual([]);
  });

  it('flags external src and href attributes', () => {
    expect(externalRefs(page('', '<img src="https://example.com/a.png">'))).toEqual(['src=https://example.com/a.png']);
    expect(externalRefs(page('', '<link rel="stylesheet" href="x.css">'))).toEqual(['href=x.css']);
  });

  it('the app stylesheet passes once its remote import is stripped', () => {
    expect(externalRefs(page(appCss))).not.toEqual([]);
    expect(externalRefs(page(stripRemoteImports(appCss).css))).toEqual([]);
  });
});

describe('font stacks degrade to system fonts without the webfonts', () => {
  it('every --font / --mono stack in app.css ends in a generic family', () => {
    const stacks = [...appCss.matchAll(/--(?:font|mono):\s*([^;]+);/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
    expect(stacks.length).toBeGreaterThan(4);
    for (const stack of stacks) {
      expect(stack, stack).toMatch(/(?:^|,)\s*(?:serif|sans-serif|monospace|cursive|system-ui)\s*$/);
    }
  });
});
