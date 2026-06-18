import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// Mode + structural-add controls live in the fixed top bar (always reachable on a long notebook),
// not in the scrollable stage. Theme is a dropdown left of Factory; a "+" adds a notebook.

test.beforeEach(async ({ page }) => { await open(page); });

const TOP = sel => `#top ${sel}`;

test('house Edit: mode toggle + add buttons are in the top bar, not the stage', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    m.setHouse([m.room('r', 'R', [])], [], false);   // Edit
    return {
      topMode: !!document.querySelector('#top [data-act="hmode"]'),
      topRoom: !!document.querySelector('#top [data-act="addroom"]'),
      topDivider: !!document.querySelector('#top [data-act="adddivider"]'),
      stageMode: !!document.querySelector('#stage [data-act="hmode"]'),
      stageRoom: !!document.querySelector('#stage [data-act="addroom"]'),
    };
  });
  expect(out.topMode).toBe(true);
  expect(out.topRoom).toBe(true);
  expect(out.topDivider).toBe(true);
  expect(out.stageMode).toBe(false);
  expect(out.stageRoom).toBe(false);
});

test('house Study: mode toggle stays, add buttons are gone', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    m.setHouse([m.room('r', 'R', [])], [], true);   // Study
    return {
      topMode: !!document.querySelector('#top [data-act="hmode"]'),
      topRoom: !!document.querySelector('#top [data-act="addroom"]'),
    };
  });
  expect(out.topMode).toBe(true);
  expect(out.topRoom).toBe(false);   // structural edits do not belong in reading mode
});

test('factory: Build/Preview + add-container are in the top bar', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; D.factory.study = false; window.render();
    return {
      topMode: !!document.querySelector('#top [data-act="facmode"]'),
      topContainer: !!document.querySelector('#top [data-act="addbench"]'),
      stageMode: !!document.querySelector('#stage [data-act="facmode"]'),
    };
  });
  expect(out.topMode).toBe(true);
  expect(out.topContainer).toBe(true);
  expect(out.stageMode).toBe(false);
});

test('mode-button labels are plain text — no emojis', async ({ page }) => {
  const labels = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    m.setHouse([m.room('r', 'R', [])], [], false);
    const house = [...document.querySelectorAll('#top [data-act="hmode"]')].map(b => b.textContent.trim());
    const D = m.D(); D.place = 'factory'; D.factory.study = false; window.render();
    const fac = [...document.querySelectorAll('#top [data-act="facmode"]')].map(b => b.textContent.trim());
    return { house, fac };
  });
  expect(labels.house).toEqual(['Edit', 'Study']);
  expect(labels.fac).toEqual(['Build', 'Preview']);
});

test('theme is a dropdown left of Factory, opening the theme choices', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const buttons = [...document.querySelectorAll('#places button')].map(b => b.dataset.act);
    const themeIdx = buttons.indexOf('thememenu');
    const facIdx = buttons.findIndex(a => a === 'place');
    const noInlineChips = !document.querySelector('#top .themebar');
    document.querySelector('[data-act="thememenu"]').click();
    const choices = document.querySelectorAll('.thememenu [data-act="settheme"]').length;
    return { themeIdx, facIdx, noInlineChips, choices };
  });
  expect(out.themeIdx).toBeGreaterThanOrEqual(0);
  expect(out.facIdx).toBeGreaterThan(out.themeIdx);   // theme sits left of Factory
  expect(out.noInlineChips).toBe(true);
  expect(out.choices).toBeGreaterThan(1);
});

test('a "+" button adds a notebook; the switcher dropdown no longer carries that action', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const plus = !!document.querySelector('[data-act="newnb"]');
    document.querySelector('[data-act="nbmenu"]').click();
    const inMenu = !!document.querySelector('.nbmenu [data-act="newnb"]');
    return { plus, inMenu };
  });
  expect(out.plus).toBe(true);       // a visible add-notebook control exists
  expect(out.inMenu).toBe(false);    // it is no longer buried in the switcher
});
