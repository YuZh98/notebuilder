import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('pin toggles the pinned tag; coverage sees it; reset/export keep it', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const note = m.card('cn', 'Note', [m.slot('s1', 'text', { text: 'solo' })], { w: 8 });
    const r = m.room('r', 'R', [note]);
    r.services = { pin: true, reset: true };
    m.setHouse([r], [], true);
    document.querySelector('[data-act="pin"][data-fid="cn"]').click();
    const afterPin = { tag: [...(D.house.rooms[0].cards[0].tag || [])], cat: D.house.cats.includes('pinned') };
    document.querySelector('[data-act="svcrun"][data-k="reset"]').click();
    const afterReset = [...(D.house.rooms[0].cards[0].tag || [])];
    const html = buildExport();
    const seed = JSON.parse(html.match(/__LSA_SEED__=(\{.*?\})<\/script>/s)[1]);
    const exported = seed.houses[0].rooms[0].cards[0].tag;
    // unpin removes the tag
    document.querySelector('[data-act="pin"][data-fid="cn"]').click();
    const afterUnpin = [...(D.house.rooms[0].cards[0].tag || [])];
    return { afterPin, afterReset, exported, afterUnpin };
  });
  expect(out.afterPin.tag).toContain('pinned');
  expect(out.afterPin.cat).toBe(true);            // tag auto-registered → coverage axis picks it up
  expect(out.afterReset).toContain('pinned');     // reset keeps marks
  expect(out.exported).toContain('pinned');       // export keeps marks
  expect(out.afterUnpin).not.toContain('pinned');
});

test('old saves migrate state._pin to the pinned tag', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const c = m.card('co', 'Old', [m.slot('s1', 'text', { text: 'x' })], { w: 8 });
    c.state._pin = true;
    D.house.rooms[0].cards = [c];
    window.rebuildRefs(); window.render();
    const card = D.house.rooms[0].cards[0];
    return { tag: card.tag, pinGone: !('_pin' in card.state), cat: D.house.cats.includes('pinned') };
  });
  expect(out.tag).toContain('pinned');
  expect(out.pinGone).toBe(true);
  expect(out.cat).toBe(true);
});
