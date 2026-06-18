import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('C1: store lanes are Write / Practice / Live with sensible product placement', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const lanes = D.stores.map(s => s.name);
    const where = n => (D.products.find(p => p.name === n) || {}).store;
    return { lanes, note: where('Note'), flash: where('Flashcard'), quiz: where('Quiz'),
             gauss: where('Gaussian Lab') };
  });
  expect(out.lanes).toEqual(['Write', 'Practice', 'Live']);
  expect(out.note).toBe('write');
  expect(out.flash).toBe('practice');
  expect(out.quiz).toBe('practice');
  expect(out.gauss).toBe('live');
});

test('C1: legacy core/fun stores migrate to practice/live', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.stores = [{ id: 'core', name: 'Core', icon: '📘' }, { id: 'fun', name: 'Fun', icon: '🎮' }];
    D.products.push({ id: 'pc', name: 'UserThing', slots: [{ id: 's', type: 'text', props: { text: 'x' }, verbs: {} }], container: {}, rules: {}, accent: '', store: 'core' });
    D.products.push({ id: 'pf', name: 'UserToy', slots: [{ id: 's', type: 'text', props: { text: 'x' }, verbs: {} }], container: {}, rules: {}, accent: '', store: 'fun' });
    window.rebuildRefs();
    return { lanes: D.stores.map(s => s.id), pc: D.products.find(p => p.id === 'pc').store, pf: D.products.find(p => p.id === 'pf').store };
  });
  expect(out.lanes).toEqual(['write', 'practice', 'live']);
  expect(out.pc).toBe('practice');
  expect(out.pf).toBe('live');
});

test('C1: lab formulas show their captions; Quiz uses the built-in explanation', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    m.setHouse([m.room('r', 'R', [])], [], false);
    const place = n => { const p = D.products.find(x => x.name === n);
      document.querySelector(`[data-act="selprod"][data-id="${p.id}"]`).click();
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Place in')).click();
      return D.house.rooms[0].cards[D.house.rooms[0].cards.length - 1]; };
    const g = place('Gaussian Lab');
    D.studyOn = true; window.render();
    const gEl = document.querySelector(`[data-fid="${g.id}"]`).textContent;
    const captions = /peak density/.test(gEl) && /variance/.test(gEl);
    // Quiz: built-in explanation after answering, no reveal-hack slot
    const D2 = m.D(); D2.studyOn = false; window.render();
    const q = place('Quiz');
    const noRevealHack = !q.slots.some(s => s.verbs && s.verbs.reveal);
    const hasExplanation = !!q.slots.find(s => s.type === 'choice').props.explanation;
    D2.studyOn = true; window.render();
    document.querySelector(`[data-fid="${q.id}"] [data-i="pick"]`).click();
    const verdictShown = !!document.querySelector(`[data-fid="${q.id}"] .qverdict .qexpl`);
    return { captions, noRevealHack, hasExplanation, verdictShown };
  });
  expect(out.captions).toBe(true);
  expect(out.noRevealHack).toBe(true);
  expect(out.hasExplanation).toBe(true);
  expect(out.verdictShown).toBe(true);
});
