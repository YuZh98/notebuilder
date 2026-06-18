import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('preview is faithful: frameless previews frameless, variety accent shows, group chip stays lit', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    // legacy-style variety pair: framed + frameless siblings
    const mk = (name, bare) => ({ id: 'p_' + name.replace(/\W/g, ''), name, store: 'write', container: { flip: false, bare }, rules: {}, accent: '', note: '', icon: '',
      slots: [{ id: 's1', w: 12, verbs: {}, type: 'text', props: { text: 'hello' } }] });
    D.products.push(mk('Box--framed', false), mk('Box--frameless', true));
    m.setHouse([m.room('r', 'R', [])], [], false);
    const chip = () => [...document.querySelectorAll('.prodchip')].find(c => /Box/.test(c.textContent));
    chip().click();
    const litBefore = chip().classList.contains('on');
    const framedBare = document.querySelector('.prev-wrap .furn').classList.contains('bare');
    // switch to the frameless sibling via the variety chips
    [...document.querySelectorAll('#side [data-act="selprod"]')].find(b => b.textContent.trim() === 'frameless').click();
    const litAfter = chip().classList.contains('on');
    const framelessBare = document.querySelector('.prev-wrap .furn').classList.contains('bare');
    // new-style variety accent reflects in the preview
    const fc = D.products.find(p => p.name === 'Flashcard');
    document.querySelector(`[data-act="selprod"][data-id="${fc.id}"]`).click();
    document.querySelector('#side [data-act="pickvariety"][data-v="Mint"]').click();
    const accent = document.querySelector('.prev-wrap .furn').style.getPropertyValue('--cardc').trim();
    return { litBefore, litAfter, framedBare, framelessBare, accent };
  });
  expect(out.litBefore).toBe(true);
  expect(out.litAfter).toBe(true);                  // picking a variety keeps the store chip lit
  expect(out.framedBare).toBe(false);
  expect(out.framelessBare).toBe(true);             // frameless variety previews frameless
  expect(out.accent).toBe('#54d6a0');               // picked variety's accent drives the preview
});

test('preview width is constrained: long content wraps instead of running right', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    m.setHouse([m.room('r', 'R', [])], [], false);
    const dash = D.products.find(p => p.name === 'Gaussian Lab');
    document.querySelector(`[data-act="selprod"][data-id="${dash.id}"]`).click();
    const ta = document.querySelector('#side [data-act="pdraft"]');
    if (ta) { ta.value = 'word '.repeat(40) + 'Unbroken'.repeat(30); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    const wrap = document.querySelector('.prev-wrap').getBoundingClientRect();
    const stage = document.querySelector('.prev-stage').getBoundingClientRect();   // transformed = what the eye sees
    return { hadDraft: !!ta, visualSpill: Math.round(stage.right - wrap.right), scaled: stage.width < 700 };
  });
  expect(out.hadDraft).toBe(true);
  expect(out.visualSpill).toBeLessThanOrEqual(1);   // the miniature notebook view never runs out of the box
  expect(out.scaled).toBe(true);                    // and it IS the scaled notebook geometry, not a reflow
});
