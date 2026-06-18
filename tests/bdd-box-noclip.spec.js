import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// The value box must never clip its own value (regression: spinner arrows ate the ch budget).

test.beforeEach(async ({ page }) => { await open(page); });

test('the value box shows its full value — no clipping at representative ranges', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [
      m.slot('s1', 'slider', { key: 'price', min: 0, max: 200, value: 50, step: 5, showValue: true, showSlider: true }),
      m.slot('s2', 'slider', { key: 'qty', min: 0, max: 20, value: 3, step: 1, showValue: true, showSlider: true }),
      m.slot('s3', 'slider', { key: 'big', min: 0, max: 1000000, value: 999999, step: 1, showValue: true, showSlider: false }),
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    return [...document.querySelectorAll('[data-fid="cc"] input[type=number]')].map(b => ({
      key: b.dataset.key, value: b.value, clipped: b.scrollWidth > b.clientWidth + 1,
    }));
  });
  for (const b of out) expect(b.clipped, `${b.key}=${b.value} must not clip`).toBe(false);
});
