import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('B3: Escape reverts an in-place edit; blur still commits', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'house'; D.studyOn = false; window.render();
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const undo0 = D._undo.length;
    // 1. Escape reverts the title
    document.querySelector('.ceview.house-title').click();
    let ta = document.querySelector('textarea.ce[data-act="ht"]');
    ta.value = 'GARBAGE'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(250);
    const afterEsc = { title: m.D().house.name, editorClosed: !document.querySelector('textarea.ce[data-act="ht"]'),
                       persisted: JSON.parse(localStorage.getItem('lsa_db_v13')).houses[0].name,
                       undoClean: m.D()._undo.length === undo0 };
    // 2. blur commits
    document.querySelector('.ceview.house-title').click();
    ta = document.querySelector('textarea.ce[data-act="ht"]');
    ta.value = 'Kept Title'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.blur(); await wait(250);
    const afterBlur = m.D().house.name;
    // 3. Escape reverts a list item too
    const c = m.card('cl', 'L', [{ id: 's1', type: 'list', props: { items: 'aa\nbb', style: 'bullets' }, verbs: {} }], { w: 8 });
    m.D().house.rooms[0].cards = [c]; window.render();
    document.querySelector('[data-fid="cl"] .ce-opt .ceview').click();
    const it = document.querySelector('[data-fid="cl"] textarea.ce, [data-fid="cl"] input.ce');
    it.value = 'WRONG'; it.dispatchEvent(new Event('input', { bubbles: true }));
    it.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(250);
    const card = m.D().house.rooms[0].cards[0];
    const itemAfterEsc = ((card.content.s1 && card.content.s1.items) || card.slots[0].props.items).split('\n')[0];
    return { afterEsc, afterBlur, itemAfterEsc };
  });
  expect(out.afterEsc.title).toBe('My Space');
  expect(out.afterEsc.editorClosed).toBe(true);
  expect(out.afterEsc.persisted).toBe('My Space');
  expect(out.afterEsc.undoClean).toBe(true);           // no stray history entry left behind
  expect(out.afterBlur).toBe('Kept Title');
  expect(out.itemAfterEsc).toBe('aa');
});
