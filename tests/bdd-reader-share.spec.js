import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// A shared file boots into a locked Reader (no authoring chrome) with a Remix escape hatch.
// The export carries only the shared notebook — not the author's whole catalog.

test.beforeEach(async ({ page }) => { await open(page); });

test('the living export is slim: shared flag set, no catalog/templates embedded', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const html = window.buildExport();
    const i = html.indexOf('__LSA_SEED__='); const j = html.indexOf('<' + '/script>', i);
    const seed = JSON.parse(html.slice(i + 13, j));
    return { shared: seed.shared, products: (seed.products || []).length, templates: (seed.templates || []).length, rooms: seed.houses[0].rooms.length };
  });
  expect(out.shared).toBe(true);
  expect(out.products).toBe(0);     // cards are self-contained; don't ship the inventory
  expect(out.templates).toBe(0);
  expect(out.rooms).toBeGreaterThan(0);
});

test('a shared notebook renders a reader top bar: no Factory/Edit/export, a Remix button', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.shared = true; D.studyOn = true; window.render();
    const acts = [...document.querySelectorAll('#top button')].map(b => b.dataset.act);
    return {
      factory: acts.includes('place'), edit: acts.includes('hmode'), exportBtn: acts.includes('export'),
      addNb: acts.includes('newnb'), remix: acts.includes('remix'),
    };
  });
  expect(out.factory).toBe(false);
  expect(out.edit).toBe(false);
  expect(out.exportBtn).toBe(false);
  expect(out.addNb).toBe(false);
  expect(out.remix).toBe(true);
});

test('Remix unlocks full authoring chrome', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.shared = true; D.studyOn = true; window.render();
    document.querySelector('[data-act="remix"]').click();
    const acts = [...document.querySelectorAll('#top button')].map(b => b.dataset.act);
    return { sharedNow: !!D.shared, factory: acts.includes('place'), edit: acts.includes('hmode') };
  });
  expect(out.sharedNow).toBe(false);
  expect(out.factory).toBe(true);
  expect(out.edit).toBe(true);
});
