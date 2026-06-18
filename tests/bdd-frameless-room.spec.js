import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('frameless is truly frameless under decorated themes, seams included', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const S = (id, txt, o = {}) => Object.assign({ id, type: 'text', props: { text: txt }, verbs: {}, w: 6 }, o);
    const c = m.card('cb', 'B', [S('s1', 'L', { fuse: true }), S('s2', 'R')], { container: { bare: true }, w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    D.theme = 'sketch'; window.render();
    const el = document.querySelector('[data-fid="cb"]');
    const cs = getComputedStyle(el);
    const gut = getComputedStyle(document.querySelector('[data-fid="cb"] .fusegut'));
    return { borderW: cs.borderTopWidth, shadow: cs.boxShadow, gutBg: gut.backgroundColor };
  });
  expect(out.borderW).toBe('0px');
  expect(out.shadow).toBe('none');
  expect(out.gutBg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);   // the seam renders as nothing
});

test('room width applies to the whole room: frame, title and lock follow the edge', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('c1', 'N', [m.slot('s1', 'text', { text: 'x' })], { w: 6 });
    const r = m.room('r', 'R', [c]); r.title = 'My Room';
    m.setHouse([r], [], false);
  });
  const edge = page.locator('.room[data-room="r"] [data-roomrz]');
  const b = await edge.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 60);
  await page.mouse.down();
  await page.mouse.move(b.x - 250, b.y + 60, { steps: 6 });
  await page.mouse.up();
  const out = await page.evaluate(() => {
    const room = document.querySelector('.room[data-room="r"]').getBoundingClientRect();
    const stage = document.querySelector('.card-shell').getBoundingClientRect();
    const title = document.querySelector('.room[data-room="r"] .room-title').getBoundingClientRect();
    const lock = document.querySelector('.room[data-room="r"] .room-lock').getBoundingClientRect();
    return { roomW: room.width, stageW: stage.width, titleInside: title.right <= room.right + 1, lockInside: lock.right <= room.right + 1, stored: window.__mk.D().house.rooms[0].width };
  });
  expect(out.roomW).toBeLessThan(out.stageW - 100);   // the ROOM box shrank, not just the inner grid
  expect(out.titleInside).toBe(true);
  expect(out.lockInside).toBe(true);
  expect(out.stored).toBeGreaterThan(100);
});
