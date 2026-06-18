import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('themes are one static registry: chips render from it, choice persists, nothing else in DB', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); window.render();
    document.querySelector('[data-act="thememenu"]').click();   // theme lives in a dropdown now
    const chips = [...document.querySelectorAll('[data-act="settheme"]')].map(c => c.dataset.id);
    document.querySelector('[data-act="settheme"][data-id="sketch"]').click();
    window.save();
    const stored = JSON.parse(localStorage.getItem('lsa_db_v13'));
    return { chips, applied: document.body.dataset.theme, storedTheme: stored.theme,
             dbThemesGone: !('themes' in stored), regCount: (window.THEMES || []).length };
  });
  expect(out.chips.length).toBeGreaterThanOrEqual(7);
  expect(out.applied).toBe('sketch');
  expect(out.storedTheme).toBe('sketch');
  expect(out.dbThemesGone).toBe(true);                 // the registry is code, not data
  expect(out.regCount).toBe(out.chips.length);         // chips render FROM the registry
});

test('old saves with a themes array and per-house style load clean; the choice survives', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    // simulate legacy fields
    D.themes = [{ id: 'plain', name: 'Black & White (plain)' }, { id: 'custom', name: 'Ghost' }];
    D.theme = 'aurora'; D.house.style = 'cyber';
    window.rebuildRefs(); window.render(); window.save();
    const stored = JSON.parse(localStorage.getItem('lsa_db_v13'));
    return { theme: stored.theme, themesGone: !('themes' in stored), styleGone: !('style' in stored.houses[0]), applied: document.body.dataset.theme };
  });
  expect(out.theme).toBe('aurora');                    // explicit choice wins; legacy house.style ignored
  expect(out.themesGone).toBe(true);
  expect(out.styleGone).toBe(true);
  expect(out.applied).toBe('aurora');
});
