import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('#8 a long notebook title can use the full notebook width', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'house'; D.studyOn = false;
    D.house.name = 'A Very Long Notebook Title That Should Be Allowed To Span The Whole Width Of The Page Without Squeezing';
    window.render();
    const head = document.querySelector('.house-head').getBoundingClientRect();
    const title = document.querySelector('.house-title').getBoundingClientRect();
    return { headW: head.width, titleW: title.width, ratio: title.width / head.width };
  });
  expect(out.ratio).toBeGreaterThan(0.9);   // title claims (nearly) the full header width
});
