import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('^ is supported (right-assoc power)', async ({ page }) => {
  const txt = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('c1', 'C', [m.slot('s1', 'compute', { expr: '2^10', label: 'p=' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    return document.querySelector('[data-fid="c1"]').textContent;
  });
  expect(txt).toContain('1024');
});

// Cross-card reads and cross-card derived chains were removed when variables became card-scoped —
// the new semantics are pinned in tests/bdd-card-scope.spec.js.

test('B11: a Study slider drag is ephemeral — never mutates the authored document', async ({ page }) => {
  const slotVal = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const a = m.card('ca', 'A', [m.slot('sa', 'slider', { label: 'rate', key: 'rate', min: 0, max: 100, value: 5, step: 1 })], { w: 12 });
    m.setHouse([m.room('r', 'R', [a])], [], true);
    const inp = document.querySelector('#stage input[data-key="rate"]');
    inp.value = '8'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    return window.__mk.D().house.rooms[0].cards[0].slots[0].props.value;   // authored default untouched
  });
  expect(slotVal).toBe(5);
});

test('// (floor division) and mod operators', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c1 = m.card('c1', 'A', [m.slot('s1', 'compute', { expr: '17 // 5', note: '' })], { w: 12 });
    const c2 = m.card('c2', 'B', [m.slot('s2', 'compute', { expr: '17 mod 5', note: '' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c1, c2])], [], true);
    return { fl: document.querySelector('[data-fid="c1"]').textContent, md: document.querySelector('[data-fid="c2"]').textContent };
  });
  expect(out.fl).toContain('3');   // 17 // 5 = 3
  expect(out.md).toContain('2');   // 17 mod 5 = 2
});

const _maxX = d => Math.max(...[...d.matchAll(/[ML]([\d.]+) /g)].map(m => +m[1]), 0);

test('an out-of-range slider default is clamped to [min, max]', async ({ page }) => {
  const v = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cs', 'S', [m.slot('s1', 'slider', { key: 'w', min: 0, max: 10, value: 20 }), m.slot('s2', 'compute', { expr: 'w', note: '' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    return document.querySelector('#stage .compute .cval').textContent;
  });
  expect(v).toBe('10');
});

test('hiding the slider keeps the value editable in Study (number input drives the variable)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cs', 'S', [m.slot('s1', 'slider', { key: 'w', min: 0, max: 100, value: 5, showSlider: false, showValue: true }), m.slot('s2', 'compute', { expr: 'w * 2', note: '' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const num = document.querySelector('#stage input[type="number"][data-key="w"]');
    const noRange = !document.querySelector('#stage input[type="range"][data-key="w"]');
    num.value = '7'; num.dispatchEvent(new Event('input', { bubbles: true }));
    return { hasNum: !!num, noRange, result: document.querySelector('#stage .compute .cval').textContent };
  });
  expect(out.hasNum).toBe(true); expect(out.noRange).toBe(true); expect(out.result).toBe('14');
});

test('chart clips out-of-range — only the in-view curve draws (no flat clamp line)', async ({ page }) => {
  const d = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [m.slot('s1', 'chart', { fn: 'x*x', x0: 0, x1: 10, y0: 0, y1: 20, xticks: 0, yticks: 0, hover: false })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    return document.querySelector('#stage svg.chart-svg path').getAttribute('d');
  });
  expect(_maxX(d)).toBeLessThan(220);
});

test('changing a chart variable redraws the plot live', async ({ page }) => {
  const changed = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cz', 'Z', [m.slot('s1', 'slider', { key: 'z', min: 0, max: 50, value: 0 }), m.slot('s2', 'chart', { fn: 'x*x + z', x0: 0, x1: 10, y0: 0, y1: 100, xticks: 0, yticks: 0, hover: false })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const before = document.querySelector('#stage svg.chart-svg path').getAttribute('d');
    const inp = document.querySelector('#stage input[data-key="z"]'); inp.value = '40'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    return before !== document.querySelector('#stage svg.chart-svg path').getAttribute('d');
  });
  expect(changed).toBe(true);
});

