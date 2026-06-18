import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

// Modes — one codebase, dev by default, ?clean for the new-user seed (separate storage key).
test('modes: ?clean loads a one-card live starter in Study; dev loads the demo', async ({ page }) => {
  await page.goto('/index.html?clean'); await page.evaluate(() => { try { localStorage.removeItem('lsa_clean_v1'); } catch (e) {} }); await page.reload(); await page.waitForFunction(() => !!window.LS && !!window.render);
  const clean = await page.evaluate(() => { const d = window.LS.DB(); return { nb: d.houses.length, rooms: d.house.rooms.length, cards: d.house.rooms.reduce((n, r) => n + r.cards.length, 0), studyOn: d.studyOn, store: (d.products || []).length }; });
  await page.goto('/index.html'); await page.waitForFunction(() => !!window.LS && !!window.render);
  const dev = await page.evaluate(() => { const d = window.LS.DB(); return { cards: d.house.rooms.reduce((n, r) => n + r.cards.length, 0) }; });
  expect(clean.nb).toBe(1);
  expect(clean.rooms).toBe(1);
  expect(clean.cards).toBe(1);            // one live, deletable example
  expect(clean.studyOn).toBe(true);       // lands in reading mode — the reactive aha first
  expect(clean.store).toBeGreaterThan(5); // same Store/Factory as dev
  expect(dev.cards).toBeGreaterThan(0);   // dev keeps the demo cards
});

// Fix 1 — a partial redraw (refreshFurn) in Edit must keep on-card text editable.
// Repro: select a card, edit a sibling slot's config in the left panel (fires refreshFurn);
// the text slot's click-to-edit affordance must survive.
test('Fix 1: a panel config edit keeps on-card text editable (refreshFurn preserves Edit)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c1', 'Q', [
      m.slot('st', 'text', { text: 'hello' }),
      m.slot('sl', 'slider', { key: 'a', min: 0, max: 100, value: 50, step: 1 }),
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false); // Edit mode
    document.querySelector('#stage .furn').click();     // select the card
    const sel = '#stage .furn[data-fid="c1"] .ceview[data-act="editslot"]';
    const before = document.querySelectorAll(sel).length;
    const inp = document.querySelector('#side [data-act="fc"][data-key="min"]');
    inp.value = '5'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    const after = document.querySelectorAll(sel).length;
    return { before, after };
  });
  expect(out.before).toBeGreaterThan(0);
  expect(out.after).toBe(out.before);
});

// Fix 4 — slider/number inputs are inert in Edit (author the default in the left panel),
// interactive only in Study.
test('Fix 4: a control is inert in Edit (disabled bar, no live box), interactive in Study', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c', 'C', [
      m.slot('sl', 'slider', { key: 'a', min: 0, max: 10, value: 5 }),                                   // bar control
      m.slot('nm', 'slider', { key: 'b', value: 3, showSlider: false, showValue: true, min: '', max: '' }), // number-style (free entry)
    ], { w: 12 });
    const read = (study) => {
      m.setHouse([m.room('r', 'R', [card])], [], study);
      const range = document.querySelector('#stage input[type=range][data-key="a"]');
      const box = document.querySelector('#stage input[type=number][data-key="b"]');
      return { rangeDisabled: range ? range.disabled : null, boxDisabled: box ? box.disabled : null };
    };
    return { edit: read(false), study: read(true) };
  });
  expect(out.edit.rangeDisabled).toBe(true);   // bar shows, disabled
  expect(out.edit.boxDisabled).toBe(true);     // box shows too (WYSIWYG), disabled in Edit
  expect(out.study.rangeDisabled).toBe(false); // bar live
  expect(out.study.boxDisabled).toBe(false);   // box live
});

// Guard: the fix must NOT leak editors into Study or a locked room.
test('Fix 1 guard: Study mode shows no on-card text editors', async ({ page }) => {
  const n = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c1', 'Q', [m.slot('st', 'text', { text: 'hi' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], true); // Study
    return document.querySelectorAll('#stage .ceview[data-act="editslot"]').length;
  });
  expect(n).toBe(0);
});

test('Fix 1 guard: a locked room shows no on-card text editors in Edit', async ({ page }) => {
  const n = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c1', 'Q', [m.slot('st', 'text', { text: 'hi' })], { w: 12 });
    const room = m.room('r', 'R', [card]); room.locked = true;
    m.setHouse([room], [], false); // Edit, but locked
    return document.querySelectorAll('#stage .ceview[data-act="editslot"]').length;
  });
  expect(n).toBe(0);
});

