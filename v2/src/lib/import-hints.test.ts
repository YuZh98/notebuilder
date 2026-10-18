import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseNotebookText,
  checkNotebookText,
  hintFor,
  buildFixRequest,
  describeIssue,
  humanPath,
  didYouMean,
  levenshtein,
  lintUnknownFields,
  lintLatexEscapes,
  syntaxIssue,
  findJsonSyntaxError,
  notebookSummary,
  type SyntaxProblem,
} from './import-hints';
import { validateNotebookIssues, type Issue } from './json-io';
import { AI_EXAMPLE } from './ai-prompt';

const GOOD = JSON.stringify(AI_EXAMPLE);

function syntaxOf(text: string): SyntaxProblem {
  const r = parseNotebookText(text);
  if (!('syntax' in r)) throw new Error(`expected a syntax problem for: ${text}`);
  return r.syntax;
}

function doc(slots: unknown[], card: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 2, notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots, ...card }] }] } };
}

afterEach(() => vi.restoreAllMocks());

describe('parseNotebookText — extracting the JSON from an AI reply', () => {
  it('parses bare JSON', () => {
    expect(parseNotebookText(GOOD)).toEqual({ json: AI_EXAMPLE });
  });

  it('strips a ```json fence and the prose around it', () => {
    const reply = `Sure! Here is your notebook:\n\n\`\`\`json\n${JSON.stringify(AI_EXAMPLE, null, 2)}\n\`\`\`\n\nLet me know {if} you want changes.`;
    expect(parseNotebookText(reply)).toEqual({ json: AI_EXAMPLE });
  });

  it('strips prose before the first { and after the last } without a fence', () => {
    expect(parseNotebookText(`Here you go: ${GOOD} Enjoy!`)).toEqual({ json: AI_EXAMPLE });
  });

  it('is not fooled by ``` inside a JSON string of a fenced block', () => {
    const nb = { version: 2, notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots: [{ type: 'text', props: { text: '```js\nx\n```' } }] }] }] } };
    const reply = `\`\`\`json\n${JSON.stringify(nb)}\n\`\`\``;
    expect(parseNotebookText(reply)).toEqual({ json: nb });
  });

  it('picks the notebook block when the reply also fences a small snippet', () => {
    const reply = `A slot looks like:\n\`\`\`json\n{"type": "text", "props": {"text": "hi"}}\n\`\`\`\nThe notebook:\n\`\`\`json\n${GOOD}\n\`\`\``;
    expect(parseNotebookText(reply)).toEqual({ json: AI_EXAMPLE });
  });

  it('handles an unclosed fence (a truncated reply)', () => {
    expect(parseNotebookText(`\`\`\`json\n${GOOD}`)).toEqual({ json: AI_EXAMPLE });
  });

  it('reports a reply with no JSON object at all', () => {
    const s = syntaxOf('I cannot help with that.');
    expect(s).toMatchObject({ message: 'No JSON object found', line: 1, column: 1 });
    expect(s.hint).toMatch(/\{/);
  });
});

