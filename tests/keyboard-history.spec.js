import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('Cmd/Ctrl+Enter toggles Edit ⇄ Study in the House', async ({ page }) => {
  const toggled = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'house'; D.studyOn = false; window.render();
    const before = D.studyOn;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    return m.D().studyOn !== before;
  });
  expect(toggled).toBe(true);
});

test('Cmd/Ctrl+Enter toggles Build ⇄ Preview in the Factory', async ({ page }) => {
  const toggled = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'factory'; D.factory.study = false; window.render();
    const before = D.factory.study;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    return m.D().factory.study !== before;
  });
  expect(toggled).toBe(true);
});

test('Arrow Up/Down navigates rooms; arrows are ignored while typing in a field', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'house'; D.studyOn = false;
    m.setHouse([m.room('rA', 'A'), m.room('rB', 'B')]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const down = m.D().house.active;
    const inp = document.querySelector('#newcat'); inp.focus();
    const a0 = m.D().house.active;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    return { down, ignoredInField: m.D().house.active === a0 };
  });
  expect(out.down).toBe('rB');
  expect(out.ignoredInField).toBe(true);
});
