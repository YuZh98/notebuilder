import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('B6: the reveal-when value persists, coalesces into one undo step, and stores numbers as numbers', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; window.render();
    document.querySelector('[data-act="addslot"][data-t="text"]').click();
    const idx = D.bench.slots.length - 1;
    document.querySelector(`[data-act="selslot"][data-i="${idx}"]`).click();
    document.querySelector('[data-svverbdrag="reveal"][data-act="sverb"]').click();
    const undo0 = D._undo.length;
    const rv = document.querySelector('[data-act="rev"][data-f="val"]');
    rv.value = '4'; rv.dispatchEvent(new Event('input', { bubbles: true }));
    rv.value = '42'; rv.dispatchEvent(new Event('input', { bubbles: true }));
    const s = D.bench.slots[idx];
    const stored = JSON.parse(localStorage.getItem('lsa_db_v13'));
    const sStored = stored.factory.benches.find(b => b.id === D.bench.id).slots[idx];
    return { mem: s.verbs.reveal.val, persisted: sStored.verbs.reveal.val,
             numeric: typeof s.verbs.reveal.val === 'number',
             coalesced: D._undo.length === undo0 + 1 };
  });
  expect(out.mem).toBe(42);
  expect(out.persisted).toBe(42);
  expect(out.numeric).toBe(true);
  expect(out.coalesced).toBe(true);
});
