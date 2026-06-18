import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('pin button on a FLIP card pins with a real mouse click (does not flip the card)', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const board = m.card('cb', 'Board', [m.slot('sb', 'board', {})], { w: 12 });
    const flip = m.card('cf', 'FC', [m.slot('s1', 'text', { text: 'FRONT' })], { container: { flip: true }, back: [m.slot('s2', 'text', { text: 'BACK' })], w: 8 });
    const r = m.room('r', 'R', [board, flip]);
    r.services = { pin: true };
    m.setHouse([r], [], true);   // Study mode — where the user hit it
  });
  const pin = page.locator('[data-act="pin"][data-fid="cf"]');
  await pin.scrollIntoViewIfNeeded();
  await pin.click();                                    // REAL pointer — fails if the flip face covers the button
  const out = await page.evaluate(() => {
    const f = window.__mk.D().house.rooms[0].cards.find(c => c.id === 'cf');
    return { pinned: (f.tag||[]).includes('pinned'), flipped: !!f.state._flip };
  });
  expect(out.pinned).toBe(true);
  expect(out.flipped).toBe(false);
});

test('pin works standalone — no board, no preconditions', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const note = m.card('cn', 'Note', [m.slot('s1', 'text', { text: 'solo' })], { w: 8 });
    const r = m.room('r', 'R', [note]);
    r.services = { pin: true };
    m.setHouse([r], [], true);
    document.querySelector('[data-act="pin"][data-fid="cn"]').click();
    return { pinned: (m.D().house.rooms[0].cards[0].tag||[]).includes('pinned') };
  });
  expect(out.pinned).toBe(true);
});
