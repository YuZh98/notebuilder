/**
 * Review fixes for parseNotebookText: an AI reply often wraps the notebook in prose that has
 * braces of its own ({{r}} placeholders, a fenced example slot). The notebook must still be
 * found, and a root object that closes early must stay a syntax error (never a silent cut).
 */
import { describe, it, expect } from 'vitest';
import { parseNotebookText, checkNotebookText } from './import-hints';
import { AI_EXAMPLE } from './ai-prompt';

const PRETTY = JSON.stringify(AI_EXAMPLE, null, 2);

describe('parseNotebookText — prose with braces around a bare notebook', () => {
  it('takes the bare notebook, not a fenced example slot that follows it', () => {
    const reply = `${PRETTY}\n\nYou could also add a slot like:\n\`\`\`json\n{"type": "text", "props": {"text": "hi"}}\n\`\`\`\n`;
    expect(parseNotebookText(reply)).toEqual({ json: AI_EXAMPLE });
  });

  it('takes the bare notebook when a fenced example slot comes first', () => {
    const reply = `A slot looks like:\n\`\`\`json\n{"type": "text", "props": {"text": "hi"}}\n\`\`\`\nHere is the notebook:\n${PRETTY}`;
    expect(parseNotebookText(reply)).toEqual({ json: AI_EXAMPLE });
  });

  it('ignores braces in the prose after the notebook', () => {
    const reply = `Here you go:\n${PRETTY}\nThe text uses {{r}} to show the live rate. Let me know {if} you want changes.`;
    expect(parseNotebookText(reply)).toEqual({ json: AI_EXAMPLE });
  });

  it('ignores braces in the prose before the notebook', () => {
    const reply = `I used {{r}} and {{t}} placeholders {as asked}:\n\n${PRETTY}\n`;
    expect(parseNotebookText(reply)).toEqual({ json: AI_EXAMPLE });
    expect(checkNotebookText(reply).ok).toBe(true);
  });

  it('prose right after the notebook may itself open with a brace', () => {
    expect(parseNotebookText(`${PRETTY}\n{{r}} shows the live rate.`)).toEqual({ json: AI_EXAMPLE });
    expect(parseNotebookText(`${PRETTY}\n[Tell me](#) if you want more cards.`)).toEqual({ json: AI_EXAMPLE });
  });

  it('many prose braces before the notebook do not exhaust the search', () => {
    const reply = `${'{{r}} '.repeat(60)}\n${PRETTY}`;
    expect(parseNotebookText(reply)).toEqual({ json: AI_EXAMPLE });
  });

  it('a root object that closes early stays a syntax error (the rest is never dropped silently)', () => {
    const nb = { version: 2, notebook: { name: 'N', sections: [{ name: 'A', cards: [] }] } };
    // An extra "}" closes the root after section A; section B dangles after it.
    const broken = JSON.stringify(nb) + ', {"name": "B", "cards": []}]}}';
    const r = parseNotebookText(broken);
    expect('syntax' in r).toBe(true);
    // An extra "}" before a key: the rest of the notebook dangles after the root.
    const broken2 = '{"version": 2, "notebook": {"name": "N"}}, "sections": []}';
    expect('syntax' in parseNotebookText(broken2)).toBe(true);
  });

  it('two notebooks back to back are reported, not silently reduced to the first', () => {
    const r = parseNotebookText(`${PRETTY}\n${PRETTY}`);
    expect('syntax' in r).toBe(true);
  });

  it('locates a syntax error in the notebook, not at a brace in the prose before it', () => {
    const broken = PRETTY.replace('"version": 2,', '"version": 2');
    const reply = `I used {{r}} placeholders:\n${broken}`;
    const r = parseNotebookText(reply);
    if (!('syntax' in r)) throw new Error('expected a syntax problem');
    expect(r.syntax.message).toMatch(/missing comma/i);
    expect(r.syntax.line).toBe(4); // the "notebook" key, after the missing comma (prose is line 1)
  });
});
