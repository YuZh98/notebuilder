/**
 * Review fix: a reply with a trailing comma AND schema problems reported only the comma, so the
 * author paid a second round trip with their AI to learn about the rest. When trailing commas
 * are the only syntax problem, the check now re-reads the reply without them and lists what that
 * copy's validation finds too — while Create stays blocked, because the comma is still there.
 */
import { describe, it, expect } from 'vitest';
import { checkNotebookText, buildFixRequest, stripTrailingCommas, parseNotebookText } from './import-hints';

function doc(slots: unknown[], top: Record<string, unknown> = { version: 2 }): Record<string, unknown> {
  return { ...top, notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots }] }] } };
}

/** Pretty JSON with a trailing comma inserted after the first match of `after`. */
function withComma(json: unknown, after: string): string {
  const s = JSON.stringify(json, null, 2);
  const at = s.indexOf(after);
  expect(at, `marker ${after}`).toBeGreaterThanOrEqual(0);
  return s.slice(0, at + after.length) + ',' + s.slice(at + after.length);
}

describe('stripTrailingCommas', () => {
  it('blanks commas right before } or ] (whitespace between allowed), keeping every offset', () => {
    const src = '{"a": [1, 2,], "b": {"c": 3 ,\n }, "d": 4,}';
    const { text, removed } = stripTrailingCommas(src);
    expect(removed).toBe(3);
    expect(text).toHaveLength(src.length);
    expect(JSON.parse(text)).toEqual({ a: [1, 2], b: { c: 3 }, d: 4 });
  });

  it('never touches a comma inside a string, escaped quotes included', () => {
    const src = '{"t": "a, }", "u": "b,]", "v": "say \\", ]", "w": [",]",],}';
    const { text, removed } = stripTrailingCommas(src);
    expect(removed).toBe(2);
    expect(JSON.parse(text)).toEqual({ t: 'a, }', u: 'b,]', v: 'say ", ]', w: [',]'] });
  });

  it('leaves valid JSON and a comma followed by another value alone', () => {
    expect(stripTrailingCommas('{"a": [1, 2], "b": 3}')).toEqual({ text: '{"a": [1, 2], "b": 3}', removed: 0 });
    expect(stripTrailingCommas('[1,,]').text).toBe('[1, ]');
  });
});

describe('checkNotebookText — trailing commas plus schema problems', () => {
  const bad = doc([{ type: 'quiz', props: {} }, { type: 'text', props: { txt: 'x', text: 'see {{r}}' } }], {});
  const reply = 'Here is your notebook:\n```json\n' + withComma(bad, '"see {{r}}"') + '\n```\nEnjoy!';

  it('reports the comma first, then the validation errors and warnings of the comma-free copy', () => {
    const r = checkNotebookText(reply);
    expect(r.ok).toBe(false);
    expect(r.json).toBeUndefined();
    expect(r.syntax).toMatchObject({ message: 'Trailing comma before }' });
    expect(r.errors[0]).toMatchObject({ code: 'json-syntax', message: 'Trailing comma before }' });
    expect(r.errors.slice(1).map((e) => e.code).sort()).toEqual(['slot-type-unknown', 'version-missing']);
    expect(r.errors.find((e) => e.code === 'slot-type-unknown')?.path).toBe('notebook.sections[0].cards[0].slots[0].type');
    expect(r.warnings.map((w) => w.code).sort()).toEqual(['cross-card-read', 'unknown-field']);
  });

  it('keeps the comma located in the pasted text', () => {
    const r = checkNotebookText(reply);
    const lines = reply.split('\n');
    const { line, column } = r.syntax!;
    expect(lines[line - 1][column - 1]).toBe(',');
    expect(lines[line - 1]).toContain('"see {{r}}",');
  });

  it('the fix request carries every problem in one round trip', () => {
    const r = checkNotebookText(reply);
    const msg = buildFixRequest(r.errors, r.warnings);
    expect(msg).toMatch(/Trailing comma/);
    expect(msg).toContain('Did you mean "choice"?');
    expect(msg).toMatch(/"version": 2/);
    expect(msg).toMatch(/variables never cross cards/);
  });

  it('a comma inside a string value is not touched by the lenient read', () => {
    const json = doc([{ type: 'quiz, ]', props: {} }, { type: 'text', props: { text: 'a, }' } }]);
    const r = checkNotebookText(withComma(json, '"a, }"'));
    expect(r.errors.map((e) => e.code)).toEqual(['json-syntax', 'slot-type-unknown']);
    expect(r.errors[1].message).toMatch(/unknown slot type: quiz, \]$/);
    expect(r.warnings).toEqual([]);
  });

  it('a notebook whose only problem is the comma stays blocked, with nothing else to report', () => {
    const good = doc([{ type: 'text', props: { text: 'Hello' } }]);
    const r = checkNotebookText(withComma(good, '"Hello"'));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(['json-syntax']);
    expect(r.warnings).toEqual([]);
  });

  it('counts every trailing comma in the hint when there are several', () => {
    const good = doc([{ type: 'list', props: { items: ['a', 'b'], style: 'bullets' } }]);
    let text = withComma(good, '"b"');
    text = text.replace('"bullets"', '"bullets",');
    const r = checkNotebookText(text);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].hint).toMatch(/2 trailing commas in all/);
    expect(r.syntax!.hint).toBe(r.errors[0].hint);
  });

  it('any other syntax problem keeps the old single-error report', () => {
    let text = withComma(bad, '"see {{r}}"');
    text = text.replace('"name": "N"', '"name" "N"'); // missing colon, before the comma
    const r = checkNotebookText(text);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Expected ":"/);
    expect(r.warnings).toEqual([]);

    let later = withComma(bad, '"see {{r}}"');
    later = later.replace(/\}\s*$/, ''); // cut off after the comma
    expect(checkNotebookText(later).errors).toHaveLength(1);
  });

  it('a non-notebook object with a trailing comma reports only the comma', () => {
    const r = checkNotebookText('{"a": 1,}');
    expect(r.errors.map((e) => e.code)).toEqual(['json-syntax']);
  });

  it('valid replies are unaffected', () => {
    const good = JSON.stringify(doc([{ type: 'text', props: { text: 'a, }' } }]));
    expect(parseNotebookText(good)).toEqual({ json: JSON.parse(good) });
    expect(checkNotebookText(good)).toMatchObject({ ok: true, errors: [], warnings: [] });
  });
});
