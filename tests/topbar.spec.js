import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('the notebook switcher is count-independent: same chrome at 2 or 12 notebooks', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const countChrome = () => document.querySelectorAll('#places > *').length;
    const few = countChrome();
    for (let i = 2; i <= 12; i++) { const c = JSON.parse(JSON.stringify(D.houses[0])); c.id = 'h' + i; c.name = 'Notebook ' + i; D.houses.push(c); }
    window.render();
    const many = countChrome();
    // open the menu: every notebook reachable, one click to switch
    document.querySelector('[data-act="nbmenu"]').click();
    const items = [...document.querySelectorAll('.nbmenu [data-act="gohouse"]')];
    items.find(b => b.dataset.id === 'h7').click();
    return { few, many, listed: items.length, switched: D.activeHouse === 'h7',
             label: document.querySelector('[data-act="nbmenu"]').textContent };
  });
  expect(out.many).toBe(out.few);                 // layout does not grow with notebook count
  expect(out.listed).toBe(12);
  expect(out.switched).toBe(true);
  expect(out.label).toContain('Notebook 7');      // the switcher names the current notebook
});

test('the switcher menu closes on outside click; add-notebook is a separate "+" control', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    document.querySelector('[data-act="nbmenu"]').click();
    const open1 = !!document.querySelector('.nbmenu');
    const plusOutside = !!document.querySelector('[data-act="newnb"]');   // the add control lives outside the menu
    document.querySelector('#stage').click();
    const open2 = !!document.querySelector('.nbmenu');
    return { open1, plusOutside, open2 };
  });
  expect(out.open1).toBe(true);
  expect(out.plusOutside).toBe(true);
  expect(out.open2).toBe(false);
});

