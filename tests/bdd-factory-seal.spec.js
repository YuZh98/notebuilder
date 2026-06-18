import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

const FACTORY = `
  const m = window.__mk; m.reset(); const D = m.D();
  D.place = 'factory'; window.render();
  const note = D.products.find(p => p.name === 'Note');
`;

test('#7 selecting a product forks a copy; the original is never silently edited', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${FACTORY}
    const benches0 = D.factory.benches.length;
    const origText = note.slots[0].props.text;
    document.querySelector('[data-act="loadprod"][data-id="' + note.id + '"]').click();
    const forked = { benches: D.factory.benches.length, activeIsNew: D.bench.id !== D.factory.benches[0].id || benches0 === 0 };
    // edit the fork
    D.bench.slots[0].props.text = 'EDITED IN FORK';
    return { benches0, forked, originalUntouched: D.products.find(p => p.name === 'Note').slots[0].props.text === origText,
             srcTracked: D.bench._src && D.bench._src.name === 'Note' };
  })()`);
  expect(out.forked.benches).toBe(out.benches0 + 1);    // a NEW bench, not the active one overwritten
  expect(out.originalUntouched).toBe(true);
  expect(out.srcTracked).toBe(true);
});

test('#7 sealing with the original name asks replace-vs-new; a renamed seal is silent', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${FACTORY}
    document.querySelector('[data-act="loadprod"][data-id="' + note.id + '"]').click();
    D.bench.slots[0].props.text = 'V2 TEXT'; window.render();
    const prods0 = D.products.length;
    // seal keeping the name → conflict step
    document.querySelector('[data-act="sealbench"][data-id="' + D.bench.id + '"]').click();
    document.querySelector('[data-act="sealconfirm"]').click();
    const conflictUI = { replace: !!document.querySelector('[data-act="sealreplace"]'), asNew: !!document.querySelector('[data-act="sealnew"]') };
    document.querySelector('[data-act="sealreplace"]').click();
    const afterReplace = { prods: D.products.length, text: D.products.find(p => p.name === 'Note').slots[0].props.text };
    // fork again, RENAME, seal → silent new product
    document.querySelector('[data-act="loadprod"][data-id="' + note.id + '"]').click();
    D.bench.name = 'Note--fancy'; window.render();
    document.querySelector('[data-act="sealbench"][data-id="' + D.bench.id + '"]').click();
    document.querySelector('[data-act="sealconfirm"]').click();
    const renamed = { prods: D.products.length, conflictShown: !!document.querySelector('[data-act="sealreplace"]'), exists: !!D.products.find(p => p.name === 'Note--fancy') };
    return { prods0, conflictUI, afterReplace, renamed };
  })()`);
  expect(out.conflictUI.replace).toBe(true);
  expect(out.conflictUI.asNew).toBe(true);
  expect(out.afterReplace.prods).toBe(out.prods0);            // replaced, not duplicated
  expect(out.afterReplace.text).toBe('V2 TEXT');
  expect(out.renamed.conflictShown).toBe(false);              // renamed → no prompt
  expect(out.renamed.prods).toBe(out.prods0 + 1);
  expect(out.renamed.exists).toBe(true);
});

test('#7 "seal as new" keeps both with an auto-suffixed name', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${FACTORY}
    document.querySelector('[data-act="loadprod"][data-id="' + note.id + '"]').click();
    const prods0 = D.products.length;
    document.querySelector('[data-act="sealbench"][data-id="' + D.bench.id + '"]').click();
    document.querySelector('[data-act="sealconfirm"]').click();
    document.querySelector('[data-act="sealnew"]').click();
    return { prods: D.products.length, prods0, names: D.products.map(p => p.name).filter(n => n.startsWith('Note')) };
  })()`);
  expect(out.prods).toBe(out.prods0 + 1);
  expect(out.names.some(n => /Note--/.test(n))).toBe(true);   // both survive, distinct names
});

test('#7 products delete from the chip ✕ with confirmation', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${FACTORY}
    const x = document.querySelector('[data-act="delprod"][data-p="' + note.id + '"]');
    if (!x) return { x: false };
    window.confirm = () => false; x.click();
    const kept = !!D.products.find(p => p.id === note.id);
    window.confirm = () => true;
    document.querySelector('[data-act="delprod"][data-p="' + note.id + '"]').click();
    return { x: true, kept, gone: !D.products.find(p => p.id === note.id), undoable: D._undo.length > 0 };
  })()`);
  expect(out.x).toBe(true);
  expect(out.kept).toBe(true);
  expect(out.gone).toBe(true);
  expect(out.undoable).toBe(true);
});