// 3a — the correct answer is marked in Edit (on the card), not in the Factory.
test('3a: marking a correct option in Edit writes rules.answers and Study grades it', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Pick', options: 'A\nB\nC', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false); // Edit
    document.querySelector('#stage [data-act="markans"][data-i="0"]').click(); // unmark the default
    document.querySelector('#stage [data-act="markans"][data-i="2"]').click(); // mark option 2
    const answers = window.__mk.D().house.rooms[0].cards[0].rules.answers;
    m.setHouse([m.room('r', 'R', [card])], [], true); // Study
    document.querySelector('#stage .opt[data-j="2"]').click();
    return { answers, rightClass: document.querySelector('#stage .opt[data-j="2"]').className };
  });
  expect(out.answers).toEqual([2]);
  expect(out.rightClass).toContain('right');
});

// 3a guard: the legacy single + instant path still drives a reveal-verb sibling.
test('3a guard: single+instant pick still drives a reveal-verb sibling (back-compat)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [
      m.slot('s1', 'choice', { q: 'Pick', options: 'A\nB', key: 'pick' }),
      m.slot('s2', 'text', { text: 'REVEALED' }, { reveal: { key: 'pick', op: '>=', val: 0 } }),
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], true); // Study
    const before = document.querySelector('#stage').textContent.includes('REVEALED');
    document.querySelector('#stage .opt[data-j="0"]').click();
    const after = document.querySelector('#stage').textContent.includes('REVEALED');
    return { before, after };
  });
  expect(out.before).toBe(false);
  expect(out.after).toBe(true);
});

// 3b — shuffle reorders the display in Study; correctness follows the option, not the position.
test('3b: shuffle reorders the display but preserves correctness', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Pick', options: 'A\nB\nC\nD\nE\nF', key: 'pick', shuffle: true })], { w: 12, rules: { answers: [2] } });
    m.setHouse([m.room('r', 'R', [card])], [], true); // Study → seeds the order
    const order = window.__mk.D().house.rooms[0].cards[0].state._qord.s1;
    const domOrder = [...document.querySelectorAll('#stage .opt')].map(b => +b.dataset.j);
    document.querySelector('#stage .opt[data-j="2"]').click(); // correct original index
    const rightClass = document.querySelector('#stage .opt[data-j="2"]').className;
    return { order, domOrder, rightClass };
  });
  expect([...out.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]); // a permutation
  expect(out.domOrder).toEqual(out.order);                                  // display follows it
  expect(out.rightClass).toContain('right');                               // grading tracks the option
});

test('3b: no shuffle keeps natural order', async ({ page }) => {
  const domOrder = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Pick', options: 'A\nB\nC', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    return [...document.querySelectorAll('#stage .opt')].map(b => +b.dataset.j);
  });
  expect(domOrder).toEqual([0, 1, 2]);
});

test('3b: the Shuffle toggle persists from the inspector', async ({ page }) => {
  const v = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Pick', options: 'A\nB', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    document.querySelector('#stage .furn').click();
    document.querySelector('#side [data-act="qbehav"][data-behav="shuffle"]').click();
    return window.__mk.D().house.rooms[0].cards[0].content.s1.shuffle;
  });
  expect(v).toBe(true);
});

// 3c — single/multi + instant/submit, one unified slot.
test('3c: single + instant (default) grades on click, no Check button', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Pick', options: 'A\nB', key: 'pick' })], { w: 12, rules: { answers: [0] } });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const hasCheck = !!document.querySelector('#stage [data-act="qcheck"]');
    document.querySelector('#stage .opt[data-j="0"]').click();
    return { hasCheck, c0: document.querySelector('#stage .opt[data-j="0"]').className };
  });
  expect(out.hasCheck).toBe(false);
  expect(out.c0).toContain('right');
});

test('3c: single + submit defers grading until Check', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Pick', options: 'A\nB\nC', key: 'pick', submit: true })], { w: 12, rules: { answers: [1] } });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const opt = j => document.querySelector(`#stage .opt[data-j="${j}"]`);
    opt(1).click();
    const before = opt(1).className;
    document.querySelector('#stage [data-act="qcheck"]').click();
    return { before, after: opt(1).className };
  });
  expect(out.before).toContain('sel');
  expect(out.before).not.toContain('right');
  expect(out.after).toContain('right');
});

