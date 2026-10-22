// Builds the live demo lessons the site embeds: each example notebook in docs/examples/ is
// injected into the committed Reader template exactly the way the app's Share does
// (v2/src/lib/share.ts buildShareHtml + v2/src/lib/html-io.ts injectNotebook).
// Usage: node site/build-demo.mjs   (no dependencies; run from the repository root)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const DEMOS = [
  { file: 'practice-lesson', out: 'percent-change', theme: 'study' },
  { file: 'compound-interest', out: 'compound-interest' },
  { file: 'grand-tour', out: 'grand-tour' },
];

const src = readFileSync('v2/src/lib/generated/reader-template.ts', 'utf8');
const literal = src.slice(src.indexOf('= "') + 2, src.lastIndexOf('"') + 1);
const template = JSON.parse(literal);

const PAYLOAD_RE = /(<script\b[^>]*\sid="notebook-source"[^>]*>)([\s\S]*?)(<\/script>)/i;
if (!PAYLOAD_RE.test(template)) throw new Error('Reader template has no notebook-source placeholder');
const ESC = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' };

mkdirSync('site/demo', { recursive: true });
for (const { file, out, theme } of DEMOS) {
  const notebook = JSON.parse(readFileSync(`docs/examples/${file}.json`, 'utf8'));
  const payload = JSON.stringify({ shared: true, notebook, docId: `notebuilder-demo-${out}`, ...(theme ? { theme } : {}) });
  const html = template.replace(PAYLOAD_RE, (_m, open, _inner, close) => open + payload.replace(/[<>&]/g, (c) => ESC[c]) + close);
  // The minified Reader carries one literal U+FFFD inside a JS string (the lone-surrogate
  // replacement). Escape it so hosts that reject raw U+FFFD in HTML accept the file; same behaviour.
  const safe = html.replaceAll('"\uFFFD"', '"\\uFFFD"');
  if (safe.includes('\uFFFD')) throw new Error(`${out}: unexpected raw U+FFFD outside a JS string`);
  writeFileSync(`site/demo/${out}.html`, safe);
  console.log(`site/demo/${out}.html  ${(safe.length / 1024).toFixed(0)} KB`);
}
