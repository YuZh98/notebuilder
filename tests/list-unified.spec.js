import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('list slot renders bullets, numbered, and check styles', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const S = (id, style, extra = {}) => ({ id, type: 'list', props: Object.assign({ items: 'one\ntwo\nthree', style }, extra), verbs: {} });
    const c = m.card('cl', 'L', [S('s1', 'bullets'), S('s2', 'numbered'), S('s3', 'check', { title: 'Todo' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const el = document.querySelector('[data-fid="cl"]');
    el.querySelector('.taskit input').click();          // tick the first box
    const D = m.D();
    return {
      bullets: el.querySelectorAll('ul li').length,
      numbered: el.querySelectorAll('ol li').length,
      boxes: el.querySelectorAll('.taskit input').length,
      counter: /1\/3/.test(el.textContent),
      done: (D.house.rooms[0].cards[0].state._done||{}).s3,
    };
  });
  expect(out.bullets).toBe(3);
  expect(out.numbered).toBe(3);
  expect(out.boxes).toBe(3);
  expect(out.counter).toBe(true);
  expect(out.done).toEqual({ 0: true });
});

test('legacy check slots and bare list slots migrate to the unified list slot on load', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    // simulate an OLD save: raw check slot + style-less list slot
    const oldCheck = { id: 'sc', type: 'check', props: { title: 'Drill', items: 'a\nb' }, verbs: {} };
    const oldList = { id: 'sl', type: 'list', props: { items: 'x\ny' }, verbs: {} };
    const c = m.card('cm', 'M', [oldCheck, oldList], { w: 12 });
    D.house.rooms[0].cards = [c];
    window.rebuildRefs(); D.studyOn = true; window.render();
    const migrated = D.house.rooms[0].cards[0].slots.map(s => ({ t: s.type, style: s.props.style }));
    const el = document.querySelector('[data-fid="cm"]');
    return { migrated, boxes: el.querySelectorAll('.taskit input').length, bullets: el.querySelectorAll('ul li').length, title: el.textContent.includes('Drill') };
  });
  expect(out.migrated).toEqual([{ t: 'list', style: 'check' }, { t: 'list', style: 'bullets' }]);
  expect(out.boxes).toBe(2);
  expect(out.bullets).toBe(2);
  expect(out.title).toBe(true);
});
