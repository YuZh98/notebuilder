import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('A3: Share is the labeled primary action producing the living file; JSON/import/print are secondary', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'house'; window.render();
    const share = [...document.querySelectorAll('#topright button')].find(b => /share/i.test(b.textContent));
    const acts = [...document.querySelectorAll('#topright [data-act]')].map(b => b.dataset.act);
    let file = null; const real = URL.createObjectURL;
    URL.createObjectURL = b => { file = b; return 'blob:x'; };
    HTMLAnchorElement.prototype.click = function () {};
    share.click(); URL.createObjectURL = real;
    return { shareLabeled: share.textContent.trim(), sharePrimary: share.className.includes('primary'),
             acts, type: file && file.type,
             camGone: !acts.includes('camera') || !!share };
  });
  expect(out.shareLabeled.toLowerCase()).toContain('share');
  expect(out.sharePrimary).toBe(true);
  expect(out.type).toBe('text/html');                       // Share = the living file
  for (const a of ['export', 'import', 'pdf']) expect(out.acts).toContain(a);   // secondary survive
});