test('3c: multi + Check marks all correct and flags wrong selections', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Pick all', options: 'A\nB\nC\nD', key: 'pick' })], { w: 12, rules: { answers: [0, 2] } }); // 2 correct → auto multi
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const opt = j => document.querySelector(`#stage .opt[data-j="${j}"]`);
    opt(0).click(); opt(1).click(); opt(2).click(); // select 0,1,2
    const before0 = opt(0).className;
    document.querySelector('#stage [data-act="qcheck"]').click();
    return { before0, c0: opt(0).className, c1: opt(1).className, c2: opt(2).className, c3: opt(3).className };
  });
  expect(out.before0).toContain('sel');
  expect(out.c0).toContain('right');
  expect(out.c2).toContain('right');
  expect(out.c1).toContain('wrong');
  expect(out.c3).not.toContain('right');
  expect(out.c3).not.toContain('wrong');
});

test('3c: multi click toggles selection off', async ({ page }) => {
  const sel = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB\nC', key: 'pick' })], { w: 12, rules: { answers: [0, 1] } }); // 2 correct → auto multi
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const opt = () => document.querySelector('#stage .opt[data-j="1"]');
    opt().click(); const on = opt().className.includes('sel');
    opt().click(); const off = opt().className.includes('sel');
    return { on, off };
  });
  expect(sel.on).toBe(true);
  expect(sel.off).toBe(false);
});

test('3c: marking a 2nd correct option in Edit turns it into a multi set', async ({ page }) => {
  const answers = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Pick', options: 'A\nB\nC', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    // fresh quiz pre-marks option 0; marking option 2 makes it a 2-answer (multi) set
    document.querySelector('#stage [data-act="markans"][data-i="2"]').click();
    return window.__mk.D().house.rooms[0].cards[0].rules.answers;
  });
  expect([...answers].sort()).toEqual([0, 2]);
});

// 3c F2 (audit) — single + submit must still drive the state key (reveal verb / reactivity).
test('3c: single+submit still drives the key (reveal verb / reactivity)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [
      m.slot('s1', 'choice', { q: 'Q', options: 'A\nB', key: 'pick', submit: true }),
      m.slot('s2', 'text', { text: 'REVEALED' }, { reveal: { key: 'pick', op: '>=', val: 0 } }),
    ], { w: 12, rules: { answers: [0] } });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const before = document.querySelector('#stage').textContent.includes('REVEALED');
    document.querySelector('#stage .opt[data-j="0"]').click(); // select, before Check
    const after = document.querySelector('#stage').textContent.includes('REVEALED');
    return { before, after, pick: window.__mk.D().house.rooms[0].cards[0].state.pick };
  });
  expect(out.before).toBe(false);
  expect(out.after).toBe(true);
  expect(out.pick).toBe(0);
});

// 3c (verify) — Try again clears the single+submit pick, so a reveal-verb sibling hides again.
test('3c: Try again clears the single+submit pick (reveal hides again)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [
      m.slot('s1', 'choice', { q: 'Q', options: 'A\nB', key: 'pick', submit: true }),
      m.slot('s2', 'text', { text: 'REVEALED' }, { reveal: { key: 'pick', op: '>=', val: 0 } }),
    ], { w: 12, rules: { answers: [0] } });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    document.querySelector('#stage .opt[data-j="0"]').click();
    document.querySelector('#stage [data-act="qcheck"]').click();
    document.querySelector('#stage [data-act="qreset"]').click();
    return { pick: window.__mk.D().house.rooms[0].cards[0].state.pick, revealed: document.querySelector('#stage').textContent.includes('REVEALED') };
  });
  expect(out.pick == null).toBe(true);
  expect(out.revealed).toBe(false);
});

// 3c — editor default matches grading: a fresh quiz pre-marks option 0.
test('3c: a fresh quiz pre-marks option 0 in the editor', async ({ page }) => {
  const on = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const single = m.card('cs', 'S', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [single])], [], false);
    return [...document.querySelectorAll('#stage .furn[data-fid="cs"] [data-act="markans"]')].map(b => b.className.includes('on'));
  });
  expect(on).toEqual([true, false]);
});

// Redesign — q/options/key are edited in-place, not in the left inspector.
test('choice: q/options/key are not in the left inspector (in-place only)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    document.querySelector('#stage .furn').click();
    return {
      q: !!document.querySelector('#side [data-act="fc"][data-key="q"]'),
      opts: !!document.querySelector('#side [data-act="fc"][data-key="options"]'),
      key: !!document.querySelector('#side [data-act="fc"][data-key="key"]'),
    };
  });
  expect(out.q).toBe(false);
  expect(out.opts).toBe(false);
  expect(out.key).toBe(false);
});

