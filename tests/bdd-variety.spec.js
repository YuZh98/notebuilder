import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('B2: one Flashcard product with two look varieties replaces the twins', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const fc = D.products.filter(p => /^Flashcard/i.test(p.name));
    return { count: fc.length, name: fc[0] && fc[0].name,
             varieties: fc[0] && (fc[0].varieties || []).map(v => v.name),
             sameContent: fc[0] && fc[0].slots.length === 1 };
  });
  expect(out.count).toBe(1);
  expect(out.name).toBe('Flashcard');
  expect(out.varieties).toEqual(['Blue', 'Mint']);
});

test('B2: picking a variety at placement sets the look; content is shared', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'house'; D.studyOn = false; m.setHouse([m.room('r', 'R', [])], [], false);
    const fc = D.products.find(p => p.name === 'Flashcard');
    document.querySelector(`[data-act="selprod"][data-id="${fc.id}"]`).click();
    const chips = [...document.querySelectorAll('#side [data-act="pickvariety"]')].map(c => c.dataset.v);
    document.querySelector('#side [data-act="pickvariety"][data-v="Mint"]').click();
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Place in')).click();
    const card = D.house.rooms[0].cards[0];
    return { chips, accent: card.accent, variety: card.variety, text: card.slots[0].props.text.slice(0, 6) };
  });
  expect(out.chips).toEqual(['Blue', 'Mint']);
  expect(out.accent).toBe('#54d6a0');
  expect(out.variety).toBe('Mint');
});

test('B2: a placed card switches variety in Edit — look changes, content does not', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    m.setHouse([m.room('r', 'R', [])], [], false);
    const fc = D.products.find(p => p.name === 'Flashcard');
    document.querySelector(`[data-act="selprod"][data-id="${fc.id}"]`).click();
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Place in')).click();
    const card = D.house.rooms[0].cards[0];
    card.content[card.slots[0].id] = { text: 'MY OWN QUESTION' };
    window.render();
    document.querySelector(`[data-fid="${card.id}"]`).click();          // select → inspector
    const sw = document.querySelector('#side [data-act="setvariety"][data-v="Mint"]');
    if (!sw) return { sw: false };
    sw.click();
    return { sw: true, accent: card.accent, variety: card.variety,
             contentKept: card.content[card.slots[0].id].text === 'MY OWN QUESTION',
             undoable: D._undo.length > 0 };
  });
  expect(out.sw).toBe(true);
  expect(out.accent).toBe('#54d6a0');
  expect(out.contentKept).toBe(true);
  expect(out.undoable).toBe(true);
});

test('B2: the seal sheet edits varieties; a sealed product carries them', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; window.render();
    document.querySelector('[data-act="addslot"][data-t="text"]').click();
    document.querySelector(`[data-act="sealbench"][data-id="${D.bench.id}"]`).click();
    const addBtn = document.querySelector('#modal [data-act="varadd"]');
    if (!addBtn) return { addBtn: false };
    addBtn.click();
    const nameInp = document.querySelector('#modal [data-act="varname"][data-i="0"]');
    nameInp.value = 'Night'; nameInp.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#modal [data-act="varaccent"][data-i="0"][data-c="#b388ff"]').click();
    document.querySelector('[data-act="sealconfirm"]').click();
    const p = D.products[D.products.length - 1];
    return { addBtn: true, varieties: p.varieties };
  });
  expect(out.addBtn).toBe(true);
  expect(out.varieties).toEqual([{ name: 'Night', accent: '#b388ff' }]);
});