describe('parseNotebookText — syntax errors with our own line/column', () => {
  it('locates a trailing comma at the comma, in the pasted text’s coordinates', () => {
    const reply = 'Here it is:\n```json\n{\n  "a": 1,\n}\n```';
    const s = syntaxOf(reply);
    expect(s.message).toMatch(/trailing comma/i);
    expect(s.hint).toMatch(/remove the comma/i);
    expect(s).toMatchObject({ line: 4, column: 9 });
    expect(s.excerpt).toBe('  "a": 1,\n        ^');
  });

  it('does not depend on the engine’s error message (WebKit gives no position)', () => {
    const real = JSON.parse;
    vi.spyOn(JSON, 'parse').mockImplementation((t: string) => {
      try {
        return real(t);
      } catch {
        throw new SyntaxError('JSON Parse error: Unexpected token');
      }
    });
    const s = syntaxOf('{\n  "version": 2\n  "notebook": {}\n}');
    expect(s.message).toMatch(/missing comma/i);
    expect(s).toMatchObject({ line: 3, column: 3 });
  });

  const cases: Array<[string, string, RegExp, RegExp, number, number]> = [
    ['single quotes', "{'version': 2}", /single quotes/i, /double quotes/i, 1, 2],
    ['unquoted key', '{version: 2}', /not in double quotes/i, /"version":/, 1, 2],
    ['a // comment', '{\n  // the version\n  "version": 2\n}', /comments/i, /delete/i, 2, 3],
    ['an unescaped LaTeX backslash', '{"text": "$\\alpha$"}', /invalid escape/i, /"\\\\alpha"/, 1, 12],
    ['a raw line break in a string', '{"text": "one\ntwo"}', /line break inside a string/i, /\\n/, 1, 14],
    ['a cut-off reply', '{"version": 2, "notebook": {"name": "N", "sections": [', /end of text/i, /cut off/i, 1, 55],
    ['Python literals', '{"flag": True}', /"True"/, /lowercase/i, 1, 10],
    ['curly quotes', '{“version”: 2}', /curly quotes/i, /straight/i, 1, 2],
    ['a non-breaking space', '{"a": 1}', /space/i, /normal space/i, 1, 6],
    ['a mismatched bracket', '{"a": [1, 2}', /mismatched/i, /\]/, 1, 12],
    ['a leading-zero number', '{"w": 06}', /start with 0/i, /not 07/, 1, 7],
    ['a trailing comma in an array', '{"a": [1, 2,]}', /trailing comma before \]/i, /remove/i, 1, 12],
    ['two JSON objects', '{"a": 1} {"b": 2}', /after the end/i, /only the one/i, 1, 10],
  ];

  it.each(cases)('%s', (_name, text, message, hint, line, column) => {
    const s = syntaxOf(text);
    expect(s.message).toMatch(message);
    expect(s.hint).toMatch(hint);
    expect({ line: s.line, column: s.column }).toEqual({ line, column });
  });

  it('every case JSON.parse rejects is located by the scanner (never the generic fallback)', () => {
    for (const [, text] of cases) expect(syntaxOf(text).message).not.toBe('The text is not valid JSON');
  });

  it('agrees with JSON.parse on what is valid, across 3000 random single-character edits', () => {
    // Deterministic PRNG (mulberry32) so a failure is reproducible.
    let seed = 0x5eed;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const base = JSON.stringify({ ...AI_EXAMPLE, extra: [1, -2.5, 3e2, true, false, null, 'é\\u00e9\\n"'] }, null, 1);
    const alphabet = '{}[]",:\\ \n\t-+.0123456789eEtrufalsn\'/* x';
    for (let k = 0; k < 3000; k++) {
      const at = Math.floor(rand() * base.length);
      const ch = alphabet[Math.floor(rand() * alphabet.length)];
      const op = rand();
      const text = op < 0.4 ? base.slice(0, at) + base.slice(at + 1) : op < 0.7 ? base.slice(0, at) + ch + base.slice(at) : base.slice(0, at) + ch + base.slice(at + 1);
      let engineOk = true;
      try {
        JSON.parse(text);
      } catch {
        engineOk = false;
      }
      const found = findJsonSyntaxError(text);
      expect(found === null, `edit #${k} at ${at} (${JSON.stringify(text.slice(Math.max(0, at - 15), at + 15))}): ${found?.message}`).toBe(engineOk);
      if (found) expect(found.offset).toBeLessThanOrEqual(text.length);
    }
  });

  it('windows a long single-line reply around the error', () => {
    const long = `{"a": "${'x'.repeat(300)}", "b": 1,}`;
    const s = syntaxOf(long);
    const [line, caret] = s.excerpt.split('\n');
    expect(line.length).toBeLessThanOrEqual(102);
    expect(line[caret.indexOf('^')]).toBe(',');
  });
});

