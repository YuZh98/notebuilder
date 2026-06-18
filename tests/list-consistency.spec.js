import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('checked items get crossed off (line-through), unchecking restores', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('ck', 'C', [{ id: 's1', type: 'list', props: { title: 'T', items: 'alpha\nbeta', style: 'check' }, verbs: {} }], { w: 8 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const box = () => document.querySelector('[data-fid="ck"] .taskit input');
    const deco = () => { const t = document.querySelector('[data-fid="ck"] .taskit input:checked + *'); return t ? getComputedStyle(t).textDecorationLine : null; };
    box().click();
    const struck = deco();
    box().click();
    const anyChecked = !!document.querySelector('[data-fid="ck"] .taskit input:checked');
    return { struck, anyChecked };
  });
  expect(out.struck).toBe('line-through');
  expect(out.anyChecked).toBe(false);
});

test('Factory treats list like choice: provides the slot, no content form', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; window.render();
    const probe = t => {
      document.querySelector(`[data-act="addslot"][data-t="${t}"]`).click();
      const idx = D.bench.slots.length - 1;
      document.querySelector(`[data-act="selslot"][data-i="${idx}"]`).click();
      const side = document.querySelector('#side');
      return { form: [...side.querySelectorAll('[data-act="sprop"]')].length };
    };
    return { list: probe('list'), choice: probe('choice') };
  });
  expect(out.list.form).toBe(0);     // no raw items/title/style inputs in the Factory — content is set in Edit
  expect(out.choice.form).toBe(0);
});

test('Edit side panel shows style chips for list but no duplicate raw items form', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cl', 'L', [{ id: 's1', type: 'list', props: { title: 'T', items: 'a\nb', style: 'bullets' }, verbs: {} }], { w: 8 });
    m.setHouse([m.room('r', 'R', [c])], [], false);
    document.querySelector('[data-fid="cl"]').click();
    const side = document.querySelector('#side');
    return { chips: side.querySelectorAll('[data-act="liststyle"]').length,
             rawItems: [...side.querySelectorAll('textarea,input')].filter(i => (i.dataset.key === 'items' || i.dataset.key === 'title')).length };
  });
  expect(out.chips).toBe(3);
  expect(out.rawItems).toBe(0);
});
