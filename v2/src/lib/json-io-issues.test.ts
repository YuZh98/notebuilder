import { describe, it, expect } from 'vitest';
import { validateNotebook, validateNotebookIssues, importNotebook, type Issue, type NotebookJSON } from './json-io';

/** A one-section, one-card document whose card holds `slots` (and optional card-level extras). */
function doc(slots: unknown[], card: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 2, notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots, ...card }] }] } };
}

const codes = (issues: Issue[]) => issues.map((i) => i.code);

describe('validateNotebookIssues — structured issues', () => {
  it('returns Issue objects whose messages are exactly validateNotebook’s strings', () => {
    const json = doc([{ type: 'mystery', props: {} }], { w: 99 });
    const issues = validateNotebookIssues(json);
    const legacy = validateNotebook(json);
    expect(issues.errors.map((i) => i.message)).toEqual(legacy.errors);
    expect(issues.warnings.map((i) => i.message)).toEqual(legacy.warnings);
    for (const i of issues.errors) {
      expect(typeof i.code).toBe('string');
      expect(typeof i.path).toBe('string');
      expect(i.message.length).toBeGreaterThan(0);
    }
  });

  it('gives each top-level failure a stable code and path', () => {
    expect(validateNotebookIssues(null).errors[0]).toMatchObject({ code: 'not-object', path: '' });
    expect(validateNotebookIssues({ notebook: { name: 'x', sections: [] } }).errors[0]).toMatchObject({
      code: 'version-missing',
      path: 'version',
      message: 'Missing or invalid "version" field',
    });
    expect(validateNotebookIssues({ version: 3, notebook: { name: 'x', sections: [] } }).errors[0]).toMatchObject({
      code: 'version-newer',
      path: 'version',
    });
    expect(validateNotebookIssues({ version: 2 }).errors[0]).toMatchObject({
      code: 'notebook-missing',
      path: 'notebook',
      message: 'Missing "notebook" field',
    });
  });

  it('paths are rooted at the document (notebook.sections[i]…) even where messages abbreviate', () => {
    const { errors } = validateNotebookIssues(doc([{ type: 'text', props: { text: 'a' } }], { w: 2 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'card-width-range',
      path: 'notebook.sections[0].cards[0].w',
      message: 'sections[0].cards[0].w must be a number between 3 and 12',
    });
  });

  it('an unknown slot type carries the offending type as its subject', () => {
    const { errors } = validateNotebookIssues(doc([{ type: 'quizz', props: {} }]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'slot-type-unknown',
      path: 'notebook.sections[0].cards[0].slots[0].type',
      subject: 'quizz',
    });
    expect(errors[0].message).toMatch(/unknown slot type: quizz/);
  });

  it('a cross-card read is a warning coded cross-card-read, naming the variable', () => {
    const { errors, warnings } = validateNotebookIssues(doc([{ type: 'text', props: { text: 'rate {{r}}' } }]));
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'cross-card-read', subject: 'r', path: 'notebook.sections[0].cards[0]' });
  });

  it('a cycle is an error coded cycle, labelled with slot positions on both faces', () => {
    const { errors } = validateNotebookIssues(
      doc([{ type: 'compute', props: { expr: 'b + 1', out: 'a' } }], {
        verbs: { flip: true },
        back: [{ type: 'compute', props: { expr: 'a + 1', out: 'b' } }],
      }),
    );
    const cycle = errors.find((e) => e.code === 'cycle');
    expect(cycle).toBeDefined();
    expect(cycle!.message).toMatch(/cycle detected/);
    expect(cycle!.message).toContain('slots[0] (compute)');
    expect(cycle!.message).toContain('back[0] (compute)');
  });
});