test('the last visible part of {name, value, slider} cannot be hidden', async ({ page }) => {
  const disabled = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const sld = m.card('cs', 'S', [m.slot('s1', 'slider', { key: 'w', min: 0, max: 10, value: 5, showName: true, showValue: false, showSlider: false })], { w: 12 });
    m.setHouse([m.room('r', 'R', [sld])], [], false);
    document.querySelector('#stage .furn').click();
    const chip = document.querySelector('#side [data-act="fcbool"][data-key="showName"]');
    return chip ? chip.disabled : null;
  });
  expect(disabled).toBe(true);
});

test('dragging a slider does not recreate its input (smooth) yet same-card chart updates', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c', 'C', [m.slot('s1', 'slider', { key: 'z', min: 0, max: 10, value: 0 }), m.slot('s2', 'chart', { fn: 'z', x0: 0, x1: 10, y0: 0, y1: 10, xticks: 0, yticks: 0, hover: false })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const node = document.querySelector('#stage input[type="range"][data-key="z"]');
    const before = document.querySelector('#stage svg.chart-svg path').getAttribute('d');
    node.value = '5'; node.dispatchEvent(new Event('input', { bubbles: true }));
    return { persisted: document.querySelector('#stage input[type="range"][data-key="z"]') === node, chartChanged: before !== document.querySelector('#stage svg.chart-svg path').getAttribute('d') };
  });
  expect(out.persisted).toBe(true);
  expect(out.chartChanged).toBe(true);
});

test('a Show toggle (click) actually hides its part of the slider', async ({ page }) => {
  const v = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c', 'C', [m.slot('s1', 'slider', { key: 'w', min: 0, max: 10, value: 5 })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    document.querySelector('#stage .furn').click();
    document.querySelector('#side [data-act="fcbool"][data-key="showName"]').click();
    return window.__mk.D().house.rooms[0].cards[0].content['s1'].showName;
  });
  expect(v).toBe(false);
});

test('a variable button inserts its name into the formula field (own card\'s keys only)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [m.slot('s1', 'slider', { key: 'aa', min: 0, max: 10, value: 1 }), m.slot('s2', 'chart', { fn: '', x0: 0, x1: 10, y0: 0, y1: 10 })], { w: 12 });
    const other = m.card('co', 'O', [m.slot('s3', 'slider', { key: 'bb', min: 0, max: 10, value: 1 })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c, other])], [], false);
    document.querySelector('[data-fid="cc"]').click();
    const foreignChip = !!document.querySelector('#side [data-act="varins"][data-v="bb"]');
    document.querySelector('#side [data-act="varins"][data-v="aa"]').click();
    return { fn: window.__mk.D().house.rooms[0].cards[0].content['s2'].fn, foreignChip };
  });
  expect(out.fn).toContain('aa');
  expect(out.foreignChip).toBe(false);   // another card's variable is not offered
});

test('chart hover is a toggleable Show option (not locked)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [m.slot('s1', 'chart', { fn: 'x', x0: 0, x1: 10, y0: 0, y1: 10, hover: true })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], false);
    document.querySelector('#stage .furn').click();
    const chip = document.querySelector('#side [data-act="fcbool"][data-key="hover"]');
    const disabled = chip.disabled; chip.click();
    return { disabled, hover: window.__mk.D().house.rooms[0].cards[0].content['s1'].hover };
  });
  expect(out.disabled).toBe(false);
  expect(out.hover).toBe(false);
});

test('chart caption is edited in-place on the card', async ({ page }) => {
  const ok = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [m.slot('s1', 'chart', { fn: 'x', x0: 0, x1: 10, y0: 0, y1: 10 })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], false);
    const view = document.querySelector('#stage .chart .ceview[data-act="editslot"]');
    view.click();
    return !!document.querySelector('#stage textarea.ce[data-key="label"]');
  });
  expect(ok).toBe(true);
});