describe('hintFor', () => {
  const issue = (over: Partial<Issue>): Issue => ({ code: 'x', path: '', message: '', ...over });

  it('suggests the closest slot type (Levenshtein ≤ 2) and lists the valid ones', () => {
    for (const [bad, want] of [['slidr', 'slider'], ['text_input', 'text-input'], ['Chart', 'chart'], ['choise', 'choice']]) {
      const h = hintFor(issue({ code: 'slot-type-unknown', subject: bad }))!;
      expect(h, bad).toContain(`Did you mean "${want}"?`);
      expect(h).toContain('text, ');
    }
    expect(hintFor(issue({ code: 'slot-type-unknown', subject: 'zzzzzz' }))).not.toMatch(/Did you mean/);
  });

  it('knows common LLM names for slot types', () => {
    expect(hintFor(issue({ code: 'slot-type-unknown', subject: 'quiz' }))).toContain('Did you mean "choice"?');
    expect(hintFor(issue({ code: 'slot-type-unknown', subject: 'graph' }))).toContain('Did you mean "chart"?');
    expect(hintFor(issue({ code: 'slot-type-unknown', subject: 'flashcard' }))).toMatch(/"flip": true/);
  });

  it('explains the card-scope rule for a cross-card read, naming the variable', () => {
    expect(hintFor(issue({ code: 'cross-card-read', subject: 'r' }))).toContain(
      'variables never cross cards — add a slider/compute that writes r in this card',
    );
  });

  it('explains cycles, ranges and versions', () => {
    expect(hintFor(issue({ code: 'cycle' }))).toMatch(/loop/);
    expect(hintFor(issue({ code: 'card-width-range' }))).toMatch(/3 to 12/);
    expect(hintFor(issue({ code: 'section-width-range' }))).toMatch(/positive/);
    expect(hintFor(issue({ code: 'fuse-width-range' }))).toMatch(/positive/);
    expect(hintFor(issue({ code: 'version-newer' }))).toContain('"version": 2');
    expect(hintFor(issue({ code: 'version-missing' }))).toContain('"version": 2');
  });

  it('gives slot-specific prop hints with the props shape from the schema', () => {
    const [answer] = validateNotebookIssues(doc([{ type: 'choice', props: { options: ['a', 'b'], answer: [2] } }])).errors;
    expect(hintFor(answer)).toMatch(/0-based/);
    expect(hintFor(answer)).toContain('options: string[]');
    const [noProps] = validateNotebookIssues(doc([{ type: 'slider' }])).errors;
    expect(noProps.code).toBe('props-not-object');
    expect(hintFor(noProps)).toContain('key: string');
  });

  it('distinguishes slot verbs from card verbs', () => {
    const [slotV] = validateNotebookIssues(doc([{ type: 'text', props: { text: 'a' }, verbs: { glow: 'yes' } }])).errors;
    const [cardV] = validateNotebookIssues(doc([{ type: 'text', props: { text: 'a' } }], { verbs: { flip: 'yes' } })).errors;
    expect(hintFor(slotV)).toMatch(/reveal/);
    expect(hintFor(cardV)).toMatch(/"flip": true/);
  });

  it('every code validateNotebookIssues can emit for a typical mistake has a hint', () => {
    const json = doc([{ type: 'quiz', props: {} }, { type: 'text', props: { text: '{{r}}' } }], { w: 1, tags: 'x' });
    const { errors, warnings } = validateNotebookIssues(json);
    for (const i of [...errors, ...warnings]) expect(hintFor(i), i.code).toBeTruthy();
  });

  it('returns null when the message says it all', () => {
    expect(hintFor(issue({ code: 'wrong-type', path: 'notebook.sections[0].title' }))).toBeNull();
    expect(hintFor(issue({ code: 'never-heard-of-it' }))).toBeNull();
  });
});

