import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('container modes and slot effects are separate labeled groups; frameless is registered', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; window.render();
    const heads = [...document.querySelectorAll('#side .store-lane h4')].map(h => h.textContent.trim());
    const modeLane = [...document.querySelectorAll('#side .store-lane')].find(l => /Card mode/i.test(l.textContent));
    const fxLane = [...document.querySelectorAll('#side .store-lane')].find(l => /Slot effect/i.test(l.textContent));
    return {
      heads: heads.filter(h => /mode|effect|Verb/i.test(h)),
      modeChips: modeLane ? [...modeLane.querySelectorAll('.chip')].map(c => c.textContent.trim()) : [],
      fxChips: fxLane ? [...fxLane.querySelectorAll('.chip')].map(c => c.textContent.trim()) : [],
      mixedVerbLane: heads.some(h => /✦ Verbs/.test(h)),
      bareRegistered: !!(window.CVERBS && window.CVERBS.bare),
    };
  });
  expect(out.mixedVerbLane).toBe(false);                          // the one mixed "Verbs" lane is gone
  expect(out.modeChips.join(' ')).toMatch(/Flip/);
  expect(out.modeChips.join(' ')).toMatch(/Frameless/);
  expect(out.fxChips.join(' ')).toMatch(/Reveal/);
  expect(out.fxChips.join(' ')).not.toMatch(/Flip|Frameless/);    // no cross-contamination
  expect(out.bareRegistered).toBe(true);
});