test('Tags is a persistent panel section (shown even with a card selected); not in the card inspector', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('cc', 'C', [m.slot('s1', 'text', { text: 'hi' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], false);
    document.querySelector('#stage .furn').click();
    return { tags: !!document.querySelector('#side [data-act="fold"][data-s="__tags__"]'), cardTags: !!document.querySelector('#side [data-act="ftag"]') };
  });
  expect(out.tags).toBe(true);
  expect(out.cardTags).toBe(false);
});

test('Factory edits container name/note in-place; no left-panel "Active container"', async ({ page }) => {
  const out = await page.evaluate(() => {
    const d = window.LS.DB(); d.place = 'factory'; window.render();
    const inplace = sel => !!document.querySelector(`#stage textarea[data-act="${sel}"]`) || [...document.querySelectorAll('#stage .ceview')].some(v => (v.dataset.key||'').startsWith('bench:' + (sel==='bname'?'name':'note')));
    return { hasActive: document.querySelector('#side').textContent.includes('Active container'), first: document.querySelector('#side .store-lane h4').textContent, bname: inplace('bname'), bnote: inplace('bnote') };
  });
  expect(out.hasActive).toBe(false);
  expect(out.first).toContain('Slots');
  expect(out.bname).toBe(true);
  expect(out.bnote).toBe(true);
});

// (Removed) the store no longer ships raw Slider/Number/Formula/Chart products — they live as Factory
// slots only (card scope makes a lone single-slot reactive product a dead end). See bdd-store-onboard.

test('placing a product twice keeps its authored key verbatim (no auto-rename; copies are independent)', async ({ page }) => {
  const keys = await page.evaluate(() => {
    window.LS.reset(); const d = window.LS.DB(); d.place = 'house'; d.studyOn = false;
    d.products.push({ id: 'pSl', name: 'MySlider', container: { flip: false, look: 'card' }, rules: {}, accent: '', note: '', icon: '', store: 'live',
      slots: [{ id: 's9', w: 12, verbs: {}, type: 'slider', props: { key: 'q', min: 0, max: 10, value: 5, step: 1, showName: true, showValue: true, showSlider: true } }] });
    window.render();
    window.placeProduct('pSl'); window.placeProduct('pSl');
    const room = d.house.rooms.find(r => r.id === d.house.active);
    return room.cards.slice(-2).map(c => c.slots[0].props.key);
  });
  expect(keys[0]).not.toBe('x'); expect(keys[1]).not.toBe('x');
  expect(keys[0]).toBe(keys[1]);   // same product → same key; card scope keeps the copies independent
});

test('a WIRED product (slider+chart together) keeps maker variable names and reacts', async ({ page }) => {
  const out = await page.evaluate(() => {
    window.LS.reset(); const d = window.LS.DB();
    d.products.push({ id: 'pWired', name: 'WiredLab', container: { flip: false, look: 'card' },
      slots: [{ id: 'sz', w: 12, verbs: {}, type: 'slider', props: { key: 'z', min: 0, max: 10, value: 1, showName: true, showValue: true, showSlider: true } },
              { id: 'sc', w: 12, verbs: {}, type: 'chart', props: { fn: 'z*x', x0: 0, x1: 10, y0: 0, y1: 100, xticks: 0, yticks: 0, hover: false } }],
      rules: {}, accent: '', note: '', icon: '', store: 'live' });
    d.place = 'house'; d.studyOn = false; window.render();
    window.placeProduct('pWired');
    const room = d.house.rooms.find(r => r.id === d.house.active); const card = room.cards[room.cards.length - 1];
    d.studyOn = true; window.render();
    const range = document.querySelector(`[data-fid="${card.id}"] input[type="range"]`);
    const before = document.querySelector(`[data-fid="${card.id}"] svg.chart-svg path`).getAttribute('d');
    range.value = '9'; range.dispatchEvent(new Event('input', { bubbles: true }));
    return { key: card.slots[0].props.key, changed: before !== document.querySelector(`[data-fid="${card.id}"] svg.chart-svg path`).getAttribute('d') };
  });
  expect(out.key).toBe('z');
  expect(out.changed).toBe(true);
});

