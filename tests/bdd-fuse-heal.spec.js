import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

const BENCH3 = `
  const m = window.__mk; m.reset(); const D = m.D();
  D.place = 'factory'; window.render();
  for (const t of ['text','text','text']) document.querySelector('[data-act="addslot"][data-t="'+t+'"]').click();
  D.bench.slots[0].fuse = true; D.bench.slots[1].fuse = true; window.render();
`;

test('B9: deleting the middle slot heals the chain; deleting the tail clears the dangling flag', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${BENCH3}
    // delete middle (B): A and C should remain fused
    document.querySelector('[data-act="selslot"][data-i="1"]').click();
    document.querySelector('[data-act="delslot"]') ? document.querySelector('[data-act="delslot"]').click() : null;
    const afterMid = { n: D.bench.slots.length, fuse: D.bench.slots.map(s => !!s.fuse),
                       chainCells: document.querySelector('.benchfuse') ? document.querySelector('.benchfuse').querySelectorAll('.benchslot').length : 0 };
    // delete the new tail (C): A's flag must clear — no dangling fuse
    document.querySelector('[data-act="selslot"][data-i="1"]').click();
    document.querySelector('[data-act="delslot"]').click();
    const afterTail = { n: D.bench.slots.length, fuse: D.bench.slots.map(s => !!s.fuse) };
    return { afterMid, afterTail };
  })()`);
  expect(out.afterMid.n).toBe(2);
  expect(out.afterMid.fuse).toEqual([true, false]);   // healed pair
  expect(out.afterMid.chainCells).toBe(2);
  expect(out.afterTail.fuse).toEqual([false]);        // no dangling flag
});

test('B9: a slot dragged out of its chain drops its fuse flag; the chain heals behind it', async ({ page }) => {
  await page.evaluate(`(() => { ${BENCH3} })()`);
  const grip = page.locator('[data-bgrip="1"]');
  await grip.scrollIntoViewIfNeeded();
  const g = await grip.boundingBox();
  const grid = await page.locator('.bench-grid').first().boundingBox();
  await page.mouse.move(g.x + 2, g.y + 2);
  await page.mouse.down();
  await page.mouse.move(grid.x + grid.width - 20, g.y + 2, { steps: 8 });   // drag B to the far end
  await page.mouse.move(grid.x + grid.width - 10, g.y + 4, { steps: 4 });
  await page.mouse.up();
  const out = await page.evaluate(() => ({ fuse: window.__mk.D().bench.slots.map(s => !!s.fuse) }));
  expect(out.fuse.filter(Boolean).length).toBeLessThanOrEqual(1);  // moved slot dropped its flag; no dangling tail
  expect(out.fuse[out.fuse.length - 1]).toBe(false);
});
