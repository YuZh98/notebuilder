import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

const LEGACY = `{
  name: 'Old Export', subtitle: '', style: 'sketch', width: 'medium', cats: [],
  rooms: [{ id: 'r1', name: 'R', kind: 'dedicated', dedType: 'Note', locked: false, services: { pin: true }, categories: [], notes: [],
    cards: [
      { id: 'c1', name: 'Checklist', slots: [{ id: 's1', type: 'check', props: { title: 'T', items: 'a\\nb' }, verbs: {} }],
        container: {}, rules: {}, accent: '', variety: '1', place: { w: 6 }, content: {}, tag: [], state: { _done: { 1: true }, _pin: true, _flip: true } },
      { id: 'c2', name: 'Pair', slots: [
          { id: 's2', type: 'text', props: { text: 'L' }, verbs: {}, fuse: true, fuseRatio: 0.7 },
          { id: 's3', type: 'link', props: { label: 'dead', target: 'x' }, verbs: {} },
          { id: 's4', type: 'text', props: { text: 'R' }, verbs: {} }],
        container: {}, rules: {}, accent: '', variety: '1', place: { w: 12 }, content: {}, tag: [], state: {} }
    ], active: true }], active: 'r1'
}`;

test('Spec A: importing a legacy file applies the same migrations as load, immediately', async ({ page }) => {
  const out = await page.evaluate(`(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const before = D.houses.length;
    const ok = window.importHouse(JSON.stringify(${LEGACY}));
    const h = D.houses[D.houses.length - 1];
    const c1 = h.rooms[0].cards[0], c2 = h.rooms[0].cards[1];
    window.render();
    return { ok, added: D.houses.length === before + 1,
      checkMigrated: c1.slots[0].type === 'list' && c1.slots[0].props.style === 'check',
      doneNested: JSON.stringify(c1.state._done) === '{"s1":{"1":true}}',
      pinTag: (c1.tag || []).includes('pinned') && !('_pin' in c1.state),
      presScrubbed: !('_flip' in c1.state),
      deadSlotGone: !c2.slots.some(s => s.type === 'link'),
      fuseW: c2.slots[0].fuseW === 0.7 && !('fuseRatio' in c2.slots[0]),
      styleGone: !('style' in h),
      renders: !!document.querySelector('[data-fid="c1"] .taskit input') };
  })()`);
  for (const [k, v] of Object.entries(out)) expect(v, k).toBe(true);
});

test('Spec A: exports carry schemaVersion; a newer-versioned file is refused, never a husk', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const json = JSON.parse((() => { let t; const real = URL.createObjectURL; URL.createObjectURL = b => { t = b; return 'blob:x'; };
      HTMLAnchorElement.prototype.click = function () {}; doExport(); URL.createObjectURL = real; return t; })() ? '{}' : '{}');
    return null;
  }).catch(() => null);
  const out2 = await page.evaluate(async () => {
    const m = window.__mk; m.reset(); const D = m.D();
    let blob; const real = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return 'blob:x'; };
    HTMLAnchorElement.prototype.click = function () {};
    doExport(); URL.createObjectURL = real;
    const exported = JSON.parse(await blob.text());
    const before = D.houses.length;
    const refused = !window.importHouse(JSON.stringify({ schemaVersion: 999, rooms: [{ id: 'r', name: 'R', cards: [] }] }));
    return { version: exported.schemaVersion, refused, unchanged: D.houses.length === before,
             toast: (document.querySelector('#toast') || {}).textContent || '' };
  });
  expect(out2.version).toBe(4);
  expect(out2.refused).toBe(true);
  expect(out2.unchanged).toBe(true);
  expect(out2.toast.toLowerCase()).toMatch(/newer|version/);
});