test('a FUSED slider+formula reacts (fused cells were skipped by live update)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const sl = m.slot('s1', 'slider', { key: 'xx', min: 0, max: 100, value: 5, showName: true, showValue: true, showSlider: true });
    sl.fuse = true; sl.fuseRatio = 0.5;                       // fuse the slider with the next slot
    const fo = m.slot('s2', 'compute', { expr: '3*xx', note: '' });
    const card = m.card('c', 'C', [sl, fo], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const before = document.querySelector('.compute .cval').textContent;  // 3*5 = 15
    const range = document.querySelector('input[type="range"][data-key="xx"]');
    range.value = '9'; range.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, after: document.querySelector('.compute .cval').textContent };  // 3*9 = 27
  });
  expect(out.before).toBe('15');
  expect(out.after).toBe('27');
});

test('reactivity holds on a flip card back-face slot', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c', 'C', [m.slot('s1', 'slider', { key: 'b', min: 0, max: 10, value: 3 })],
      { w: 12, container: { flip: true }, back: [m.slot('s2', 'compute', { expr: 'b*10', note: '' })] });
    m.setHouse([m.room('r', 'R', [card])], [], true);
    const back = () => document.querySelector('.fc-face.back .compute .cval').textContent;
    const before = back();                                  // 3*10 = 30
    const range = document.querySelector('input[type="range"][data-key="b"]');
    range.value = '7'; range.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, after: back() };                       // 7*10 = 70
  });
  expect(out.before).toBe('30');
  expect(out.after).toBe('70');
});

test('Factory: Inventory hidden when a slot is selected, shown when none is', async ({ page }) => {
  const out = await page.evaluate(() => {
    const d = window.LS.DB(); d.place = 'factory'; d.bench.slots = [{ id: 'sx', type: 'slider', w: 12, props: window.__mk ? { key: 'a' } : {}, verbs: {} }];
    window.__benchSelTest = null;
    window.render();
    const invWhenNone = document.querySelector('#side').textContent.includes('Inventory');
    document.querySelector('[data-act="selslot"][data-i="0"]').click();   // select the slot
    const invWhenSlot = document.querySelector('#side').textContent.includes('Inventory');
    return { invWhenNone, invWhenSlot };
  });
  expect(out.invWhenNone).toBe(true);
  expect(out.invWhenSlot).toBe(false);
});

test('dragging a container onto a store lane opens Seal preset to that store', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1200 });
  const out = await page.evaluate(() => {
    const d = window.LS.DB(); d.place = 'factory';
    d.bench.slots = [{ id: 'sx', type: 'text', w: 12, props: { text: 'hi' }, verbs: {} }];
    window.render();
    const grip = document.querySelector('[data-bcgrip]'), lane = document.querySelector('[data-lane="live"]');
    const g = grip.getBoundingClientRect(), l = lane.getBoundingClientRect();
    const pe = (t, x, y, el) => (el || document).dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, button: 0, cancelable: true }));
    pe('pointerdown', g.x + 5, g.y + 5, grip);
    pe('pointermove', g.x + 20, g.y + 20);
    pe('pointermove', l.x + l.width / 2, l.y + 12);
    pe('pointerup', l.x + l.width / 2, l.y + 12);
    const modal = document.querySelector('#modal'), fun = modal.querySelector('[data-act="sealship"][data-s="live"]');
    return { shown: modal.style.display !== 'none', seal: modal.textContent.includes('Confirm seal'), liveOn: fun ? fun.classList.contains('on') : null };
  });
  expect(out.shown).toBe(true); expect(out.seal).toBe(true); expect(out.liveOn).toBe(true);
});

