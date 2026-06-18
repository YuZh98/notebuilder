import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('the top bar hides fully behind a bump and comes back; preference persists', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); window.render();
    const topVisible = () => document.querySelector('#top').offsetHeight > 0;
    const before = topVisible();
    document.querySelector('[data-act="tophide"]').click();
    const hidden = !topVisible();
    const bump = document.querySelector('[data-act="tophide"]');
    const bumpShows = bump && bump.offsetHeight > 0 && /[˅⌄v]/i.test(bump.textContent);
    const hiddenTop = Math.round(bump.getBoundingClientRect().top);
    const stored = localStorage.getItem('lsa_tophide');
    bump.click();
    const barBottom = Math.round(document.querySelector('#top').getBoundingClientRect().bottom);
    const visibleTop = Math.round(bump.getBoundingClientRect().top);
    return { before, hidden, bumpShows, stored, back: topVisible(), hiddenTop,
             hangsBelowBar: Math.abs(visibleTop - barBottom) <= 2 };
  });
  expect(out.before).toBe(true);
  expect(out.hidden).toBe(true);
  expect(out.bumpShows).toBe(true);
  expect(out.stored).toBe('1');
  expect(out.back).toBe(true);
  expect(out.hiddenTop).toBe(0);              // hidden: bump sits at the very top edge
  expect(out.hangsBelowBar).toBe(true);       // visible: bump hangs just below the bar — actually findable
});

test('the side bar collapses via a visible mid-edge bump and returns the same way', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); window.render();
    const sideVisible = () => document.querySelector('#side').offsetWidth > 40;
    const bump = () => document.querySelector('[data-act="sidetoggle"]');
    const open1 = sideVisible();
    const labelOpen = bump().textContent.trim();
    bump().click();
    const collapsed = !sideVisible();
    const labelClosed = bump().textContent.trim();
    const stored = localStorage.getItem('lsa_sidecollapsed');
    bump().click();
    return { open1, labelOpen, collapsed, labelClosed, stored, back: sideVisible() };
  });
  expect(out.open1).toBe(true);
  expect(out.labelOpen).toBe('‹');
  expect(out.collapsed).toBe(true);
  expect(out.labelClosed).toBe('›');
  expect(out.stored).toBe('1');
  expect(out.back).toBe(true);
});