// Redesign — explanation + verdict appear after Check, never before.
test('choice: explanation + verdict show after Check, not before', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB\nC', key: 'pick', explanation: 'B is right because reasons.', submit: true })], { w: 12, rules: { answers: [1] } });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const txt = () => document.querySelector('#stage').textContent;
    document.querySelector('#stage .opt[data-j="0"]').click(); // wrong selection
    const before = { expl: txt().includes('B is right'), verdict: /Correct|Wrong/.test(txt()) };
    document.querySelector('#stage [data-act="qcheck"]').click();
    const t = txt();
    return { before, afterExpl: t.includes('B is right'), wrong: t.includes('Wrong'), correct: t.includes('Correct') };
  });
  expect(out.before.expl).toBe(false);
  expect(out.before.verdict).toBe(false);
  expect(out.afterExpl).toBe(true);
  expect(out.wrong).toBe(true);
  expect(out.correct).toBe(false);
});

// Redesign — auto-derive multi from the number of correct options.
test('choice: marking 2 options correct makes it multi automatically (need all)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB\nC', key: 'pick' })], { w: 12, rules: { answers: [0, 2] } });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const hasCheck = !!document.querySelector('#stage [data-act="qcheck"]');
    document.querySelector('#stage .opt[data-j="0"]').click(); // only one of two
    document.querySelector('#stage [data-act="qcheck"]').click();
    const partial = document.querySelector('#stage').textContent.includes('Wrong');
    document.querySelector('#stage [data-act="qreset"]').click();
    document.querySelector('#stage .opt[data-j="0"]').click();
    document.querySelector('#stage .opt[data-j="2"]').click();
    document.querySelector('#stage [data-act="qcheck"]').click();
    const full = document.querySelector('#stage').textContent.includes('Correct');
    return { hasCheck, partial, full };
  });
  expect(out.hasCheck).toBe(true); // multi forces a Check
  expect(out.partial).toBe(true);  // 1 of 2 = wrong
  expect(out.full).toBe(true);     // both = correct
});

// Redesign — single instant: verdict + explanation appear immediately, no Check button.
test('choice: single instant pick shows verdict + explanation immediately', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB', key: 'pick', explanation: 'A is right.' })], { w: 12, rules: { answers: [0] } });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const noCheck = !document.querySelector('#stage [data-act="qcheck"]');
    document.querySelector('#stage .opt[data-j="1"]').click(); // wrong
    const t = document.querySelector('#stage').textContent;
    return { noCheck, wrong: t.includes('Wrong'), expl: t.includes('A is right') };
  });
  expect(out.noCheck).toBe(true);
  expect(out.wrong).toBe(true);
  expect(out.expl).toBe(true);
});

// Redesign guard — option grips sit beside their rows, not absolute-positioned/stacked (cascade regression).
test('choice: option grips sit on their own rows, not stacked', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB\nC', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    const g0 = document.querySelector('#stage [data-qgrip="0"]');
    const g1 = document.querySelector('#stage [data-qgrip="1"]');
    return { pos: getComputedStyle(g0).position, sameY: Math.abs(g0.getBoundingClientRect().y - g1.getBoundingClientRect().y) < 2 };
  });
  expect(out.pos).not.toBe('absolute');
  expect(out.sameY).toBe(false);
});

// Redesign — options reorder through the shared pointer drag engine (startCardDrag); the marked answer follows.
test('choice: options reorder by dragging the ⋮⋮ handle (marked answer follows)', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB\nC', key: 'pick' })], { w: 12, rules: { answers: [2] } }); // C correct
    m.setHouse([m.room('r', 'R', [card])], [], false);
    const grip = document.querySelector('#stage [data-qgrip="2"]'); // C's grip
    const row0 = document.querySelector('#stage [data-qrow="0"]');  // A
    const gb = grip.getBoundingClientRect(), rb = row0.getBoundingClientRect();
    const pe = (t, x, y, el) => (el || document).dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, button: 0, cancelable: true }));
    pe('pointerdown', gb.x + 3, gb.y + 3, grip);
    pe('pointermove', gb.x + 12, gb.y + 12);          // exceed 5px → begin
    pe('pointermove', rb.x + rb.width / 2, rb.y + 3);  // over A, top half → insert before A
    pe('pointerup', rb.x + rb.width / 2, rb.y + 3);
    const c = window.__mk.D().house.rooms[0].cards[0];
    return { options: c.content.s1 ? c.content.s1.options : null, answers: c.rules.answers };
  });
  expect(out.options).toBe('C\nA\nB');
  expect(out.answers).toEqual([0]); // C is now index 0, still correct
});