test('Factory Slots/Verbs/Colors are framed store-lanes and collapse (UI only)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const d = window.LS.DB(); d.place = 'factory'; window.render();
    const lane = sel => document.querySelector(`#side .store-lane h4[data-s="${sel}"]`);
    const framed = !!lane('fac:slots') && !!lane('fac:verbs') && !!lane('fac:look');
    const slotsBefore = !!document.querySelector('[data-slotdrag]');   // buttons present (not folded)
    lane('fac:slots').click();                                          // collapse Slots
    const slotsAfter = !!document.querySelector('[data-slotdrag]');     // now hidden
    return { framed, slotsBefore, slotsAfter };
  });
  expect(out.framed).toBe(true);
  expect(out.slotsBefore).toBe(true);
  expect(out.slotsAfter).toBe(false);
});

test('House Tags is a framed store-lane', async ({ page }) => {
  const ok = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const d = window.LS.DB(); d.place = 'house'; d.studyOn = false; window.render();
    return !!document.querySelector('#side .store-lane h4[data-s="__tags__"]');
  });
  expect(ok).toBe(true);
});

test('room lock corner toggles; section ops are panel chips; panel is stripped', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c1', 'C', [m.slot('s1', 'text', { text: 'hi' })], { w: 6 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    window.LS.DB().house.active = 'r';
    const lock = document.querySelector('.room[data-room="r"] .room-lock');
    const lb = window.LS.DB().house.rooms[0].locked; lock.click();
    const la = window.LS.DB().house.rooms[0].locked;
    document.querySelector('.room[data-room="r"]').click();   // select room → panel
    const chips = document.querySelectorAll('#side [data-act="svc"]').length;   // section ops live in the panel now
    const pin = document.querySelector('#side [data-act="svc"][data-k="pin"]');
    const pb = !!window.LS.DB().house.rooms[0].services.pin; pin.click();
    const pa = !!window.LS.DB().house.rooms[0].services.pin;
    return { lockToggled: lb !== la, chips, pinToggled: pb !== pa, hasDelete: !!document.querySelector('#side [data-act="delroom"]'), hasRule: document.querySelector('#side').textContent.includes('Rule') };
  });
  expect(out.lockToggled).toBe(true);
  expect(out.chips).toBeGreaterThan(2);
  expect(out.pinToggled).toBe(true);
  expect(out.hasDelete).toBe(true);
  expect(out.hasRule).toBe(false);
});

test('editable fields share the text-slot pattern (preview + md + textarea/toolbar)', async ({ page }) => {
  // house title: md in Study, formatted preview in Edit, click → textarea
  const ht = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const d = window.LS.DB();
    d.house.name = '**Big** name'; d.place = 'house'; d.studyOn = true; window.render();
    const study = document.querySelector('.house-title').innerHTML.includes('<b>Big</b>');
    d.studyOn = false; window.render();
    const prev = document.querySelector('.hh-titles .ceview.house-title');
    const editMd = prev.innerHTML.includes('<b>Big</b>'); prev.click();
    return { study, editMd, ta: !!document.querySelector('.ce.ce-htitle[data-act="ht"]') };
  });
  expect(ht.study).toBe(true); expect(ht.editMd).toBe(true); expect(ht.ta).toBe(true);

  // choice options: ceview (not <input>), md preview, click → textarea.ce (toolbar surface)
  const ch = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cq', 'Q', [m.slot('sq', 'choice', { q: 'Pick', options: '**Right**\nWrong', key: 'pick' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    const opts = [...document.querySelectorAll('.ce-choice .ceview[data-act="edithere"]')];
    const noInput = !document.querySelector('.ce-choice input');
    const md = opts.some(o => o.innerHTML.includes('<b>Right</b>'));
    opts[1].click();
    return { count: opts.length, noInput, md, ta: !!document.querySelector('.ce-choice textarea.ce[data-act="copt"]') };
  });
  expect(ch.count).toBeGreaterThanOrEqual(3); expect(ch.noInput).toBe(true); expect(ch.md).toBe(true); expect(ch.ta).toBe(true);
});