describe('describeIssue / humanPath', () => {
  it('splits the location off the legacy message', () => {
    const [w] = validateNotebookIssues(doc([{ type: 'text', props: { text: 'a' } }], { w: 2 })).errors;
    expect(describeIssue(w)).toEqual({ where: 'notebook.sections[0].cards[0].w', what: 'must be a number between 3 and 12' });
    const [t] = validateNotebookIssues(doc([{ type: 'quiz', props: {} }])).errors;
    expect(describeIssue(t).what).toBe('has unknown slot type: quiz');
    const [v] = validateNotebookIssues({ notebook: { name: 'x', sections: [] } }).errors;
    expect(describeIssue(v)).toEqual({ where: 'version', what: 'Missing or invalid "version" field' });
    const [s] = validateNotebookIssues({ version: 2, notebook: { name: 'x', sections: 4 } }).errors;
    expect(describeIssue(s).what).toBe('must be an array');
  });

  it('humanizes paths 1-based', () => {
    expect(humanPath('notebook.sections[0].cards[1].slots[2].props')).toBe('section 1 › card 2 › slot 3 › props');
    expect(humanPath('notebook.sections[1].cards[0].back[0]')).toBe('section 2 › card 1 › back slot 1');
    expect(humanPath('notebook.name')).toBe('notebook › name');
    expect(humanPath('')).toBe('whole file');
    expect(humanPath('line 3, column 9')).toBe('line 3, column 9');
  });
});

describe('levenshtein / didYouMean', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
  it('suggests within the limit only', () => {
    expect(didYouMean('optoins', ['options', 'answer'])).toBe('options');
    expect(didYouMean('xyz', ['options', 'answer'])).toBeNull();
  });
});