describe('validateNotebook runs each slot’s own validate()', () => {
  it('rejects a choice with fewer than two options', () => {
    const { errors } = validateNotebookIssues(doc([{ type: 'choice', props: { options: ['only'] } }]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'slot-props',
      path: 'notebook.sections[0].cards[0].slots[0].props',
      subject: 'choice',
    });
    expect(errors[0].message).toMatch(/options must have at least 2 items/);
  });

  it('rejects an out-of-range answer index', () => {
    const errors = validateNotebook(doc([{ type: 'choice', props: { options: ['a', 'b'], answer: [2] } }])).errors;
    expect(errors.some((e) => /answer index 2 is out of range/.test(e))).toBe(true);
  });

  it('keeps the text slot’s own phrase', () => {
    const errors = validateNotebook(doc([{ type: 'text', props: { text: 42 } }])).errors;
    expect(errors.some((e) => /text must be a string/.test(e))).toBe(true);
  });

  it('validates back-face slots too', () => {
    const errors = validateNotebook(doc([{ type: 'text', props: { text: 'q' } }], { back: [{ type: 'slider', props: { value: 1 } }] })).errors;
    expect(errors.some((e) => /back\[0\].*key is required/.test(e))).toBe(true);
  });

  it('reports "props must be an object" for missing, null, array and scalar props', () => {
    for (const props of [undefined, null, [], 'text', 3]) {
      const slot: Record<string, unknown> = { type: 'text-input' };
      if (props !== undefined) slot.props = props;
      const { errors } = validateNotebookIssues(doc([slot]));
      expect(errors, `props=${JSON.stringify(props)}`).toHaveLength(1);
      expect(errors[0]).toMatchObject({ code: 'props-not-object', path: 'notebook.sections[0].cards[0].slots[0].props' });
      expect(errors[0].message).toMatch(/props must be an object/);
    }
  });

  it('a validate() that throws on malformed props becomes an error, not a crash', () => {
    // choice.validate iterates `answer`; a number is not iterable.
    const run = () => validateNotebookIssues(doc([{ type: 'choice', props: { options: ['a', 'b'], answer: 5 } }]));
    expect(run).not.toThrow();
    const { errors } = run();
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('slot-props');
  });

  it('does not validate props of an unknown slot type (one error, no crash)', () => {
    const { errors } = validateNotebookIssues(doc([{ type: 'mystery', props: null }]));
    expect(codes(errors)).toEqual(['slot-type-unknown']);
  });

  it('a notebook that passes validation imports without throwing', () => {
    const json = doc([
      { type: 'choice', props: { q: 'Pick', options: ['a', 'b'], answer: [1], explanation: 'b' } },
      { type: 'slider', props: { key: 'k', value: 1 } },
    ]);
    expect(validateNotebook(json).errors).toEqual([]);
    expect(() => importNotebook(json as unknown as NotebookJSON)).not.toThrow();
  });
});

describe('verbs and tags are validated', () => {
  it('accepts well-formed card and slot verbs', () => {
    const json = doc(
      [
        { type: 'slider', props: { key: 'a', value: 1 } },
        {
          type: 'text',
          props: { text: 'shown' },
          verbs: { reveal: { key: 'a', op: '>=', val: 1 }, glow: true, emphasis: false, sequential: true, locked: true, hint: { content: 'think' } },
        },
        { type: 'text', props: { text: 'x' }, verbs: { reveal: { key: 'a', op: '==', val: 'yes' } } },
        { type: 'text', props: { text: 'y' }, verbs: { reveal: { key: 'a', op: '!=', val: null } } },
      ],
      { verbs: { flip: true, bare: false }, back: [{ type: 'text', props: { text: 'b' } }], tags: ['algebra', 'easy'] },
    );
    expect(validateNotebook(json)).toEqual({ errors: [], warnings: [] });
  });

  it('rejects card verbs that are not an object of booleans', () => {
    for (const verbs of ['flip', [true], { flip: 'yes' }, { bare: 1 }]) {
      const { errors } = validateNotebookIssues(doc([{ type: 'text', props: { text: 'a' } }], { verbs }));
      expect(errors, JSON.stringify(verbs)).toHaveLength(1);
      expect(errors[0].code).toBe('bad-verbs');
      expect(errors[0].path.startsWith('notebook.sections[0].cards[0].verbs')).toBe(true);
    }
  });

  it('rejects malformed slot verbs', () => {
    const bad: unknown[] = [
      'glow',
      { glow: 'yes' },
      { reveal: { key: 'a', op: '=>', val: 1 } },
      { reveal: { op: '==', val: 1 } },
      { reveal: { key: 'a', op: '==', val: { n: 1 } } },
      { reveal: true },
      { hint: 'just text' },
      { hint: { content: 5 } },
    ];
    for (const verbs of bad) {
      const { errors } = validateNotebookIssues(doc([{ type: 'text', props: { text: 'a' }, verbs }]));
      expect(errors, JSON.stringify(verbs)).toHaveLength(1);
      expect(errors[0].code).toBe('bad-verbs');
      expect(errors[0].path.startsWith('notebook.sections[0].cards[0].slots[0].verbs')).toBe(true);
    }
  });

  it('rejects card tags that are not an array of strings', () => {
    for (const tags of ['algebra', [1], ['a', null], { a: 1 }]) {
      const { errors } = validateNotebookIssues(doc([{ type: 'text', props: { text: 'a' } }], { tags }));
      expect(errors, JSON.stringify(tags)).toHaveLength(1);
      expect(errors[0]).toMatchObject({ code: 'wrong-type', path: 'notebook.sections[0].cards[0].tags' });
      expect(errors[0].message).toBe('sections[0].cards[0].tags must be an array of strings');
    }
  });
});