test('room width: drag the right edge to resize, clamped to a 240px floor', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c1', 'C', [m.slot('s1', 'text', { text: 'x' })], { w: 6 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    const handle = document.querySelector('.room[data-room="r"] [data-roomrz]');
    const hb = handle.getBoundingClientRect();
    const pe = (t, x) => document.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: hb.y + 10, bubbles: true, button: 0, cancelable: true }));
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: hb.x + 5, clientY: hb.y + 10, bubbles: true, button: 0, cancelable: true }));
    pe('pointermove', hb.x - 3000); pe('pointerup', hb.x - 3000);
    const wMin = window.LS.DB().house.rooms[0].width;
    const h2 = document.querySelector('.room[data-room="r"] [data-roomrz]').getBoundingClientRect();
    document.querySelector('.room[data-room="r"] [data-roomrz]').dispatchEvent(new PointerEvent('pointerdown', { clientX: h2.x + 5, clientY: h2.y + 10, bubbles: true, button: 0, cancelable: true }));
    pe('pointermove', h2.x + 200); pe('pointerup', h2.x + 200);
    return { wMin, wWide: window.LS.DB().house.rooms[0].width };
  });
  expect(out.wMin).toBe(240);
  expect(out.wWide).toBeGreaterThan(240);
});

test('an in-place caption edit is one undoable step (Cmd+Z reverts it)', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cc', 'C', [m.slot('s1', 'chart', { fn: 'x', x0: 0, x1: 10, y0: 0, y1: 10, label: 'OLD' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    document.querySelector('.slot.chart .ceview[data-act="editslot"]').click();
    const ta = document.querySelector('.slot.chart textarea.ce[data-key="label"]');
    ta.value = 'NE'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.value = 'NEW'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    window.__pushed = window.LS.DB()._undo.length;
    ta.blur(); ta.dispatchEvent(new Event('focusout', { bubbles: true }));
  });
  await page.waitForTimeout(220);
  const out = await page.evaluate(() => {
    const enabled = !document.querySelector('[data-act="undo"]').disabled;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    const c = window.LS.DB().house.rooms[0].cards[0].content['s1'];
    return { pushed: window.__pushed, enabled, label: c ? c.label : undefined };
  });
  expect(out.pushed).toBe(1);
  expect(out.enabled).toBe(true);
  expect(out.label === undefined || out.label === 'OLD' || out.label === '').toBeTruthy();
});

test('top bar order: theme ▾, Factory, notebook switcher, then ＋', async ({ page }) => {
  const out = await page.evaluate(() => {
    window.LS.reset(); window.render();
    const acts = [...document.querySelectorAll('#places > button, #places > .nbwrap > button, #places > .themewrap > button')].map(b => b.dataset.act);
    return acts;
  });
  expect(out).toEqual(['thememenu', 'place', 'nbmenu', 'newnb']);
});

test('＋ creates a notebook from the modal; panel has Width + Delete (no Estate jargon)', async ({ page }) => {
  const out = await page.evaluate(() => {
    window.LS.reset(); window.render();
    const before = window.LS.DB().houses.length;
    document.querySelector('[data-act="newnb"]').click();   // the standalone ＋ control
    const ti = document.querySelector('#modal [data-act="nbtitle"]');
    ti.value = 'My Stats'; ti.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#modal [data-act="nbcreate"]').click();
    const d = window.LS.DB();
    d.place = 'house'; d.studyOn = false; window.render();
    document.querySelector('[data-act="selhouse"]').click();
    const side = document.querySelector('#side');
    return { grew: d.houses.length - before, name: d.house.name, hasWidth: !!side.querySelector('[data-act="housewidth"]'), hasDelete: !!side.querySelector('[data-act="delnb"]'), noEstate: !side.textContent.includes('Estate') };
  });
  expect(out.grew).toBe(1); expect(out.name).toBe('My Stats');
  expect(out.hasWidth).toBe(true); expect(out.hasDelete).toBe(true); expect(out.noEstate).toBe(true);
});

