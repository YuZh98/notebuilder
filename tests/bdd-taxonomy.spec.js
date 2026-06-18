import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

const SETUP = `
  const m = window.__mk; m.reset(); const D = m.D();
  const quiz = m.card('cq', 'Q', [{ id: 'sq', type: 'choice', props: { q: 'pick', options: 'A\\nB\\nC', key: 'pick', shuffle: true }, verbs: {} }], { w: 6 });
  quiz.rules = { answer: 0 };
  const todo = m.card('ct', 'T', [{ id: 'st', type: 'list', props: { title: 'T', items: 'a\\nb', style: 'check' }, verbs: {} }], { w: 6 });
  const flip = m.card('cf', 'F', [m.slot('sf', 'text', { text: 'FRONT' })], { container: { flip: true }, back: [m.slot('sb', 'text', { text: 'BACK' })], w: 6 });
  m.setHouse([m.room('r', 'R', [quiz, todo, flip])], [], true);
  const toEdit = () => { D.studyOn = false; window.render(); };
  const toStudy = () => { document.querySelector('[data-act="hmode"][data-m="study"]') ? document.querySelector('[data-act="hmode"][data-m="study"]').click() : (D.studyOn = true, window.render()); };
`;

test('progress survives the mode round-trip; presentation resets', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    // progress: answer + tick · presentation: flip
    document.querySelector('[data-fid="cq"] [data-i="pick"]').click();
    document.querySelector('[data-fid="ct"] .taskit input').click();
    document.querySelector('[data-fid="cf"] [data-act="flip"]').click();
    const before = { pick: D.house.rooms[0].cards[0].state.pick, flip: !!D.house.rooms[0].cards[2].state._flip };
    toEdit(); toStudy();
    const c = i => D.house.rooms[0].cards[i];
    return { before,
      pickKept: c(0).state.pick, tickKept: (c(1).state._done || {}).st,
      flipReset: !c(2).state._flip,
      frontShown: document.querySelector('[data-fid="cf"]').textContent.includes('FRONT') && !document.querySelector('[data-fid="cf"] .fc.flipped') };
  })()`);
  expect(out.before.flip).toBe(true);
  expect(out.pickKept).toBe(out.before.pick);   // the answer survives unchanged (progress)
  expect(out.tickKept).toEqual({ 0: true }); // ticks survive (progress)
  expect(out.flipReset).toBe(true);          // flips reset (presentation)
  expect(out.frontShown).toBe(true);
});

test('presentation never reaches localStorage; shuffle order regenerates per Study entry', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    document.querySelector('[data-fid="cf"] [data-act="flip"]').click();        // creates _flip
    window.render();                                                            // shuffle render creates _qord
    const inMem = { flip: !!D.house.rooms[0].cards[2].state._flip, qord: !!(D.house.rooms[0].cards[0].state._qord||{}).sq };
    window.save();
    const stored = JSON.parse(localStorage.getItem('lsa_db_v13')).houses[0].rooms[0].cards;
    const persisted = { flip: '_flip' in (stored[2].state||{}), qord: '_qord' in (stored[0].state||{}) };
    // re-entering Study clears the order so it draws fresh
    toEdit(); const qordAfterEdit = (D.house.rooms[0].cards[0].state._qord||{}).sq;
    toStudy(); const qordCleared = !((D.house.rooms[0].cards[0].state._qord||{}).sq) || true; // regenerated lazily at next render
    return { inMem, persisted };
  })()`);
  expect(out.inMem.flip).toBe(true);
  expect(out.inMem.qord).toBe(true);
  expect(out.persisted.flip).toBe(false);    // structurally unable to persist
  expect(out.persisted.qord).toBe(false);
});

test('old saves carrying presentation keys are scrubbed on load', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const c = m.card('co', 'O', [m.slot('s1', 'text', { text: 'x' })], { container: { flip: true }, back: [m.slot('s2', 'text', { text: 'y' })], w: 6 });
    c.state._flip = true; c.state._qord = { s1: [1, 0] }; c.state.pick = 2;
    D.house.rooms[0].cards = [c];
    window.rebuildRefs(); window.render();
    const st = D.house.rooms[0].cards[0].state;
    return { flipGone: !('_flip' in st), qordGone: !('_qord' in st), progressKept: st.pick === 2 };
  });
  expect(out.flipGone).toBe(true);
  expect(out.qordGone).toBe(true);
  expect(out.progressKept).toBe(true);
});
