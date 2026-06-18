import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// Variables are CARD-scoped: a control (slider/number), compute `out`, or choice key wires only
// readers in the SAME card (front+back). Same key in different cards = independent variables.

test.beforeEach(async ({ page }) => { await open(page); });

test('same key in two cards is two independent variables', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const a = m.card('ca', 'A', [m.slot('s1', 'slider', { key: 'z', min: 0, max: 100, value: 3, step: 1 }), m.slot('s2', 'compute', { expr: 'z*2', note: '' })], { w: 12 });
    const b = m.card('cb', 'B', [m.slot('s3', 'slider', { key: 'z', min: 0, max: 100, value: 5, step: 1 }), m.slot('s4', 'compute', { expr: 'z*2', note: '' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [a, b])], [], true);
    const val = fid => document.querySelector(`[data-fid="${fid}"] .compute .cval`).textContent;
    const before = { a: val('ca'), b: val('cb') };
    const inp = document.querySelector('[data-fid="ca"] input[type=range]');
    inp.value = '7'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    const after = { a: val('ca'), b: val('cb') };
    return { before, after };
  });
  expect(out.before).toEqual({ a: '6', b: '10' });   // each card reads its OWN z
  expect(out.after).toEqual({ a: '14', b: '10' });   // dragging A's z never moves B
});

test('a formula cannot read a variable defined in another card', async ({ page }) => {
  const txt = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const a = m.card('ca', 'A', [m.slot('sa', 'slider', { key: 'rate', min: 0, max: 100, value: 5, step: 1 })], { w: 12 });
    const b = m.card('cb', 'B', [m.slot('sb', 'compute', { expr: 'rate*2', note: '' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [a, b])], [], true);
    return document.querySelector('[data-fid="cb"] .compute .cval').textContent;
  });
  expect(txt).toBe('0');   // unknown identifier evaluates to 0, not the other card's value
});

test('in-card derived chain settles: slider → compute out → second compute', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [
      m.slot('s1', 'slider', { key: 'churn', min: 1, max: 20, value: 5, step: 1 }),
      m.slot('s2', 'compute', { expr: '100/churn', out: 'lifetime', note: '' }),
      m.slot('s3', 'compute', { expr: 'lifetime*2', note: '' }),
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const val = () => document.querySelector('[data-fid="cc"] [data-sid="s3"] .cval').textContent;
    const before = val();
    const inp = document.querySelector('[data-fid="cc"] input[type=range]');
    inp.value = '10'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, after: val() };
  });
  expect(out.before).toBe('40');
  expect(out.after).toBe('20');
});

test('chart hover reads the chart\'s own card, not a later definer elsewhere', async ({ page }) => {
  const valText = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const a = m.card('ca', 'A', [
      m.slot('s1', 'slider', { key: 'z', min: 0, max: 100, value: 40, step: 1 }),
      m.slot('s2', 'chart', { fn: 'z', x0: 0, x1: 10, y0: 0, y1: 100, xticks: 0, yticks: 0, hover: true }),
    ], { w: 12 });
    const b = m.card('cb', 'B', [m.slot('s3', 'slider', { key: 'z', min: 0, max: 100, value: 3, step: 1 })], { w: 12 });
    m.setHouse([m.room('r', 'R', [a, b])], [], true);
    const svg = document.querySelector('[data-fid="ca"] svg.chart-svg');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    return svg.querySelector('.chart-val').textContent;
  });
  expect(valText).toContain('40');   // own card's z, not card B's z=3
});

test('a slider inside a card reflows that card\'s fused-reveal cells live', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const S = (id, txt, o = {}) => Object.assign({ id, type: 'text', props: { text: txt }, verbs: {}, w: 4 }, o);
    const c = m.card('cf', 'F', [
      S('s1', 'LEFT', { fuse: true }),
      S('s2', 'MID', { fuse: true, verbs: { reveal: { key: 'v', op: '>=', val: 5 } } }),
      S('s3', 'RIGHT', {}),
      { id: 'sv', type: 'slider', props: { key: 'v', min: 0, max: 10, value: 2, step: 1 }, verbs: {}, w: 12 },
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const probe = () => { const fw = document.querySelector('[data-fid="cf"] .fusewrap');
      return { cells: fw ? fw.querySelectorAll('.fusecell').length : 0, guts: fw ? fw.querySelectorAll('.fusegut').length : 0 }; };
    const hidden = probe();                                       // v=2 → MID hidden
    const sl = document.querySelector('[data-fid="cf"] input[type=range]');
    sl.value = 7; sl.dispatchEvent(new Event('input', { bubbles: true }));
    const shown = probe();                                        // v=7 → MID back
    return { hidden, shown };
  });
  expect(out.hidden).toEqual({ cells: 2, guts: 1 });
  expect(out.shown).toEqual({ cells: 3, guts: 2 });
});

test('import warns when a formula references a variable outside its card', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const h = { name: 'old wiring', rooms: [{ id: 'r1', name: 'R', cards: [
      { id: 'f1', name: 'def', slots: [{ id: 's1', type: 'slider', props: { key: 'p', min: 0, max: 10, value: 1 }, verbs: {} }], place: { w: 6 }, content: {}, tag: [], state: {} },
      { id: 'f2', name: 'read', slots: [{ id: 's2', type: 'compute', props: { expr: 'p*2', note: '' }, verbs: {} }], place: { w: 6 }, content: {}, tag: [], state: {} },
    ] }] };
    const ok = window.importHouse(JSON.stringify(h));
    return { ok, toast: (document.querySelector('#toast') || {}).textContent || '' };
  });
  expect(out.ok).toBe(true);
  expect(out.toast).toContain('outside their card');
});

test('import stays quiet for same-key definers in different cards (no longer a hazard)', async ({ page }) => {
  const toastTxt = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const mkCard = (fid, sid) => ({ id: fid, name: 'q', slots: [
      { id: sid + 'a', type: 'number', props: { key: 'ans', value: 0 }, verbs: {} },
      { id: sid + 'b', type: 'compute', props: { expr: 'ans*1', note: '' }, verbs: {} },
    ], place: { w: 6 }, content: {}, tag: [], state: {} });
    const h = { name: 'drills', rooms: [{ id: 'r1', name: 'R', cards: [mkCard('f1', 's1'), mkCard('f2', 's2')] }] };
    window.importHouse(JSON.stringify(h));
    return (document.querySelector('#toast') || {}).textContent || '';
  });
  expect(toastTxt).not.toContain('shared definers');
  expect(toastTxt).not.toContain('outside their card');
});
