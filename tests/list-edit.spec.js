import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

const LIST_CARD = `
  const m = window.__mk; m.reset(); const D = m.D();
  const c = m.card('cl', 'L', [{ id: 's1', type: 'list', props: { title: 'Groceries', items: 'milk\\neggs\\nbread', style: 'bullets' }, verbs: {} }], { w: 8 });
  m.setHouse([m.room('r', 'R', [c])], [], false);   // Edit mode
`;

test('list edits per item: rows with grips, per-row delete, add button, in-place title', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${LIST_CARD}
    const el = document.querySelector('[data-fid="cl"]');
    const rows = [...el.querySelectorAll('.ce-opt')];
    // edit ONE item in place
    rows[1].querySelector('.ceview')?.click();
    const ta = document.querySelector('[data-fid="cl"] textarea.ce, [data-fid="cl"] input.ce');
    let oneItem = null;
    if (ta) { ta.value = 'EGGS!'; ta.dispatchEvent(new Event('input', { bubbles: true })); oneItem = true; }
    const D2 = m.D(); const card = D2.house.rooms[0].cards[0];
    const items = ((card.content.s1 && card.content.s1.items) || card.slots[0].props.items).split('\\n');
    // add + delete
    document.querySelector('[data-fid="cl"] [data-act="coptadd"]').click();
    const afterAdd = ((m.D().house.rooms[0].cards[0].content.s1 || {}).items || '').split('\\n').length;
    document.querySelector('[data-fid="cl"] [data-act="coptdel"][data-i="0"]').click();
    const afterDel = ((m.D().house.rooms[0].cards[0].content.s1 || {}).items || '').split('\\n');
    const titleEditable = !!document.querySelector('[data-fid="cl"] .ceview[data-key]') || !!document.querySelector('[data-fid="cl"] [data-act="ce"][data-key="title"]') || [...document.querySelectorAll('[data-fid="cl"] .ceview')].some(v => v.textContent.includes('Groceries'));
    return { rows: rows.length, grips: el.querySelectorAll('[data-qgrip]').length, oneItem, items, afterAdd, afterDel, titleEditable };
  })()`);
  expect(out.rows).toBe(3);
  expect(out.grips).toBe(3);
  expect(out.oneItem).toBe(true);
  expect(out.items).toEqual(['milk', 'EGGS!', 'bread']);     // only the edited line changed
  expect(out.afterAdd).toBe(4);
  expect(out.afterDel).toEqual(['EGGS!', 'bread', 'new item']);
  expect(out.titleEditable).toBe(true);
});

test('list style is a chip group in the panel, not a typed string', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${LIST_CARD}
    document.querySelector('[data-fid="cl"]').click();        // select → side inspector
    const chips = [...document.querySelectorAll('#side [data-act="liststyle"]')];
    const labels = chips.map(c => c.dataset.v);
    chips.find(c => c.dataset.v === 'numbered').click();
    const D2 = m.D(); D2.studyOn = true; window.render();
    const ol = document.querySelectorAll('[data-fid="cl"] ol li').length;
    D2.studyOn = false; window.render();
    document.querySelector('[data-fid="cl"]').click();
    const on = document.querySelector('#side [data-act="liststyle"].on');
    return { labels, ol, onChip: on && on.dataset.v };
  })()`);
  expect(out.labels.sort()).toEqual(['bullets', 'check', 'numbered']);
  expect(out.ol).toBe(3);
  expect(out.onChip).toBe('numbered');
});

test('check-style list shows inert boxes in Edit, live boxes in Study', async ({ page }) => {
  const out = await page.evaluate(`(() => {
    const m = window.__mk; m.reset();
    const c = m.card('ck', 'C', [{ id: 's1', type: 'list', props: { title: 'T', items: 'a\\nb', style: 'check' }, verbs: {} }], { w: 8 });
    m.setHouse([m.room('r', 'R', [c])], [], false);
    const editBoxes = [...document.querySelectorAll('[data-fid="ck"] input[type=checkbox]')];
    const editInert = editBoxes.length > 0 && editBoxes.every(b => b.disabled);
    m.D().studyOn = true; window.render();
    const studyBox = document.querySelector('[data-fid="ck"] .taskit input');
    studyBox.click();
    return { editInert, ticked: (m.D().house.rooms[0].cards[0].state._done||{}).s1 };
  })()`);
  expect(out.editInert).toBe(true);
  expect(out.ticked).toEqual({ 0: true });
});
