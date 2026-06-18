import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('B1: ticks follow their items through delete and reorder; deleted ticks are discarded', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const c = m.card('cl', 'L', [{ id: 'sk', type: 'list', props: { title: 'T', items: 'apple\nbanana\ncherry', style: 'check' }, verbs: {} }], { w: 8 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const boxes = () => [...document.querySelectorAll('[data-fid="cl"] .taskit input')];
    boxes()[1].click();                                            // tick banana
    // delete apple in Edit
    const D2 = m.D(); D2.studyOn = false; window.render();
    document.querySelector('[data-fid="cl"] [data-act="coptdel"][data-i="0"]').click();
    D2.studyOn = true; window.render();
    const afterDelete = boxes().map(b => b.checked);               // [banana, cherry]
    // tick cherry too, then delete BANANA (a ticked item) → its tick dies, cherry's survives
    boxes()[1].click();
    D2.studyOn = false; window.render();
    document.querySelector('[data-fid="cl"] [data-act="coptdel"][data-i="0"]').click();
    D2.studyOn = true; window.render();
    const afterTickedDelete = boxes().map(b => b.checked);         // [cherry]
    return { afterDelete, afterTickedDelete };
  });
  expect(out.afterDelete).toEqual([true, false]);                  // banana keeps its tick
  expect(out.afterTickedDelete).toEqual([true]);                   // cherry keeps its tick; banana's died with it
});

test('B1: two check-lists on one card keep independent ticks (per-slot state)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cm', 'M', [
      { id: 'sa', type: 'list', props: { title: 'A', items: 'a1\na2', style: 'check' }, verbs: {} },
      { id: 'sb', type: 'list', props: { title: 'B', items: 'b1\nb2', style: 'check' }, verbs: {} },
    ], { w: 8 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    document.querySelectorAll('[data-fid="cm"] .taskit input')[0].click();   // tick a1 only
    const boxes = [...document.querySelectorAll('[data-fid="cm"] .taskit input')].map(b => b.checked);
    return { boxes };
  });
  expect(out.boxes).toEqual([true, false, false, false]);          // b1 NOT ticked
});

test('B1: old flat _done saves migrate to per-slot state', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const c = m.card('co', 'O', [{ id: 'sk', type: 'list', props: { items: 'x\ny', style: 'check' }, verbs: {} }], { w: 8 });
    c.state._done = { 1: true };                                   // legacy flat shape
    D.house.rooms[0].cards = [c];
    window.rebuildRefs(); D.studyOn = true; window.render();
    const checked = [...document.querySelectorAll('[data-fid="co"] .taskit input')].map(b => b.checked);
    return { checked, shape: JSON.stringify(m.D().house.rooms[0].cards[0].state._done) };
  });
  expect(out.checked).toEqual([false, true]);
  expect(out.shape).toBe('{"sk":{"1":true}}');
});