test('clicking the divider collapses the side panel; the edge bump restores it', async ({ page }) => {
  const out = await page.evaluate(() => {
    window.LS.reset(); window.render();
    const rz = document.querySelector('#resizer');
    const pe = (t, x) => rz.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: 300, bubbles: true, button: 0, cancelable: true }));
    const r = rz.getBoundingClientRect();
    pe('pointerdown', r.x + 2); document.dispatchEvent(new PointerEvent('pointerup', { clientX: r.x + 2, clientY: 300, bubbles: true }));
    const collapsed = document.body.classList.contains('side-collapsed');
    document.querySelector('[data-act="sidetoggle"]').click();
    return { collapsed, back: !document.body.classList.contains('side-collapsed') };
  });
  expect(out.collapsed).toBe(true);
  expect(out.back).toBe(true);
});

test('section ops live in the left panel; enabling one shows it functional in Study; no room svcbar in Edit', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c1', 'C', [m.slot('s1', 'text', { text: 'hi' })], { w: 6 });
    m.setHouse([m.room('r', 'R', [card])], [], false); window.LS.DB().house.active = 'r'; window.render();
    const panelChips = document.querySelectorAll('#side [data-act="svc"]').length;
    const roomSvcbar = !!document.querySelector('.room[data-room="r"] .svcbar');
    document.querySelector('#side [data-act="svc"][data-k="search"]').click();
    const d = window.LS.DB(); d.studyOn = true; window.render();
    return { panelChips, roomSvcbar, studySearch: !!document.querySelector('.room[data-room="r"] [data-act="searchin"]') };
  });
  expect(out.panelChips).toBe(6); expect(out.roomSvcbar).toBe(false); expect(out.studySearch).toBe(true);
});

test('locking a room also locks its title (not editable)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c1', 'C', [m.slot('s1', 'text', { text: 'hi' })], { w: 6 });
    const rm = m.room('r', 'R', [card]); rm.title = '## T';
    m.setHouse([rm], [], false);
    const before = !!document.querySelector('.room[data-room="r"] [data-act="edithere"][data-key="room:r:title"]');
    document.querySelector('.room[data-room="r"] .room-lock').click();
    return { before, after: !!document.querySelector('.room[data-room="r"] [data-act="edithere"][data-key="room:r:title"]'), staticTitle: !!document.querySelector('.room[data-room="r"] .room-title') };
  });
  expect(out.before).toBe(true); expect(out.after).toBe(false); expect(out.staticTitle).toBe(true);
});

test('theme is global — persists across notebooks and the Factory', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const d = window.LS.DB(); d.place = 'house'; window.render();
    document.querySelector('[data-act="thememenu"]').click();
    document.querySelector('[data-act="settheme"][data-id="cyber"]').click();
    const inHouse = document.body.dataset.theme;
    d.place = 'factory'; window.render();
    return { inHouse, inFactory: document.body.dataset.theme, db: window.LS.DB().theme };
  });
  expect(out.inHouse).toBe('cyber'); expect(out.inFactory).toBe('cyber'); expect(out.db).toBe('cyber');
});

test('coverage head hides axis pickers when folded', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const a = m.card('a', 'Flashcard', [m.slot('s', 'text', { text: 'a' })], { w: 6 });
    const b = m.card('b', 'Quiz', [m.slot('s2', 'text', { text: 'b' })], { w: 6 });
    m.setHouse([m.room('r1', 'R1', [a]), m.room('r2', 'R2', [b])], [], false);
    const open0 = document.querySelectorAll('.mtx-head .axset').length;
    document.querySelector('[data-act="mtxfold"]').click();
    return { open0, folded: document.querySelectorAll('.mtx-head .axset').length };
  });
  expect(out.open0).toBeGreaterThan(0); expect(out.folded).toBe(0);
});

