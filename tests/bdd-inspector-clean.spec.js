import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('card inspector: no Width row anywhere; empty content sections vanish', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const flash = m.card('cf', 'Flashcard', [m.slot('s1', 'text', { text: 'q' })], { container: { flip: true }, back: [m.slot('s2', 'text', { text: 'a' })], w: 8 });
    const gauss = m.card('cg', 'Lab', [m.slot('s3', 'slider', { key: 'mu', min: 0, max: 9, value: 3, step: 1 })], { w: 8 });
    m.setHouse([m.room('r', 'R', [flash, gauss])], [], false);
    const probe = id => { document.querySelector(`[data-fid="${id}"]`).click();
      const side = document.querySelector('#side');
      return { width: !!side.querySelector('[data-act="fw"]'),
               emptyHeads: [...side.querySelectorAll('.bm-lbl')].filter(l => /content/i.test(l.textContent) && !l.nextElementSibling?.matches('.kv,.bm-lbl ~ *') && (!l.nextElementSibling || /content|Remove/i.test(l.nextElementSibling.textContent))).length,
               text: side.textContent };
    };
    const f = probe('cf'); const g = probe('cg');
    return { fWidth: f.width, fHasContentHead: /Front content|Back content/i.test(f.text),
             gWidth: g.width, gHasFields: /Variable/.test(g.text) };
  });
  expect(out.fWidth).toBe(false);                  // width row gone (flashcard)
  expect(out.gWidth).toBe(false);                  // width row gone (reactive card too)
  expect(out.fHasContentHead).toBe(false);         // no orphan Front/Back headers over nothing
  expect(out.gHasFields).toBe(true);               // real fields still render (slider config intact)
});
