import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('B5: pin, card width, fuse split are undoable; width input persists', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const S = (id, txt, o = {}) => Object.assign({ id, type: 'text', props: { text: txt }, verbs: {}, w: 6 }, o);
    const c = m.card('cf', 'F', [S('s1', 'L', { fuse: true, fuseW: 1 }), S('s2', 'R', { fuseW: 1 })], { w: 8 });
    const r = m.room('r', 'R', [c]); r.services = { pin: true };
    m.setHouse([r], [], false);
    const res = {};
    // pin → undo
    D.studyOn = true; window.render();
    document.querySelector('[data-act="pin"][data-fid="cf"]').click();
    const pinned = (D.house.rooms[0].cards[0].tag || []).includes('pinned');
    window.undo();
    res.pin = { pinned, afterUndo: (m.D().house.rooms[0].cards[0].tag || []).includes('pinned') };
    // card width via the edge drag → persisted + undoable (the panel input is gone by design)
    const D2 = m.D(); D2.studyOn = false; window.render();
    const rz = document.querySelector('[data-fid="cf"] .rz[data-rz]');
    const rb = rz.getBoundingClientRect();
    const pe = (t, x, el) => (el || document).dispatchEvent(new PointerEvent(t, { clientX: x, clientY: rb.y + 10, bubbles: true, button: 0, cancelable: true }));
    pe('pointerdown', rb.x + 5, rz); pe('pointermove', rb.x + 200); pe('pointerup', rb.x + 200);
    const wDragged = m.D().house.rooms[0].cards[0].place.w;
    const stored = JSON.parse(localStorage.getItem('lsa_db_v13'));
    res.width = { changed: wDragged !== 8, persisted: stored.houses[0].rooms[0].cards[0].place.w === wDragged };
    window.undo();
    res.width.afterUndo = m.D().house.rooms[0].cards[0].place.w;
    // fuse split via real pointer drag on the seam (an Edit-mode author gesture) → undoable
    const D3 = m.D(); D3.studyOn = false; window.render();
    const gut = document.querySelector('[data-fid="cf"] .fusegut');
    const g = gut.getBoundingClientRect();
    gut.dispatchEvent(new PointerEvent('pointerdown', { clientX: g.x + 1, clientY: g.y + 5, bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: g.x + 120, clientY: g.y + 5, bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: g.x + 120, clientY: g.y + 5, bubbles: true }));
    const card = m.D().house.rooms[0].cards[0];
    const wAfterDrag = card.slots[0].fuseW;
    window.undo();
    res.fuse = { changed: wAfterDrag !== 1, afterUndo: m.D().house.rooms[0].cards[0].slots[0].fuseW };
    return res;
  });
  expect(out.pin.pinned).toBe(true);
  expect(out.pin.afterUndo).toBe(false);
  expect(out.width.changed).toBe(true);
  expect(out.width.persisted).toBe(true);
  expect(out.width.afterUndo).toBe(8);
  expect(out.fuse.changed).toBe(true);
  expect(out.fuse.afterUndo).toBe(1);
});

test('B7: pinned tag self-prunes and cannot be renamed away', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const c = m.card('cn', 'N', [m.slot('s1', 'text', { text: 'x' })], { w: 8 });
    const r = m.room('r', 'R', [c]); r.services = { pin: true };
    m.setHouse([r], [], true);
    const pinBtn = () => document.querySelector('[data-act="pin"][data-fid="cn"]');
    pinBtn().click();
    const catOn = D.house.cats.includes('pinned');
    pinBtn().click();                                       // unpin the last one
    const catPruned = !m.D().house.cats.includes('pinned');
    // rename block
    pinBtn().click();                                       // pin again so the tag exists
    const D2 = m.D(); D2.studyOn = false; window.render();
    const tr = document.querySelector('[data-act="tagrename"][data-old="pinned"]');
    if (tr) { tr.value = 'done'; tr.dispatchEvent(new Event('change', { bubbles: true })); }
    return { catOn, catPruned, renameInput: !!tr,
             stillPinned: m.D().house.cats.includes('pinned'), forked: m.D().house.cats.includes('done') };
  });
  expect(out.catOn).toBe(true);
  expect(out.catPruned).toBe(true);
  expect(out.stillPinned).toBe(true);                       // rename refused
  expect(out.forked).toBe(false);
});
