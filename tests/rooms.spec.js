import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('add-room inserts directly below the selected room, not at the bottom', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const rooms = [m.room('ra', 'A'), m.room('rb', 'B'), m.room('rc', 'C')];
    m.setHouse(rooms, [], false);
    D.house.active = 'rb';                       // middle room selected
    window.render();
    document.querySelector('[data-act="addroom"]').click();
    return { order: m.D().house.rooms.map(r => r.name), active: m.D().house.active, newId: m.D().house.rooms[2].id };
  });
  expect(out.order.length).toBe(4);
  expect(out.order[0]).toBe('A');
  expect(out.order[1]).toBe('B');
  expect(out.order[3]).toBe('C');                // C pushed down — new room sits at index 2
  expect(out.active).toBe(out.newId);            // and is selected
});

test('divider rooms work; mixed/dedicated vocabulary is gone from the UI', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const a = m.room('ra', 'A', [m.card('c1', 'N', [m.slot('s1', 'text', { text: 'hi' })], { w: 8 })]);
    const d = m.room('rd', 'd1', [], 'divider');
    const b = m.room('rb', 'B');
    m.setHouse([a, d, b], [], false);
    const stage = document.querySelector('#stage').textContent;
    const dividerEl = !!document.querySelector('.room.divider[data-room="rd"]');
    D.studyOn = true; window.render();
    const dividerStudy = !!document.querySelector('.room.divider[data-room="rd"]');
    return { dividerEl, dividerStudy, mentionsMixed: /Mixed|Dedicated/.test(stage) };
  });
  expect(out.dividerEl).toBe(true);
  expect(out.dividerStudy).toBe(true);
  expect(out.mentionsMixed).toBe(false);
});

test('+ divider creates a section break below the selected room (first-class affordance)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    m.setHouse([m.room('ra', 'A'), m.room('rb', 'B')], [], false);
    D.house.active = 'ra'; window.render();
    const btn = document.querySelector('[data-act="adddivider"]');
    if (!btn) return { btn: false };
    btn.click();
    const rooms = m.D().house.rooms;
    return { btn: true, kinds: rooms.map(r => r.kind), names: rooms.map(r => r.name), n: rooms.length };
  });
  expect(out.btn).toBe(true);
  expect(out.n).toBe(3);
  expect(out.kinds[1]).toBe('divider');          // inserted right below A
});

test('legacy dedicated rooms load as normal rooms and accept any card (no type gate)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const r = m.room('rd', 'Vocab', [m.card('c1', 'Flashcard', [m.slot('s1', 'text', { text: 'q' })], { w: 8 })], 'dedicated');
    r.dedType = 'Flashcard';
    m.setHouse([r], [], false);
    // place a DIFFERENT product type via the panel Place button path
    const p = D.products.find(x => x.name !== 'Flashcard');
    document.querySelector(`[data-act="selprod"][data-id="${p.id}"]`)?.click();
    const place = document.querySelector('[data-act="placeprod"]');
    if (place) place.click();
    const cards = m.D().house.rooms[0].cards;
    const meta = document.querySelector('#stage').textContent;
    return { nCards: cards.length, label: /Dedicated/.test(meta) };
  });
  expect(out.nCards).toBe(2);                    // the gate is gone — any card fits
  expect(out.label).toBe(false);
});
