import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

// D — the store no longer ships raw single-slot primitives; finished cards remain.
test('the store drops raw Slider/Number/Formula/Chart products; keeps finished cards', async ({ page }) => {
  const names = await page.evaluate(() => { const m = window.__mk; m.reset(); return window.LS.DB().products.map(p => p.name); });
  for (const gone of ['Slider', 'Number', 'Formula', 'Chart']) expect(names).not.toContain(gone);
  expect(names).toContain('Flashcard');
  expect(names).toContain('Gaussian Lab');
});

// E — the new-notebook modal is a JSON/AI front door.
test('new-notebook modal offers a JSON paste box and an AI-prompt copy', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    document.querySelector('[data-act="newnb"]').click();
    return { json: !!document.querySelector('#modal [data-act="nbjson"]'), prompt: !!document.querySelector('#modal [data-act="nbprompt"]') };
  });
  expect(out.json).toBe(true);
  expect(out.prompt).toBe(true);
});

test('pasting JSON into the new-notebook modal creates that notebook', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = window.LS.DB();
    const before = D.houses.length;
    document.querySelector('[data-act="newnb"]').click();
    const ta = document.querySelector('#modal [data-act="nbjson"]');
    const nb = { name: 'AI Notebook', rooms: [{ id: 'r1', name: 'R', cards: [
      { id: 'f1', name: 'c', slots: [{ id: 's1', type: 'compute', props: { expr: '6*7', note: 'answer =' }, verbs: {} }], place: { w: 12 }, content: {}, tag: [], state: {} },
    ] }] };
    ta.value = JSON.stringify(nb); ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#modal [data-act="nbcreate"]').click();
    return { grew: window.LS.DB().houses.length - before, name: window.LS.DB().house.name, modalGone: !document.querySelector('#modal [data-act="nbcreate"]') };
  });
  expect(out.grew).toBe(1);
  expect(out.name).toBe('AI Notebook');
  expect(out.modalGone).toBe(true);
});

// F — clean first-run lands in Study on one live, deletable example card.
test('clean first-run boots into Study on a live reactive example', async ({ page }) => {
  await page.goto('/index.html?clean');
  await page.evaluate(() => { try { localStorage.removeItem('lsa_clean_v1'); } catch (e) {} });
  await page.reload();
  await page.waitForFunction(() => !!window.LS && !!window.render);
  const out = await page.evaluate(() => {
    const D = window.LS.DB(); const r = D.house.rooms[0]; const c = r.cards[0];
    return { study: D.studyOn, cards: r.cards.length, types: c ? c.slots.map(s => s.type) : [] };
  });
  expect(out.study).toBe(true);
  expect(out.cards).toBe(1);
  expect(out.types).toContain('slider');
  expect(out.types).toContain('compute');
  expect(out.types).toContain('chart');
});
