import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('undo history is never persisted to localStorage (no save bloat / data-loss)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'house'; D.studyOn = false; window.render();
    // several undoable actions → each pushes a full snapshot onto _undo
    for (let i = 0; i < 5; i++) { document.querySelector('#newcat').value = 'tag' + i; document.querySelector('[data-act="addcat"]').click(); }
    const undoLen = m.D()._undo.length;                     // in-session history exists
    const stored = localStorage.getItem(window.__DBKEY || Object.keys(localStorage).find(k => k.startsWith('lsa_db')));
    const parsed = JSON.parse(stored);
    return { undoLen, hasUndoInStorage: '_undo' in parsed, hasHouses: Array.isArray(parsed.houses), tagsPersisted: parsed.houses[0].cats.includes('tag4') };
  });
  expect(out.undoLen).toBeGreaterThan(0);        // undo works this session
  expect(out.hasUndoInStorage).toBe(false);      // but history is NOT written to disk
  expect(out.hasHouses).toBe(true);              // the document IS persisted
  expect(out.tagsPersisted).toBe(true);
});

test('exported file is a LIVING standalone document (boots offline, interactions work)', async ({ page }) => {
  // build a house with a flashcard (stable flip interaction as the liveness probe), export it
  const html = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cf', 'FC', [m.slot('s1', 'text', { text: 'FRONT-Q' })], { container: { flip: true }, back: [m.slot('s2', 'text', { text: 'BACK-A' })], w: 10 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    return buildExport();
  });
  // sanity: it embedded the runtime + seed, not a dead snapshot
  expect(html).toContain('window.__LSA_SEED__');
  expect(html).toContain('<script id="app">');
  expect(html).not.toContain('</script></script>');

  // open it in a fresh page with NO app and NO shared state — just the file
  const ex = await page.context().newPage();
  await ex.setContent(html, { waitUntil: 'load' });
  await ex.waitForFunction(() => !!window.LS && !!document.querySelector('#stage .furn'));
  expect(await ex.evaluate(() => window.LS.DB().studyOn)).toBe(true);          // booted into Study
  expect(await ex.evaluate(() => document.querySelector('#stage').textContent.includes('FRONT-Q'))).toBe(true);
  // interact: flip the card → back face shows (proves the JS is alive, not a frozen DOM)
  await ex.locator('#stage .furn').first().click();
  expect(await ex.evaluate(() => document.querySelector('#stage').textContent.includes('BACK-A'))).toBe(true);
  // (no-clobber: save() is a no-op in EXPORT_MODE — verified by code; can't read localStorage on an opaque-origin setContent page)
  await ex.close();
});
