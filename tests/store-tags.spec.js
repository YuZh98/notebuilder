import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('seed store renders with per-product icons (first letter default + chosen icons), no slot-type "H"', async ({ page }) => {
  const chips = await page.evaluate(() => { window.__mk.reset(); const D = window.__mk.D(); D.place = 'house'; D.studyOn = false; window.render(); return [...document.querySelectorAll('#side .prodchip')].map(b => b.textContent.trim().replace(/\s+/g, ' ')); });
  expect(chips).toContain('∿ Gaussian Lab');
  expect(chips).toContain('N Note');                 // first-letter default
  expect(chips.some(c => /^H /.test(c))).toBe(false); // no slot-type icon leaking
});

test('product grouping is case-insensitive (Note + note--plain group as one)', async ({ page }) => {
  const chips = await page.evaluate(() => {
    window.__mk.reset(); const D = window.__mk.D(); D.place = 'house'; D.studyOn = false;
    const mk = name => ({ id: 'p_' + name.replace(/\W/g, ''), name, slots: [{ id: 's', type: 'text', props: { text: 'x' } }], store: 'write', container: {}, rules: {}, accent: '' });
    D.products.push(mk('note--plain'), mk('note--boxed'));   // + seed 'Note' (capital)
    window.render();
    return [...document.querySelectorAll('#side .prodchip')].map(b => b.textContent.trim().replace(/\s+/g, ' '));
  });
  expect(chips.some(c => /Note ×3/i.test(c))).toBe(true);
});

test('deleting an in-use tag asks to confirm; cancel keeps it', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('c1', 'X', [m.slot('s', 'text', { text: 'x' })], { tag: ['Used'] });
    m.setHouse([m.room('r', 'R', [c])], ['Used', 'Empty']);
    let prompted = ''; window.confirm = msg => { prompted = msg; return false; };  // cancel
    document.querySelector('.tagx[data-c="Used"]').click();
    const usedKept = m.D().house.cats.includes('Used');
    window.confirm = () => true;                                                  // delete unused without friction
    document.querySelector('.tagx[data-c="Empty"]').click();
    return { prompted, usedKept, emptyGone: !m.D().house.cats.includes('Empty') };
  });
  expect(out.prompted).toContain('removed from 1 card');
  expect(out.usedKept).toBe(true);
  expect(out.emptyGone).toBe(true);
});

test('icon picker: choosing an icon in the seal sheet sets the product icon', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'factory'; window.render();
    const note = D.products.find(p => p.name === 'Note');
    document.querySelector(`[data-act="loadprod"][data-id="${note.id}"]`).click();
    document.querySelector(`[data-act="sealbench"][data-id="${D.bench.id}"]`).click();
    document.querySelector('[data-act="sealicon"][data-ic="📝"]').click();
    document.querySelector('[data-act="sealconfirm"]').click();      // unchanged name → conflict step
    document.querySelector('[data-act="sealreplace"]').click();      // explicitly replace the original
    return m.D().products.find(p => p.name === 'Note').icon;
  });
  expect(out).toBe('📝');
});
