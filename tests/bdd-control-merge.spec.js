import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// slider absorbs number: one slot type. "Number" = bar hidden + empty range. Clamping is tied to a
// FINITE range, not to bar visibility. number-typed slots migrate forever.

test.beforeEach(async ({ page }) => { await open(page); });

test('the factory palette offers one control slot, not two (number is gone)', async ({ page }) => {
  const slots = await page.evaluate(() => { window.__mk.D().place = 'factory'; window.render(); return [...document.querySelectorAll('[data-slotdrag]')].map(b => b.dataset.slotdrag); });
  expect(slots).toContain('slider');
  expect(slots).not.toContain('number');
});

test('a number-typed slot migrates to slider: bar off, range empty, name shown', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const h = { name: 'old', rooms: [{ id: 'r1', name: 'R', cards: [
      { id: 'f1', name: 'q', slots: [{ id: 's1', type: 'number', props: { key: 'ans', value: 0, step: 1, showValue: true }, verbs: {} }], place: { w: 6 }, content: {}, tag: [], state: {} },
    ] }] };
    window.importHouse(JSON.stringify(h));
    const s = window.__mk.D().house.rooms[0].cards[0].slots[0];
    return { type: s.type, showSlider: s.props.showSlider, showName: s.props.showName, showValue: s.props.showValue, min: s.props.min, max: s.props.max };
  });
  expect(out.type).toBe('slider');
  expect(out.showSlider).toBe(false);   // no bar
  expect(out.showName).toBe(true);      // old `showValue` toggled the NAME label — remapped
  expect(out.showValue).toBe(true);     // the value box stays
  expect(out.min === '' || out.min == null).toBe(true);   // free entry, no range
  expect(out.max === '' || out.max == null).toBe(true);
});

test('a free-entry control (empty range) does NOT clamp typed values', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [
      m.slot('s1', 'slider', { key: 'ans', value: 0, step: 1, showSlider: false, showName: true, showValue: true, min: '', max: '' }),
      m.slot('s2', 'compute', { expr: 'ans', note: '' }),
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const num = document.querySelector('[data-fid="cc"] input[type=number][data-key="ans"]');
    num.value = '144'; num.dispatchEvent(new Event('input', { bubbles: true }));
    return { box: !!num, noRange: !document.querySelector('[data-fid="cc"] input[type=range][data-key="ans"]'), val: document.querySelector('[data-fid="cc"] .compute .cval').textContent };
  });
  expect(out.box).toBe(true);
  expect(out.noRange).toBe(true);
  expect(out.val).toBe('144');   // unbounded — the answer-entry contract
});

test('a finite range still clamps, bar or no bar', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [
      m.slot('s1', 'slider', { key: 'w', min: 0, max: 10, value: 5, showSlider: false, showValue: true }),
      m.slot('s2', 'compute', { expr: 'w', note: '' }),
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const num = document.querySelector('[data-fid="cc"] input[type=number][data-key="w"]');
    num.value = '99'; num.dispatchEvent(new Event('input', { bubbles: true }));
    return document.querySelector('[data-fid="cc"] .compute .cval').textContent;
  });
  expect(out).toBe('10');   // clamped to max even with the bar hidden
});

test('two controls keyed the same in two cards stay independent (free entry too)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const mk = (fid, sid) => m.card(fid, fid, [
      m.slot(sid, 'slider', { key: 'ans', value: 0, step: 1, showSlider: false, showValue: true, min: '', max: '' }),
      m.slot(sid + 'c', 'compute', { expr: 'ans', note: '' }),
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [mk('ca', 'sa'), mk('cb', 'sb')])], [], true);
    const a = document.querySelector('[data-fid="ca"] input[type=number][data-key="ans"]');
    a.value = '42'; a.dispatchEvent(new Event('input', { bubbles: true }));
    const val = fid => document.querySelector(`[data-fid="${fid}"] .compute .cval`).textContent;
    return { a: val('ca'), b: val('cb') };
  });
  expect(out.a).toBe('42');
  expect(out.b).toBe('0');
});

test('in Edit a control shows the same box as Study, disabled (WYSIWYG)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [
      m.slot('s1', 'slider', { key: 'n', value: 7, step: 1, showSlider: false, showValue: true, min: '', max: '' }),
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], false);   // Edit
    const box = document.querySelector('[data-fid="cc"] input[type=number][data-key="n"]');
    return { present: !!box, disabled: box ? box.disabled : null, value: box ? box.value : null };
  });
  expect(out.present).toBe(true);    // box visible in Edit too — author sees what Study looks like
  expect(out.disabled).toBe(true);   // inert in Edit
  expect(out.value).toBe('7');
});

test('the value box hugs its range: a tight range gives a narrower box than a wide one', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [
      m.slot('s1', 'slider', { key: 'a', min: 0, max: 9, value: 0, showSlider: false, showValue: true }),       // 1 digit
      m.slot('s2', 'slider', { key: 'b', min: 0, max: 1000000, value: 0, showSlider: false, showValue: true }), // 7 digits
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const px = key => document.querySelector(`[data-fid="cc"] input[type=number][data-key="${key}"]`).getBoundingClientRect().width;
    return { tight: px('a'), wide: px('b') };
  });
  expect(out.tight).toBeLessThan(out.wide);   // box width tracks the value's magnitude, not a fixed 6em
});

test('exports carry the current schemaVersion; same-version imports, a newer one is refused', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const m = window.__mk; m.reset(); const D = m.D();
    let blob; const real = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return 'blob:x'; };
    HTMLAnchorElement.prototype.click = function () {};
    doExport(); URL.createObjectURL = real;
    const exported = JSON.parse(await blob.text());
    const okV3 = window.importHouse(JSON.stringify({ schemaVersion: 3, name: 'v3', rooms: [{ id: 'r', name: 'R', cards: [] }] }));
    const refusedNewer = !window.importHouse(JSON.stringify({ schemaVersion: 99, rooms: [{ id: 'r', name: 'R', cards: [] }] }));
    return { version: exported.schemaVersion, okV3, refusedNewer };
  });
  expect(out.version).toBe(4);
  expect(out.okV3).toBe(true);
  expect(out.refusedNewer).toBe(true);
});
