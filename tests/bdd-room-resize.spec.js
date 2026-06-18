import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('#5 rooms resize by dragging their right edge, like cards and slots', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('c1', 'N', [m.slot('s1', 'text', { text: 'x' })], { w: 4 });
    m.setHouse([m.room('r', 'R', [c])], [], false);
  });
  const probe = await page.evaluate(() => ({
    oldBar: !!document.querySelector('.room-rz'),
    edge: !!document.querySelector('.room > [data-roomrz]'),
  }));
  expect(probe.oldBar).toBe(false);                       // the side bar is gone
  expect(probe.edge).toBe(true);                          // edge strip lives on the grid itself
  const edge = page.locator('.room > [data-roomrz]');
  const b = await edge.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 40);
  await page.mouse.down();
  await page.mouse.move(b.x - 160, b.y + 40, { steps: 6 });
  await page.mouse.up();
  const out = await page.evaluate(() => ({ w: window.__mk.D().house.rooms[0].width }));
  expect(out.w).toBeGreaterThan(100);                     // a concrete width was set by the drag
});