test('enabled section op shows on the room in Edit (draggable + resizable)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c1', 'C', [m.slot('s1', 'text', { text: 'x' })], { w: 6 });
    m.setHouse([m.room('r', 'R', [card])], [], false); window.LS.DB().house.active = 'r'; window.render();
    document.querySelector('#side [data-act="svc"][data-k="shuffle"]').click();
    return { btn: !!document.querySelector('.room[data-room="r"] .svcbar [data-svcbtn="shuffle"]'), rz: !!document.querySelector('.room[data-room="r"] .svcbar [data-svcrz]') };
  });
  expect(out.btn).toBe(true); expect(out.rz).toBe(true);
});

test('Tags panel highlights + toggles the selected card tags', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('c1', 'C', [m.slot('s1', 'text', { text: 'x' })], { w: 6, tag: ['study'] });
    m.setHouse([m.room('r', 'R', [card])], ['study'], false);
    document.querySelector('.room[data-room="r"] .furn').click();
    const chip = document.querySelector('#side .tagchip[data-c="study"]');
    const on = chip.classList.contains('on'); chip.click();
    return { on, has: window.LS.DB().house.rooms[0].cards[0].tag.includes('study') };
  });
  expect(out.on).toBe(true); expect(out.has).toBe(false);
});

test('no "Text (markdown…)" inspector field on a text card', async ({ page }) => {
  const has = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('ct', 'T', [m.slot('s1', 'text', { text: 'hi' })], { w: 6 });
    m.setHouse([m.room('r', 'R', [card])], [], false);
    document.querySelector('.room[data-room="r"] .furn').click();
    return document.querySelector('#side').textContent.includes('Text (markdown');
  });
  expect(has).toBe(false);
});

test('card state (choice pick / reveal) survives an unrelated slider drag', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const choice = m.slot('sc', 'choice', { q: 'Q', options: 'A\nB', key: 'pick' });
    const reveal = m.slot('sr', 'text', { text: 'REVEALED' }, { reveal: { key: 'pick', op: '>=', val: 0 } });
    const A = m.card('cA', 'A', [choice, reveal], { w: 6, rules: { answer: 0 } });
    const B = m.card('cB', 'B', [m.slot('sk', 'slider', { key: 'k', min: 0, max: 10, value: 1 })], { w: 6 });
    m.setHouse([m.room('r', 'R', [A, B])], [], true);
    document.querySelector('[data-fid="cA"] .opt[data-i="pick"][data-j="0"]').click();
    const afterPick = document.querySelector('[data-fid="cA"]').textContent.includes('REVEALED');
    const rng = document.querySelector('[data-fid="cB"] input[type="range"]');
    rng.value = '8'; rng.dispatchEvent(new Event('input', { bubbles: true }));
    return { afterPick, stillShown: document.querySelector('[data-fid="cA"]').textContent.includes('REVEALED') };
  });
  expect(out.afterPick).toBe(true); expect(out.stillShown).toBe(true);
});

test('a malicious accent does not break out of the style attribute', async ({ page }) => {
  const has = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const card = m.card('cx', 'X', [m.slot('s1', 'text', { text: 'hi' })], { w: 6 });
    card.accent = '#000" onmouseover="alert(1)';
    m.setHouse([m.room('r', 'R', [card])], [], true);
    return document.querySelector('[data-fid="cx"]').hasAttribute('onmouseover');
  });
  expect(has).toBe(false);
});

test('a theme change is undoable', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const d = window.LS.DB(); d.place = 'house'; window.render();
    document.querySelector('[data-act="thememenu"]').click();
    document.querySelector('[data-act="settheme"][data-id="cyber"]').click();
    const t1 = window.LS.DB().theme;
    document.querySelector('[data-act="undo"]').click();
    return { t1, t2: window.LS.DB().theme };
  });
  expect(out.t1).toBe('cyber');
  expect(out.t2 === '' || out.t2 === undefined).toBeTruthy();
});
