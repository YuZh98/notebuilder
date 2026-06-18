import { test, expect } from '@playwright/test';

// Smoke test: the bundled index.html must actually boot. This guards the build seam —
// a stray closing-script sequence in source can truncate the inlined <script id="app">
// block and void the whole app. A short explicit timeout turns that failure into a fast,
// named error instead of a 30s-per-spec hang across the rest of the suite.
test('the bundled app boots: window.LS, window.render, and a populated #stage', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.LS && !!window.render, null, { timeout: 5000 });

  const api = await page.evaluate(() => ({
    hasLS: typeof window.LS === 'object',
    hasRender: typeof window.render === 'function',
    stageFilled: (document.querySelector('#stage')?.childElementCount ?? 0) > 0,
  }));

  expect(errors, `page errors on boot:\n${errors.join('\n')}`).toEqual([]);
  expect(api.hasLS).toBe(true);
  expect(api.hasRender).toBe(true);
  expect(api.stageFilled).toBe(true);
});