describe('AI-path lints (warnings the app would otherwise swallow)', () => {
  it('flags unknown fields with a did-you-mean against the schema', () => {
    const json = doc([{ type: 'choice', props: { question: 'Q?', options: ['a', 'b'], answers: [0] } }], { title: 'Card title' });
    const issues = lintUnknownFields(json);
    const byKey = Object.fromEntries(issues.map((i) => [i.subject, i]));
    expect(byKey.question.path).toBe('notebook.sections[0].cards[0].slots[0].props.question');
    expect(byKey.question.hint).toContain('Did you mean "q"?');
    expect(byKey.answers.hint).toContain('Did you mean "answer"?');
    expect(byKey.title.hint).toMatch(/text slot/);
    expect(issues.every((i) => i.code === 'unknown-field')).toBe(true);
  });

  it('flags prototype-named keys as unknown instead of resolving them on Object.prototype', () => {
    const json = JSON.parse('{"version": 2, "notebook": {"name": "N", "constructor": 1, "__proto__": {"x": 1}, "sections": []}}');
    expect(lintUnknownFields(json).map((i) => i.subject).sort()).toEqual(['__proto__', 'constructor']);
    expect(hintFor({ code: 'slot-type-unknown', path: '', message: '', subject: 'constructor' })).not.toMatch(/Did you mean "function/);
  });

  it('accepts everything the schema defines (no noise on a good notebook)', () => {
    expect(lintUnknownFields(AI_EXAMPLE)).toEqual([]);
    expect(lintLatexEscapes(AI_EXAMPLE)).toEqual([]);
  });

  it('does not check props of an unknown slot type (that is already an error)', () => {
    expect(lintUnknownFields(doc([{ type: 'mystery', props: { anything: 1 } }]))).toEqual([]);
  });

  it('catches LaTeX whose single backslash JSON swallowed (\\frac → form feed)', () => {
    const parsed = parseNotebookText('{"version": 2, "notebook": {"name": "N", "sections": [{"name": "S", "cards": [{"slots": [{"type": "text", "props": {"text": "$\\frac{1}{2}$ and $\\theta$ and $\\beta$"}}]}]}]}}');
    expect('json' in parsed).toBe(true);
    const issues = lintLatexEscapes((parsed as { json: unknown }).json);
    expect(issues.map((i) => i.subject)).toEqual(['frac', 'theta', 'beta']);
    expect(issues[0].path).toBe('notebook.sections[0].cards[0].slots[0].props.text');
    expect(issues[0].hint).toContain('"\\\\frac"');
  });

  it('leaves real newlines and tabs alone', () => {
    const json = doc([{ type: 'text', props: { text: '## Title\nThe $x$ axis\n\tindented\ne.g. this\ni.e. that' } }]);
    expect(lintLatexEscapes(json)).toEqual([]);
  });
});

describe('checkNotebookText', () => {
  it('passes a good AI reply', () => {
    const r = checkNotebookText('```json\n' + GOOD + '\n```');
    expect(r).toMatchObject({ ok: true, errors: [], warnings: [] });
    expect(r.json).toEqual(AI_EXAMPLE);
  });

  it('turns a syntax problem into a single error issue', () => {
    const r = checkNotebookText('{"a": 1,}');
    expect(r.ok).toBe(false);
    expect(r.syntax).toBeDefined();
    expect(r.errors).toEqual([syntaxIssue(r.syntax!)]);
    expect(r.errors[0]).toMatchObject({ code: 'json-syntax', path: 'line 1, column 8' });
  });

  it('collects validation errors and lint warnings together', () => {
    const json = doc([{ type: 'quiz', props: {} }, { type: 'text', props: { txt: 'x', text: 'see {{r}}' } }]);
    const r = checkNotebookText(JSON.stringify(json));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(['slot-type-unknown']);
    expect(r.warnings.map((w) => w.code).sort()).toEqual(['cross-card-read', 'unknown-field']);
  });

  it('warnings alone still allow the import', () => {
    const r = checkNotebookText(JSON.stringify(doc([{ type: 'text', props: { text: 'see {{r}}' } }])));
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
  });
});

describe('notebookSummary', () => {
  it('counts sections, chapters, cards, quizzes, flashcards and interactive cards', () => {
    const json = {
      version: 2,
      notebook: {
        name: 'Deck',
        sections: [
          { name: 'Part I', kind: 'divider', cards: [] },
          ...AI_EXAMPLE.notebook.sections,
        ],
      },
    };
    expect(notebookSummary(json)).toEqual({ name: 'Deck', sections: 1, chapters: 1, cards: 5, quizzes: 1, flashcards: 1, interactive: 1 });
  });

  it('tolerates junk', () => {
    expect(notebookSummary(null)).toMatchObject({ name: '', sections: 0, cards: 0 });
    expect(notebookSummary({ notebook: { sections: [null, { cards: [null, {}] }] } }).cards).toBe(1);
  });
});

describe('buildFixRequest', () => {
  it('lists every problem with location, message and fix, then asks for the full JSON only', () => {
    const { errors, warnings } = checkNotebookText(
      JSON.stringify(doc([{ type: 'slidr', props: { key: 'a', value: 1 } }, { type: 'text', props: { text: '{{z}}' } }], { w: 20 })),
    );
    const msg = buildFixRequest(errors, warnings);
    expect(msg).toMatch(/^Your NoteBuilder JSON has these problems/);
    expect(msg).toContain('1. notebook.sections[0].cards[0].w: must be a number between 3 and 12');
    expect(msg).toContain('Did you mean "slider"?');
    expect(msg).toContain('variables never cross cards — add a slider/compute that writes z in this card');
    expect(msg).toMatch(/warnings/);
    expect(msg).toMatch(/Return the full corrected JSON only/);
  });

  it('works for a syntax problem', () => {
    const r = checkNotebookText('{"version": 2,}');
    const msg = buildFixRequest(r.errors);
    expect(msg).toContain('1. line 1, column 14: Trailing comma before }');
    expect(msg).toContain('Fix: Remove the comma');
  });

  it('words a warnings-only request accordingly', () => {
    const r = checkNotebookText(JSON.stringify(doc([{ type: 'text', props: { text: '{{z}}' } }])));
    expect(buildFixRequest(r.errors, r.warnings)).toMatch(/^Your NoteBuilder JSON loads, but has these warnings/);
  });
});
