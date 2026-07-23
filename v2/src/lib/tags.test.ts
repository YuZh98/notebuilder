import { describe, it, expect } from 'vitest';
import { applyTag, removeTag, renameTag, deleteTag, tagUsage } from './tags';
import { matrixDims } from './coverage-matrix';
import type { Notebook, Card } from './types';

function card(id: string, tags?: string[]): Card {
  return { id, sectionId: 's1', position: 0, slots: [], ...(tags ? { tags } : {}) };
}

function nbOf(cards: Card[]): Notebook {
  return {
    id: 'nb',
    name: 'NB',
    createdAt: '',
    updatedAt: '',
    sections: [{ id: 's1', notebookId: 'nb', name: 'S1', position: 0, cards }],
  };
}

describe('applyTag / removeTag', () => {
  it('applyTag adds the tag, creating the array on an untagged card', () => {
    const nb = nbOf([card('a')]);
    applyTag(nb, 'a', 'algebra');
    expect(nb.sections[0].cards[0].tags).toEqual(['algebra']);
  });

  it('applyTag never duplicates', () => {
    const nb = nbOf([card('a', ['algebra'])]);
    applyTag(nb, 'a', 'algebra');
    expect(nb.sections[0].cards[0].tags).toEqual(['algebra']);
  });

  it('applyTag on an unknown card is a no-op', () => {
    const nb = nbOf([card('a')]);
    applyTag(nb, 'nope', 'algebra');
    expect(nb.sections[0].cards[0].tags).toBeUndefined();
  });

  it('removeTag drops the tag and deletes an emptied array (matches setCardTags)', () => {
    const nb = nbOf([card('a', ['algebra'])]);
    removeTag(nb, 'a', 'algebra');
    expect(nb.sections[0].cards[0].tags).toBeUndefined();
  });

  it('removeTag keeps remaining tags', () => {
    const nb = nbOf([card('a', ['algebra', 'geometry'])]);
    removeTag(nb, 'a', 'algebra');
    expect(nb.sections[0].cards[0].tags).toEqual(['geometry']);
  });
});

describe('renameTag (v1 tagrename)', () => {
  it('renames on every card carrying the tag', () => {
    const nb = nbOf([card('a', ['old', 'x']), card('b', ['old']), card('c', ['x'])]);
    expect(renameTag(nb, 'old', 'new')).toBe(true);
    expect(nb.sections[0].cards[0].tags).toEqual(['new', 'x']);
    expect(nb.sections[0].cards[1].tags).toEqual(['new']);
    expect(nb.sections[0].cards[2].tags).toEqual(['x']);
  });

  it('merges into an existing target tag without duplicating', () => {
    const nb = nbOf([card('a', ['old', 'new'])]);
    renameTag(nb, 'old', 'new');
    expect(nb.sections[0].cards[0].tags).toEqual(['new']);
  });

  it('is a no-op for an empty or unchanged name', () => {
    const nb = nbOf([card('a', ['old'])]);
    expect(renameTag(nb, 'old', '  ')).toBe(false);
    expect(renameTag(nb, 'old', 'old')).toBe(false);
    expect(nb.sections[0].cards[0].tags).toEqual(['old']);
  });

  it('refuses to rename pinned (v1 70-events.js:172 — the pin button owns it)', () => {
    const nb = nbOf([card('a', ['pinned'])]);
    expect(renameTag(nb, 'pinned', 'stuck')).toBe(false);
    expect(nb.sections[0].cards[0].tags).toEqual(['pinned']);
  });

  it('the coverage matrix tag axis follows a rename', () => {
    const nb = nbOf([card('a', ['old'])]);
    renameTag(nb, 'old', 'new');
    const tagAxis = matrixDims(nb, []).find((d) => d.key === 'tag')!;
    const labels = tagAxis.values.map((v) => v.label);
    expect(labels).toContain('new');
    expect(labels).not.toContain('old');
  });
});

describe('deleteTag (v1 tagdel)', () => {
  it('strips the tag from every card and drops emptied arrays', () => {
    const nb = nbOf([card('a', ['gone']), card('b', ['gone', 'keep']), card('c')]);
    deleteTag(nb, 'gone');
    expect(nb.sections[0].cards[0].tags).toBeUndefined();
    expect(nb.sections[0].cards[1].tags).toEqual(['keep']);
  });
});

describe('tagUsage', () => {
  it('counts the cards carrying the tag', () => {
    const nb = nbOf([card('a', ['t']), card('b', ['t', 'u']), card('c')]);
    expect(tagUsage(nb, 't')).toBe(2);
    expect(tagUsage(nb, 'u')).toBe(1);
    expect(tagUsage(nb, 'none')).toBe(0);
  });
});
