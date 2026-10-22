// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync, readdirSync } from 'node:fs';
import { importNotebook, validateNotebook, type NotebookJSON } from './json-io';
import { allSlots, getSlot } from './slots/registry';
import type { Notebook, Slot } from './types';

// cwd-relative like zoom.test.ts's app.css read; vitest runs from v2/.
const DIR = '../docs/examples';

/** Documented in docs/examples/README.md as the v1 prototype format (`{ name, rooms[] }`). */
const LEGACY_V1 = ['release-notes.json'];

const files: string[] = readdirSync(DIR).filter((f: string) => f.endsWith('.json')).sort();
const v2Files = files.filter((f) => !LEGACY_V1.includes(f));

const read = (file: string): unknown => JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8'));

const everySlot = (nb: Notebook): Slot[] =>
  nb.sections.flatMap((s) => s.cards.flatMap((c) => [...c.slots, ...(c.back ?? [])]));

describe('docs/examples', () => {
  it('has example notebooks to check', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(v2Files.length).toBeGreaterThan(0);
    expect(files).toEqual(expect.arrayContaining([...LEGACY_V1, 'grand-tour.json']));
  });

  describe.each(v2Files)('%s', (file: string) => {
    it('validates with no errors', () => {
      expect(validateNotebook(read(file)).errors).toEqual([]);
    });

    it('imports to a notebook whose every slot type is registered', () => {
      const nb = importNotebook(read(file) as NotebookJSON);
      expect(nb.sections.length).toBeGreaterThanOrEqual(1);
      const unknown = everySlot(nb).map((s) => s.type).filter((type) => !getSlot(type));
      expect(unknown).toEqual([]);
    });
  });

  it('grand-tour.json exercises every registered slot type', () => {
    const nb = importNotebook(read('grand-tour.json') as NotebookJSON);
    const used = new Set(everySlot(nb).map((s) => s.type));
    const registered = allSlots().map((s) => s.type);
    expect(registered).toHaveLength(12);
    expect([...used].sort()).toEqual([...registered].sort());
  });

  describe.each(LEGACY_V1)('%s (legacy v1)', (file: string) => {
    it('is excluded because it genuinely fails v2 validation', () => {
      expect(validateNotebook(read(file)).errors.length).toBeGreaterThan(0);
    });
  });

  it('rejects an example whose slot type is corrupted', () => {
    const json = read('grand-tour.json') as NotebookJSON;
    expect(validateNotebook(json).errors).toEqual([]);

    const si = json.notebook.sections.findIndex((s) => s.cards.length > 0);
    json.notebook.sections[si].cards[0].slots[0].type = 'bogus';

    const { errors } = validateNotebook(json);
    expect(errors).toContain(`sections[${si}].cards[0].slots[0] has unknown slot type: bogus`);
    expect(() => importNotebook(json)).toThrow(/Unknown slot type: bogus/);
  });
});
