import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('B15: print hides the resizer bar', async ({ page }) => {
  const ok = await page.evaluate(() => {
    for (const sheet of document.styleSheets) for (const r of sheet.cssRules || [])
      if (r.media && /print/.test(r.media.mediaText))
        for (const rr of r.cssRules || []) if (/#resizer/.test(rr.selectorText) && /none/.test(rr.style.display)) return true;
    return false;
  });
  expect(ok).toBe(true);
});

test('B12: Enter commits the notebook title; newlines never enter single-line fields', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'house'; D.studyOn = false; window.render();
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('.ceview.house-title').click();
    const ta = document.querySelector('textarea.ce[data-act="ht"]');
    ta.value = 'Clean Title'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(250);                                                             // focusout debounce
    const committed = !document.querySelector('textarea.ce[data-act="ht"]');     // editor closed
    document.querySelector('.ceview.house-title').click();
    const ta2 = document.querySelector('textarea.ce[data-act="ht"]');
    ta2.value = 'multi\nline\ntitle'; ta2.dispatchEvent(new Event('input', { bubbles: true }));
    return { committed, hasNL: /\n/.test(m.D().house.name) };
  });
  expect(out.committed).toBe(true);
  expect(out.hasNL).toBe(false);
});

test('B11: a failed save warns loudly once, not per keystroke', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const real = Storage.prototype.setItem; let calls = 0;
    Storage.prototype.setItem = function () { calls++; throw new Error('quota'); };
    window.save(); const t1 = document.querySelector('#toast,.toast')?.textContent || '';
    document.querySelector('#toast,.toast')?.remove();
    window.save(); const t2 = document.querySelector('#toast,.toast')?.textContent || '';
    Storage.prototype.setItem = real;
    window.save();                                          // succeeds → warning re-arms
    Storage.prototype.setItem = function () { calls++; throw new Error('quota'); };
    window.save(); const t3 = document.querySelector('#toast,.toast')?.textContent || '';
    Storage.prototype.setItem = real;
    return { t1, t2, t3 };
  });
  expect(out.t1.toLowerCase()).toContain('not saved');
  expect(out.t2).toBe('');                                  // no spam on the next failed save
  expect(out.t3.toLowerCase()).toContain('not saved');      // re-armed after a success
});

test('B4: JSON export is sanitized like the living export', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const c = m.card('cf', 'FC', [m.slot('s1', 'text', { text: 'q' })], { container: { flip: true }, back: [m.slot('s2', 'text', { text: 'a' })], w: 8 });
    c.tag = ['pinned'];
    const r = m.room('r', 'R', [c]); r.services = { pin: true, search: true };
    m.setHouse([r], ['pinned'], true);
    document.querySelector('[data-fid="cf"] [data-act="flip"]').click();          // study state
    const si = document.querySelector('[data-act="searchin"]'); if (si) { si.value = 'secret'; si.dispatchEvent(new Event('input', { bubbles: true })); }
    let captured = null; const realURL = URL.createObjectURL;
    URL.createObjectURL = b => { captured = b; return 'blob:x'; };
    HTMLAnchorElement.prototype.click = function () {};                            // swallow the download
    doExport(); URL.createObjectURL = realURL;
    return captured.text().then(txt => { const h = JSON.parse(txt); const card = h.rooms[0].cards[0];
      return { q: h.rooms[0]._q, flip: card.state._flip, tagKept: card.tag.includes('pinned') }; });
  });
  expect(out.q).toBeUndefined();
  expect(out.flip).toBeFalsy();
  expect(out.tagKept).toBe(true);
});

test('B10: coverage selections referencing vanished values self-prune', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const mk = (id, n) => m.card(id, n, [m.slot('s' + id, 'text', { text: n })], { w: 4 });
    const r1 = m.room('r1', 'A', [mk('c1', 'Alpha'), mk('c2', 'Beta')]);
    const r2 = m.room('r2', 'B', [mk('c3', 'Alpha')]);
    m.setHouse([r1, r2], [], false);
    // select a real product cell via the UI (alpha column)
    const cell = [...document.querySelectorAll('[data-act="mtxcell"]')].find(c => c.dataset.cv === 'alpha' || c.dataset.rv === 'alpha');
    if (!cell) return { noCell: true, acts: [...document.querySelectorAll('.mtx-wrap [data-act]')].map(e => e.dataset.act).slice(0, 8) };
    cell.click();
    const before = filterActive();
    // delete every Alpha card → the product-axis value disappears
    D.house.rooms[0].cards = D.house.rooms[0].cards.filter(c => c.name !== 'Alpha');
    D.house.rooms[1].cards = [];
    window.render();
    return { before, filter: filterActive(), clearBtn: !!document.querySelector('[data-act="mtxclear"]') };
  });
  expect(out.noCell).toBeUndefined();
  expect(out.before).toBe(true);
  expect(out.filter).toBe(false);
  expect(out.clearBtn).toBe(false);
});
