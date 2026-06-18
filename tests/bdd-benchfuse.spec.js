import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('bench fuse chain: no slot overflows its cell, every seam visible, seam matches the card look', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; window.render();
    for (const t of ['text', 'slider', 'progress', 'text']) document.querySelector(`[data-act="addslot"][data-t="${t}"]`).click();
    D.bench.slots[0].props.text = 'Drag μ — watch it react';   // long min-content, the trigger
    D.bench.slots[0].fuse = true; D.bench.slots[1].fuse = true; D.bench.slots[2].fuse = true;
    window.render();
    const cells = [...document.querySelectorAll('.benchfuse .ff')].map(f => {
      const fr = f.getBoundingClientRect(), s = f.querySelector('.benchslot').getBoundingClientRect();
      return { overflow: Math.round(s.right - fr.right) };
    });
    const bars = [...document.querySelectorAll('.fusebar')].map(b => {
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), uncovered: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b };
    });
    return { cells, bars };
  });
  for (const c of out.cells) expect(c.overflow).toBeLessThanOrEqual(1);   // slots stay inside their cells
  expect(out.bars.length).toBe(3);
  for (const b of out.bars) {
    expect(b.uncovered).toBe(true);                                       // every seam actually visible
    expect(b.w).toBeLessThanOrEqual(3);                                   // thin line, like placed-card seams
  }
});