// Redesign — require-check & shuffle are labeled toggle buttons (not form chips), draggable onto the card.
test('choice: require-check is a labeled toggle button, not an fcflag chip', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    document.querySelector('#stage .furn').click();
    const noFcflag = !document.querySelector('#side [data-act="fcflag"][data-key="submit"]');
    const btn = document.querySelector('#side [data-act="qbehav"][data-behav="submit"]');
    const label = btn ? btn.textContent : null;
    btn.click();
    return { noFcflag, label, on: window.__mk.D().house.rooms[0].cards[0].content.s1.submit };
  });
  expect(out.noFcflag).toBe(true);
  expect(out.label).toContain('Require a check');
  expect(out.on).toBe(true);
});

test('choice: behavior button highlights for a prop-level value and toggles it off', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB', key: 'pick', submit: true })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    document.querySelector('#stage .furn').click();
    const btn = document.querySelector('#side [data-act="qbehav"][data-behav="submit"]');
    const onBefore = btn.classList.contains('on');
    btn.click(); // should turn the prop-level true OFF
    return { onBefore, off: window.__mk.D().house.rooms[0].cards[0].content.s1.submit };
  });
  expect(out.onBefore).toBe(true);
  expect(out.off).toBe(false);
});

test('choice: a behavior button can be dragged onto the card to enable it', async ({ page }) => {
  const on = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    document.querySelector('#stage .furn').click();
    const btn = document.querySelector('#side [data-act="qbehav"][data-behav="shuffle"]');
    const target = document.querySelector('#stage .furn[data-fid="cq"]');
    const dt = new DataTransfer();
    btn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    return window.__mk.D().house.rooms[0].cards[0].content.s1.shuffle;
  });
  expect(on).toBe(true);
});

test('choice: Check button shows in Edit when require-check is on', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const off = m.card('c1', 'A', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB', key: 'pick' })], { w: 12 });
    const on = m.card('c2', 'B', [m.slot('s2', 'choice', { q: 'Q', options: 'A\nB', key: 'pick', submit: true })], { w: 12 });
    m.setHouse([m.room('r', 'R', [off, on])], [], false);
    const has = fid => !!document.querySelector(`#stage .furn[data-fid="${fid}"] [data-editcheck]`);
    return { off: has('c1'), on: has('c2') };
  });
  expect(out.off).toBe(false);
  expect(out.on).toBe(true);
});

// Audit HIGH — a cancelled behavior-button drag must not corrupt a later, unrelated drop.
test('choice: a cancelled behavior drag does not corrupt a later drop', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const a = m.card('ca', 'A', [m.slot('sa', 'choice', { q: 'Q', options: 'A\nB', key: 'pick' })], { w: 6 });
    const b = m.card('cb', 'B', [m.slot('sb', 'text', { text: 'hi' })], { w: 6 });
    m.setHouse([m.room('r', 'R', [a, b])], [], false);
    document.querySelector('#stage .furn[data-fid="ca"]').click();
    const btn = document.querySelector('#side [data-act="qbehav"][data-behav="shuffle"]');
    const dt = new DataTransfer();
    btn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    btn.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); // cancelled, no drop
    document.querySelector('#stage .furn[data-fid="cb"]').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    const cards = window.__mk.D().house.rooms[0].cards;
    return { aShuffle: (cards[0].content.sa || {}).shuffle, bCorrupted: !!cards[1].content.sa };
  });
  expect(out.aShuffle).toBeFalsy();
  expect(out.bCorrupted).toBe(false);
});

// Audit MED — deleting an option remaps the marked answers.
test('choice: deleting an option remaps the marked answers', async ({ page }) => {
  const ans = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('s1', 'choice', { q: 'Q', options: 'A\nB\nC\nD', key: 'pick' })], { w: 12, rules: { answers: [2] } }); // C
    m.setHouse([m.room('r', 'R', [card])], [], false);
    document.querySelector('#stage [data-act="coptdel"][data-i="0"]').click(); // delete A → C shifts to index 1
    return window.__mk.D().house.rooms[0].cards[0].rules.answers;
  });
  expect(ans).toEqual([1]);
});

// 3a: the Factory bench no longer carries an "Answer #" control.
test('3a: Factory bench has no Answer# control (answer belongs to Edit)', async ({ page }) => {
  const hasAnswerBox = await page.evaluate(() => {
    const d = window.LS.DB(); d.place = 'factory';
    d.bench.slots = [{ id: 'sx', type: 'choice', w: 12, props: { q: 'Pick', options: 'A\nB', key: 'pick' }, verbs: {} }];
    window.render();
    document.querySelector('[data-act="selslot"][data-i="0"]').click();
    return !!document.querySelector('#side [data-act="answer"]');
  });
  expect(hasAnswerBox).toBe(false);
});
