import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('a math notebook exports KaTeX that renders with the network blocked (offline math)', async ({ page }) => {
  const html = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cm', 'M', [m.slot('s1', 'text', { text: 'Euler: $e^{i\\pi}+1=0$' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    return buildExport();
  });
  expect(html).toContain('KATEX_JS=atob(');          // bundle rode along

  const ex = await page.context().newPage();
  await ex.route('**cdn.jsdelivr.net/**', r => r.abort());   // no CDN — must use the embedded bundle
  await ex.route('**fonts.googleapis.com/**', r => r.abort());
  await ex.setContent(html, { waitUntil: 'load' });
  await ex.waitForFunction(() => !!document.querySelector('#stage .katex'), null, { timeout: 5000 });
  // KaTeX actually rendered (not the raw-$ fallback)
  expect(await ex.evaluate(() => document.querySelectorAll('#stage .katex').length)).toBeGreaterThan(0);
  expect(await ex.evaluate(() => document.querySelectorAll('#stage .math-raw').length)).toBe(0);
  await ex.close();
});

test('a math-free notebook exports WITHOUT the KaTeX bundle (conditional embed keeps it small)', async ({ page }) => {
  const html = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cp', 'P', [m.slot('s1', 'text', { text: 'plain note, no math here' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    return buildExport();
  });
  expect(html).not.toContain('KATEX_JS=atob(');
  expect(html).toContain("KATEX_JS=''");             // stripped to an empty stub
  expect(html).not.toContain('data:font/woff2');
});
