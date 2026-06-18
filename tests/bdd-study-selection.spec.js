import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('selecting text in Study survives the mouseup click; flashcards do not flip on selection', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const note = m.card('cn', 'N', [m.slot('s1', 'text', { text: 'select these words to copy them' })], { w: 6 });
    const flip = m.card('cf', 'F', [m.slot('s2', 'text', { text: 'front words worth copying' })], { container: { flip: true }, back: [m.slot('s3', 'text', { text: 'b' })], w: 6 });
    m.setHouse([m.room('r', 'R', [note, flip])], [], true);
    const selectIn = id => { const el = document.querySelector(`[data-fid="${id}"] .slot`); const rg = document.createRange();
      rg.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); return el; };
    // 1. select in a plain card, then the click that ends the drag lands on the room
    const el1 = selectIn('cn');
    el1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const keptAfterRoomClick = !getSelection().isCollapsed && getSelection().toString().includes('select these');
    // 2. select on a flip card's front, mouseup-click on it — must NOT flip
    const el2 = selectIn('cf');
    el2.closest('[data-act="flip"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const flipCard = m.D().house.rooms[0].cards[1];
    const notFlipped = !flipCard.state._flip && !getSelection().isCollapsed;   // snapshot BEFORE step 3 mutates
    // 3. with selection collapsed, the same click DOES flip (actions still work)
    getSelection().removeAllRanges();
    document.querySelector('[data-fid="cf"] [data-act="flip"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { keptAfterRoomClick, notFlipped, flipsWhenNoSelection: !!flipCard.state._flip };
  });
  expect(out.keptAfterRoomClick).toBe(true);
  expect(out.notFlipped).toBe(true);
  expect(out.flipsWhenNoSelection).toBe(true);
});
