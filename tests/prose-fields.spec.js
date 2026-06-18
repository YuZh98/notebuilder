import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('bench name and note use the formatted-preview edit lifecycle', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; D.bench.name = 'Card--Blue'; D.bench.note = 'works for $x^2$ and **bold**'; window.render();
    const nameView = [...document.querySelectorAll('.ceview')].find(v => v.textContent.includes('Card--Blue'));
    const noteView = [...document.querySelectorAll('.ceview')].find(v => v.querySelector('.katex'));
    if (!nameView || !noteView) return { nameView: !!nameView, noteView: !!noteView };
    noteView.click();                                  // open the editor
    const ta = document.querySelector('textarea.ce[data-act="bnote"]');
    if (!ta) return { ta: false };
    ta.value = 'now $e^x$'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    return { nameView: true, noteView: true, ta: true, saved: m.D().bench.note,
             noteBold: noteView.querySelector('b,strong') !== null };
  });
  expect(out.nameView).toBe(true);
  expect(out.noteView).toBe(true);     // math rendered in the preview
  expect(out.ta).toBe(true);
  expect(out.saved).toBe('now $e^x$');
});

test('seal sheet maker note gets the same treatment', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; window.render();
    document.querySelector('[data-act="addslot"][data-t="text"]').click();
    document.querySelector('[data-act="sealbench"]').click();      // open seal sheet
    const modal = document.querySelector('#modal');
    const noteView = [...modal.querySelectorAll('.ceview')].length;
    const rawTa = [...modal.querySelectorAll('textarea')].filter(t => t.dataset.act === 'sealnote' && !t.classList.contains('ce')).length;
    return { noteView, rawTa };
  });
  expect(out.noteView).toBeGreaterThan(0);
  expect(out.rawTa).toBe(0);
});
