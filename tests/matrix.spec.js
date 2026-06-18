import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

// rooms Optiver,Citadel · tags Coding,Math · products Flashcard,Quiz
async function lab(page) {
  return page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = (id, name, tag) => m.card(id, name, [m.slot(id + 's', 'text', { text: name })], { tag, w: 6 });
    m.setHouse([m.room('rA', 'Optiver', [c('c1', 'Flashcard', ['Coding']), c('c2', 'Quiz', ['Math'])]),
                m.room('rB', 'Citadel', [c('c3', 'Flashcard', ['Math'])])], ['Coding', 'Math']);
  });
}
const cell = (page, rv, cv) => page.locator(`.mtx-cell[data-rv="${rv}"][data-cv="${cv}"]`);
const shown = page => page.evaluate(() => window.__mk.shown());

test('default coverage grid is Rooms × Products, with correct counts incl. a 0 gap', async ({ page }) => {
  await lab(page);
  await expect(page.locator('.mtx-head b')).toHaveText('▦ Coverage');
  expect(await page.locator('.mtx-rowh').allInnerTexts()).toEqual(['⠿Optiver', '⠿Citadel']);
  expect(await page.locator('.mtx-colh').allInnerTexts()).toEqual(['Flashcard', 'Quiz']);  // Products axis (no reorder grips)
  await expect(cell(page, 'rA', 'flashcard')).toHaveText('1');
  await expect(cell(page, 'rB', 'quiz')).toHaveText('0');                                   // a gap
});

test('clicking a cell filters the house to that (room, product)', async ({ page }) => {
  await lab(page);
  await cell(page, 'rA', 'flashcard').click();
  expect(await shown(page)).toEqual(['c1']);
});

test('a column header filters across all rooms; clear restores', async ({ page }) => {
  await lab(page);
  await page.locator('.mtx-colh[data-cv="flashcard"]').click();
  expect((await shown(page)).sort()).toEqual(['c1', 'c3']);
  await page.locator('[data-act="mtxclear"]').click();
  expect((await shown(page)).length).toBe(3);
});

test('grid appears when any two axes have ≥2 entries (2 rooms × 2 products, no tags) and auto-picks them', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = (id, name) => m.card(id, name, [m.slot(id + 's', 'text', { text: name })]);
    m.setHouse([m.room('rA', 'A', [c('c1', 'Flashcard'), c('c2', 'Quiz')]), m.room('rB', 'B', [c('c3', 'Flashcard')])], []);
  });
  await expect(page.locator('.mtx')).toBeVisible();
  expect(await page.locator('.mtx-colh').allInnerTexts()).toEqual(['Flashcard', 'Quiz']);
  await expect(page.locator('[data-act="mtxaxis"][data-d="tag"]').first()).toBeDisabled();  // only the untagged bucket → <2 entries
});

test('switching the column axis to Tags re-tabulates and filters by (room, tag)', async ({ page }) => {
  await lab(page);
  await page.locator('[data-act="mtxaxis"][data-ax="col"][data-d="tag"]').click();
  expect(await page.locator('.mtx-colh').allInnerTexts()).toEqual(['⠿Coding', '⠿Math', 'untagged']);
  await cell(page, 'rA', 'Math').click();
  expect(await shown(page)).toEqual(['c2']);
});
