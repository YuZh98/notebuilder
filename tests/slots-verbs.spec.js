import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('factory palette lists every slot incl. the reactive ones', async ({ page }) => {
  const slots = await page.evaluate(() => { window.__mk.D().place = 'factory'; window.render(); return [...document.querySelectorAll('[data-slotdrag]')].map(b => b.dataset.slotdrag); });
  for (const s of ['compute', 'chart', 'slider', 'choice']) expect(slots).toContain(s);
  expect(slots).not.toContain('number');   // number folded into slider (schema v3)
});

test('clicking a top-palette slot verb applies to the selected slot + highlights', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'factory'; window.render();
    document.querySelector('[data-act="addslot"][data-t="text"]').click();
    const idx = D.bench.slots.length - 1;
    document.querySelector(`[data-act="selslot"][data-i="${idx}"]`).click();
    document.querySelector('[data-svverbdrag="glow"][data-act="sverb"]').click();   // the top palette chip (was drag-only)
    return { applied: !!D.bench.slots[idx].verbs.glow, highlighted: !!document.querySelector('[data-svverbdrag="glow"].on') };
  });
  expect(out.applied).toBe(true);
  expect(out.highlighted).toBe(true);
});

test('Frameless is fully hollow under a decorated theme (fuses into the notebook)', async ({ page }) => {
  const bg = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); D.house.style = 'aurora';
    m.setHouse([m.room('r', 'R', [m.card('cb', 'N', [m.slot('s1', 'text', { text: 'fused' })], { container: { bare: true }, w: 10 })])], [], true);
    const s = getComputedStyle(document.querySelector('[data-fid="cb"]'));
    return { image: s.backgroundImage, color: s.backgroundColor };
  });
  expect(bg.image).toBe('none');
  expect(bg.color).toBe('rgba(0, 0, 0, 0)');
});

test('checklist checkboxes form one straight column (no stretch, no drift on wrapped items)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const items = ['Test MS Teams link + cam + mic 30 min early', 'Quiet room, light on your face, camera on', 'Pen', 'Own resume open — he has read it and more and more text to force wrapping'].join('\n');
    const c = m.card('ck', 'CK', [m.slot('s1', 'list', { title: 'Day of', items, style: 'check' })], { w: 4 }); // narrow → items wrap
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const card = document.querySelector('[data-fid="ck"]').getBoundingClientRect();
    const boxes = [...document.querySelectorAll('[data-fid="ck"] .taskit input')].map(i => {
      const r = i.getBoundingClientRect(); const row = i.closest('.taskit').getBoundingClientRect();
      return { cx: Math.round(r.x + r.width / 2 - card.x), w: Math.round(r.width), dy: Math.round(r.y - row.y), rowH: Math.round(row.height) };
    });
    return boxes;
  });
  expect(out.length).toBe(4);
  for (const b of out) expect(b.w).toBeLessThan(30);                  // a checkbox, not a stretched text field
  const xs = new Set(out.map(b => b.cx));
  expect(xs.size).toBe(1);                                            // glyph centers form one column
  const tall = out.filter(b => b.rowH > 30);                          // wrapped rows
  expect(tall.length).toBeGreaterThan(0);                             // fixture really wraps
  for (const b of tall) expect(b.dy).toBeLessThan(12);                // box hugs the FIRST line, not the middle
});
