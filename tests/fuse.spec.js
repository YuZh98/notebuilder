import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('three fused slots render as one row with two adjustable seams', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const S = (id, txt, fuse) => ({ id, type: 'text', props: { text: txt }, verbs: {}, fuse, w: 4 });
    const c = m.card('cf', 'F', [S('s1', 'AAA', true), S('s2', 'BBB', true), S('s3', 'CCC', false)], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const el = document.querySelector('[data-fid="cf"]');
    const wraps = el.querySelectorAll('.fusewrap');
    const cells = el.querySelectorAll('.fusewrap .fusecell');
    const guts = el.querySelectorAll('.fusewrap .fusegut');
    const texts = [...cells].map(c => c.textContent.trim());
    // all three on one visual row
    const ys = [...cells].map(c => Math.round(c.getBoundingClientRect().top));
    return { wraps: wraps.length, cells: cells.length, guts: guts.length, texts, sameRow: new Set(ys).size === 1 };
  });
  expect(out.wraps).toBe(1);
  expect(out.cells).toBe(3);
  expect(out.guts).toBe(2);
  expect(out.texts).toEqual(['AAA', 'BBB', 'CCC']);
  expect(out.sameRow).toBe(true);
});

test('legacy pair fuseRatio migrates to weights and keeps its split', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const S = (id, txt, o = {}) => Object.assign({ id, type: 'text', props: { text: txt }, verbs: {}, w: 6 }, o);
    const c = m.card('cp', 'P', [S('s1', 'L', { fuse: true, fuseRatio: 0.7 }), S('s2', 'R')], { w: 12 });
    D.house.rooms[0].cards = [c];
    window.rebuildRefs(); D.studyOn = true; window.render();
    const cells = [...document.querySelectorAll('[data-fid="cp"] .fusecell')];
    const w = cells.map(c => c.getBoundingClientRect().width);
    const slot = D.house.rooms[0].cards[0].slots[0];
    return { ratio: w[0] / (w[0] + w[1]), ratioGone: slot.fuseRatio === undefined, weights: [D.house.rooms[0].cards[0].slots[0].fuseW, D.house.rooms[0].cards[0].slots[1].fuseW] };
  });
  expect(out.ratio).toBeGreaterThan(0.6);
  expect(out.ratio).toBeLessThan(0.8);
  expect(out.ratioGone).toBe(true);
});

test('the seam is a thin full-height line', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const S = (id, txt, fuse) => ({ id, type: 'text', props: { text: txt + '\n\nmore\n\nlines' }, verbs: {}, fuse, w: 6 });
    const c = m.card('cs', 'S', [S('s1', 'left', true), S('s2', 'right', false)], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const gut = document.querySelector('[data-fid="cs"] .fusegut').getBoundingClientRect();
    const wrap = document.querySelector('[data-fid="cs"] .fusewrap').getBoundingClientRect();
    return { w: gut.width, full: gut.height >= wrap.height - 2 };   // may exceed the wrap: it bleeds to the card edges
  });
  expect(out.w).toBeLessThanOrEqual(3);
  expect(out.full).toBe(true);
});

test('factory bench renders a 3-chain too', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; window.render();
    for (const t of ['text', 'text', 'text']) document.querySelector(`[data-act="addslot"][data-t="${t}"]`).click();
    D.bench.slots[0].fuse = true; D.bench.slots[1].fuse = true; window.render();
    const chain = document.querySelector('.benchfuse');
    return { cells: chain ? chain.querySelectorAll('.benchslot').length : 0, bars: chain ? chain.querySelectorAll('.fusebar').length : 0 };
  });
  expect(out.cells).toBe(3);
  expect(out.bars).toBe(2);
});
