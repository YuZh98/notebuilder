import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('notebook title + subtitle render identically in Edit and Study (position, type, structure)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'house';
    D.house.name = 'Old Mission Drill — First Round';
    D.house.subtitle = 'Wed Jun 10 · Nathan\n- qual first\n- then quant';   // multi-line + list → exercises the block renderer
    const snap = mode => { D.studyOn = mode; window.render();
      const t = document.querySelector('.house-title'), s = document.querySelector('.house-sub');
      const m1 = e => { const c = getComputedStyle(e);
        const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect();   // measure the TEXT, not the hover hitbox
        return { x: Math.round(r.x), y: Math.round(r.y), fs: c.fontSize, fw: c.fontWeight, text: e.textContent.trim() }; };
      return { t: m1(t), s: m1(s), sLis: s.querySelectorAll('li').length };
    };
    return { study: snap(true), edit: snap(false) };
  });
  expect(out.edit.t.text).toBe(out.study.t.text);
  expect(out.edit.s.text.replace(/\s+/g, ' ')).toBe(out.study.s.text.replace(/\s+/g, ' '));
  expect(out.edit.sLis).toBe(out.study.sLis);                    // same markdown structure (list renders as list in both)
  expect(Math.abs(out.edit.t.x - out.study.t.x)).toBeLessThanOrEqual(1);   // no optical jump on mode toggle
  expect(Math.abs(out.edit.t.y - out.study.t.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(out.edit.s.y - out.study.s.y)).toBeLessThanOrEqual(1);
  expect(out.edit.t.fs).toBe(out.study.t.fs);
  expect(out.edit.t.fw).toBe(out.study.t.fw);
});
