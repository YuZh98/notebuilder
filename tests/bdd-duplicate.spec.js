import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('Spec B: Duplicate copies a placed card — content, variety, width — inserted after, one undo step', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    m.setHouse([m.room('r', 'R', [])], [], false);
    const fc = D.products.find(p => p.name === 'Flashcard');
    document.querySelector(`[data-act="selprod"][data-id="${fc.id}"]`).click();
    document.querySelector('#side [data-act="pickvariety"][data-v="Mint"]').click();
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Place in')).click();
    const orig = D.house.rooms[0].cards[0];
    orig.content[orig.slots[0].id] = { text: 'MY EDIT' }; orig.place.w = 5;
    window.render();
    document.querySelector(`[data-fid="${orig.id}"]`).click();
    const undo0 = D._undo.length;
    document.querySelector('#side [data-act="dupfurn"]').click();
    const cards = D.house.rooms[0].cards;
    const dup = cards[1];
    const res = { n: cards.length, afterOriginal: cards[0].id === orig.id,
      content: dup.content[dup.slots[0].id].text, variety: dup.variety, accent: dup.accent, w: dup.place.w,
      newId: dup.id !== orig.id, oneStep: D._undo.length === undo0 + 1 };
    window.undo();
    res.afterUndo = D.house.rooms[0].cards.length;
    return res;
  });
  expect(out.n).toBe(2);
  expect(out.afterOriginal).toBe(true);
  expect(out.content).toBe('MY EDIT');
  expect(out.variety).toBe('Mint');
  expect(out.accent).toBe('#54d6a0');
  expect(out.w).toBe(5);
  expect(out.newId).toBe(true);
  expect(out.oneStep).toBe(true);
  expect(out.afterUndo).toBe(1);
});

test('Spec B: duplicating a wired card keeps its keys — copies are independent (card scope)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const c = m.card('cw', 'W', [m.slot('s1', 'slider', { key: 'z', min: 0, max: 100, value: 5, step: 1 }), m.slot('s2', 'compute', { expr: 'z*2', note: '' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], false);
    document.querySelector('[data-fid="cw"]').click();
    document.querySelector('#side [data-act="dupfurn"]').click();
    const cards = D.house.rooms[0].cards;
    const keys = cards.map(x => x.slots[0].props.key);
    D.studyOn = true; window.render();
    const dupId = cards[1].id;
    const inp = document.querySelector(`[data-fid="${dupId}"] input[type=range]`);
    inp.value = '9'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    const val = fid => document.querySelector(`[data-fid="${fid}"] .compute .cval`).textContent;
    return { keys, orig: val('cw'), dup: val(dupId) };
  });
  expect(out.keys).toEqual(['z', 'z']);   // no rename — same key, two cards
  expect(out.orig).toBe('10');            // original untouched by the copy's drag
  expect(out.dup).toBe('18');
});

test('Spec B: Place stays armed — three clicks, three cards', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    m.setHouse([m.room('r', 'R', [])], [], false);
    const note = D.products.find(p => p.name === 'Note');
    document.querySelector(`[data-act="selprod"][data-id="${note.id}"]`).click();
    for (let i = 0; i < 3; i++) {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Place in'));
      if (!btn) return { broke: i };
      btn.click();
    }
    return { n: D.house.rooms[0].cards.length };
  });
  expect(out.n).toBe(3);
});
