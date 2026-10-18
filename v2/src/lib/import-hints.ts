/**
 * Human-readable import problems (D2b): parse pasted/loaded notebook text with our own error
 * positions, attach a fix hint to every validation issue, and turn a report into a request the
 * author can paste back into their LLM.
 *
 * Positions are computed here, never read from the engine's SyntaxError: WebKit (the Tauri
 * webview) reports no line/column at all, unlike V8.
 *
 * Not imported by json-io.ts — keeps the schema (via slot-catalog) out of the Reader bundle.
 */
import { validateNotebookIssues, type Issue } from './json-io';
import { allSlots } from './slots/registry';
import { propsSignature } from './slot-catalog';
import { NOTEBOOK_SCHEMA, resolveRef, type JsonSchema } from './schema/schema';

/** An issue that may carry its own fix hint (syntax and lint issues are created with one). */
export type HintedIssue = Issue & { hint?: string; excerpt?: string };

export type SyntaxProblem = {
  message: string;
  /** 1-based line in the text the author pasted (not in the extracted JSON). */
  line: number;
  /** 1-based column (UTF-16 code units). */
  column: number;
  hint: string;
  /** The offending line with a caret under the column. */
  excerpt: string;
};

export type ParseResult = { json: unknown } | { syntax: SyntaxProblem };

export type CheckResult = {
  /** True when the text parsed and validation found no errors (warnings may remain). */
  ok: boolean;
  json?: unknown;
  syntax?: SyntaxProblem;
  errors: HintedIssue[];
  warnings: HintedIssue[];
};

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

type Range = { start: number; end: number };

/** Content ranges of the ```/~~~ fenced blocks in a reply (an unclosed fence runs to the end). */
function fencedBlocks(text: string): Range[] {
  const opening = /(^|\n)[ \t]*(`{3,}|~{3,})[^\n`]*\n/g;
  const blocks: Range[] = [];
  let m: RegExpExecArray | null;
  while ((m = opening.exec(text))) {
    const contentStart = m.index + m[0].length;
    const marker = m[2];
    const closing = new RegExp(`\\n[ \\t]*\\${marker[0]}{${marker.length},}[ \\t]*(?=\\n|$)`, 'g');
    closing.lastIndex = contentStart - 1;
    const close = closing.exec(text);
    blocks.push({ start: contentStart, end: close ? close.index : text.length });
    opening.lastIndex = close ? close.index + close[0].length : text.length;
  }
  return blocks;
}

/**
 * Text that continues JSON rather than starting prose (`,` `:` `]` `}` `"` or another object):
 * an object that ends right before it closed early. A prose brace like {{r}} does not count.
 */
const JSON_CONTINUES = /^(?:[,:\]}"]|\{\s*["}])/;

/**
 * The complete JSON object starting at `start` (within `to`), or null. `continues` marks JSON
 * right after it (`}, {…`, `} "key": …`, a second object): for a notebook that means it closed
 * early or has a twin — a syntax error to report, never a notebook to cut short silently.
 */
function objectAt(text: string, start: number, to: number): { json: unknown; end: number; continues: boolean } | null {
  const fail = findJsonSyntaxError(text.slice(start, to));
  if (fail && !fail.trailing) return null;
  const end = fail ? start + fail.offset : to;
  try {
    return { json: JSON.parse(text.slice(start, end)), end, continues: JSON_CONTINUES.test(text.slice(end, end + 64)) };
  } catch {
    return null;
  }
}

const hasNotebookKey = (v: unknown): boolean =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, 'notebook');

/** Bare `{"` positions tried before giving up (a bound on rescanning a long broken reply). */
const MAX_BARE_TRIES = 40;

/**
 * The notebook object in an AI reply, wherever it sits: in a fenced block first, else bare in the
 * prose — which may hold braces of its own ({{r}}, a fenced example slot) before or after it.
 * null when there is none, or when the one found is followed by more JSON (the caller reports it).
 */
function findNotebookObject(text: string): { json: unknown } | null {
  const blocks = fencedBlocks(text);
  for (const b of blocks) {
    const at = text.indexOf('{', b.start);
    if (at < 0 || at >= b.end) continue;
    const hit = objectAt(text, at, b.end);
    if (hit && hasNotebookKey(hit.json)) return hit.continues ? null : { json: hit.json };
  }
  // A notebook opens as `{"`; prose braces ({{r}}, {like this}) never do, so they cost nothing.
  const objStart = /\{\s*"/g;
  let m: RegExpExecArray | null;
  for (let tries = 0; tries < MAX_BARE_TRIES && (m = objStart.exec(text)); ) {
    const at = m.index;
    const fence = blocks.find((b) => at >= b.start && at < b.end);
    if (fence) {
      objStart.lastIndex = fence.end;
      continue;
    }
    tries++;
    const hit = objectAt(text, at, text.length);
    if (hit && hasNotebookKey(hit.json)) return hit.continues ? null : { json: hit.json };
    objStart.lastIndex = hit ? hit.end : at + 1;
  }
  return null;
}

/**
 * Where to report a syntax error when no complete notebook object was found: a fenced block that
 * holds one (the first that mentions "notebook", else the largest — a reply may also fence a
 * small snippet), else between the first `{` and the last `}` (prose around it is ignored).
 */
function jsonRegion(text: string): Range | null {
  const fenced = fencedBlocks(text)
    .map((b) => braceRegion(text, b.start, b.end))
    .filter((r): r is Range => r !== null);
  if (fenced.length) {
    const named = fenced.find((r) => text.slice(r.start, r.end).includes('"notebook"'));
    return named ?? fenced.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  }
  return braceRegion(text, 0, text.length);
}

/** From the first `{"` (a JSON object, not a prose brace like {{r}}) — else the first `{` — to the last `}`. */
function braceRegion(text: string, from: number, to: number): Range | null {
  const objStart = /\{\s*"/g;
  objStart.lastIndex = from;
  const m = objStart.exec(text);
  const start = m && m.index < to ? m.index : text.indexOf('{', from);
  if (start < 0 || start >= to) return null;
  const last = text.lastIndexOf('}', to - 1);
  return { start, end: last >= start ? last + 1 : to };
}

/** `trailing`: the text holds one complete JSON value and more text after it, at `offset`. */
type ScanFail = { offset: number; message: string; hint: string; trailing?: boolean };
const isScanFail = (e: unknown): e is ScanFail =>
  !!e && typeof e === 'object' && typeof (e as ScanFail).offset === 'number' && typeof (e as ScanFail).hint === 'string';

const CUT_OFF =
  'The JSON stops early, so the AI reply was probably cut off. Ask it to "continue" (or to write a shorter notebook) and paste the whole reply.';
const VALUE_START = /[{["\-0-9tfn]/;

/**
 * Strict RFC 8259 scan that locates the FIRST syntax error and explains it (null = valid JSON).
 * parseNotebookText only calls it after JSON.parse has failed, to get a position and a hint
 * the engine does not give; a fuzz test pins it to JSON.parse's verdict.
 */
export function findJsonSyntaxError(s: string): ScanFail | null {
  let i = 0;
  const n = s.length;
  const fail = (offset: number, message: string, hint: string): never => {
    throw { offset, message, hint } satisfies ScanFail;
  };

  const skipWs = (): void => {
    while (i < n) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
      else if (c === '/' && (s[i + 1] === '/' || s[i + 1] === '*')) {
        fail(i, 'Comments are not allowed in JSON', 'Delete the // or /* */ comment.');
      } else break;
    }
  };

  const wordAt = (at: number): string => /^[A-Za-z_$][\w$]*/.exec(s.slice(at, at + 64))?.[0] ?? '';

  const unexpected = (at: number, where: string): never => {
    const c = s[at];
    if (c === undefined) return fail(at, `Unexpected end of text ${where}`, CUT_OFF);
    if (c === "'") return fail(at, 'Single quotes are not JSON quotes', 'Replace the single quotes \'…\' with double quotes "…".');
    if ('“”„‘’'.includes(c)) {
      return fail(at, 'Curly quotes are not JSON quotes', 'Replace “ ” (or ‘ ’) with straight double quotes ".');
    }
    if (c === ' ' || c === '﻿' || c === '​' || c === ' ' || c === ' ') {
      return fail(at, 'Invisible non-standard space character', 'Replace it with a normal space (it often comes from copying out of a web page).');
    }
    const word = wordAt(at);
    if (word) {
      if (/^(True|False|None|TRUE|FALSE|NULL|Null)$/.test(word)) {
        return fail(at, `Unexpected word "${word}"`, 'JSON writes true, false and null in lowercase (None is null).');
      }
      if (/^(NaN|Infinity|undefined)$/.test(word)) {
        return fail(at, `Unexpected word "${word}"`, 'NaN, Infinity and undefined are not JSON: write a number, or null.');
      }
      return fail(at, `Unexpected word "${word}" ${where}`, `Text values must be in double quotes: "${word}".`);
    }
    if (c === ']') return fail(at, 'Mismatched bracket "]"', '"]" closes an array, but an object is open here: it needs "}". Check the brackets.');
    if (c === '}') return fail(at, 'Mismatched bracket "}"', '"}" closes an object, but an array is open here: it needs "]". Check the brackets.');
    return fail(at, `Unexpected character "${c}" ${where}`, 'Check the JSON just before this point for a missing comma, quote or bracket.');
  };

  const value = (where: string): void => {
    skipWs();
    if (i >= n) fail(i, `Unexpected end of text ${where}`, CUT_OFF);
    const c = s[i];
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) return number();
    for (const lit of ['true', 'false', 'null']) {
      if (s.startsWith(lit, i) && !/[\w$]/.test(s[i + lit.length] ?? '')) {
        i += lit.length;
        return;
      }
    }
    if (c === '.' || c === '+') fail(i, 'Invalid number', 'Numbers start with a digit or "-": write 0.5, not .5 or +5.');
    unexpected(i, where);
  };

  const object = (): void => {
    i++; // {
    skipWs();
    if (s[i] === '}') {
      i++;
      return;
    }
    let lastComma = -1;
    for (;;) {
      skipWs();
      const c = s[i];
      if (c === '"') string();
      else if (c === '}' && lastComma >= 0) fail(lastComma, 'Trailing comma before }', 'Remove the comma after the last property.');
      else if (c !== undefined && /[A-Za-z_$]/.test(c)) {
        const word = wordAt(i);
        fail(i, `Property name ${word} is not in double quotes`, `Write "${word}": instead of ${word}:`);
      } else unexpected(i, 'where a property name in double quotes should be');
      skipWs();
      if (s[i] !== ':') {
        if (i >= n) fail(i, 'Unexpected end of text inside an object', CUT_OFF);
        fail(i, 'Expected ":" after the property name', 'Every property is written "name": value.');
      }
      i++;
      value('after ":"');
      skipWs();
      if (s[i] === ',') {
        lastComma = i++;
        continue;
      }
      if (s[i] === '}') {
        i++;
        return;
      }
      if (i >= n) fail(i, 'Unexpected end of text inside an object', CUT_OFF);
      if (s[i] === '"') fail(i, 'Missing comma between properties', 'Add a comma after the previous value.');
      unexpected(i, 'after a value (expected , or })');
    }
  };

  const array = (): void => {
    i++; // [
    skipWs();
    if (s[i] === ']') {
      i++;
      return;
    }
    let lastComma = -1;
    for (;;) {
      skipWs();
      if (s[i] === ']' && lastComma >= 0) fail(lastComma, 'Trailing comma before ]', 'Remove the comma after the last item.');
      value('in an array');
      skipWs();
      if (s[i] === ',') {
        lastComma = i++;
        continue;
      }
      if (s[i] === ']') {
        i++;
        return;
      }
      if (i >= n) fail(i, 'Unexpected end of text inside an array', CUT_OFF);
      if (VALUE_START.test(s[i])) fail(i, 'Missing comma between items', 'Add a comma after the previous item.');
      unexpected(i, 'after an array item (expected , or ])');
    }
  };

  const string = (): void => {
    const open = i;
    i++; // opening quote
    for (;;) {
      if (i >= n) fail(open, 'Unterminated string', 'This string has no closing double quote (or the reply was cut off).');
      const c = s[i];
      if (c === '"') {
        i++;
        return;
      }
      if (c === '\\') {
        const e = s[i + 1];
        if (e === undefined) fail(open, 'Unterminated string', 'This string has no closing double quote (or the reply was cut off).');
        if ('"\\/bfnrt'.includes(e)) {
          i += 2;
          continue;
        }
        if (e === 'u') {
          if (/^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
            i += 6;
            continue;
          }
          fail(i, 'Invalid \\u escape', 'Write \\u followed by exactly four hex digits, e.g. \\u00e9.');
        }
        const cmd = /^[A-Za-z]+/.exec(s.slice(i + 1, i + 40))?.[0] ?? e;
        fail(
          i,
          `Invalid escape "\\${e}" in a string`,
          `JSON needs every backslash doubled: write "\\\\${cmd}" instead of "\\${cmd}" (LaTeX too: "\\\\frac", "\\\\alpha").`,
        );
      }
      if (c.charCodeAt(0) < 0x20) {
        if (c === '\n' || c === '\r') {
          fail(i, 'Line break inside a string', 'Write line breaks inside strings as \\n, or close the string: a quote may be missing on this line.');
        }
        fail(i, 'Control character inside a string', c === '\t' ? 'Write a tab inside a string as \\t.' : 'Remove the invisible control character.');
      }
      i++;
    }
  };

  const number = (): void => {
    const re = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) return fail(i, 'Invalid number', 'Numbers look like 3, -0.5 or 2.5e3.');
    const end = i + m[0].length;
    const next = s[end] ?? '';
    if ((m[0] === '0' || m[0] === '-0') && next >= '0' && next <= '9') {
      fail(i, 'Numbers cannot start with 0', 'Write 7, not 07.');
    }
    if (next === '.' || next === 'e' || next === 'E') fail(end, 'Invalid number', 'A decimal point or exponent needs digits after it: 2.0, not 2.');
    i = end;
  };

  try {
    value('at the start');
    skipWs();
    if (i < n) {
      throw {
        offset: i,
        message: 'Unexpected text after the end of the JSON',
        hint: 'The reply holds more than one JSON value or text after it: keep only the one notebook object.',
        trailing: true,
      } satisfies ScanFail;
    }
    return null;
  } catch (e) {
    return isScanFail(e) ? e : null; // e.g. RangeError on absurd nesting: no position, caller falls back
  }
}

function lineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  const stop = Math.min(offset, text.length);
  for (let k = 0; k < stop; k++) {
    if (text.charCodeAt(k) === 10) {
      line++;
      lastBreak = k;
    }
  }
  return { line, column: offset - lastBreak };
}

/** The line around `offset`, windowed to ~100 chars, with a caret under the offending column. */
function excerptAt(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  let lineEnd = text.indexOf('\n', offset);
  if (lineEnd < 0) lineEnd = text.length;
  const col = offset - lineStart;
  const from = Math.max(0, col - 60);
  const to = Math.min(lineEnd - lineStart, from + 100);
  const raw = text.slice(lineStart + from, lineStart + to).replace(/[\t\r]/g, ' ');
  const lead = from > 0 ? '…' : '';
  const tail = lineStart + to < lineEnd ? '…' : '';
  return `${lead}${raw}${tail}\n${' '.repeat(lead.length + col - from)}^`;
}

/**
 * Parse notebook text the way an author pastes it: ```json fences and prose around the object
 * are ignored. On failure, the position is computed here (line/column in the pasted text).
 */
export function parseNotebookText(text: string): ParseResult {
  const found = findNotebookObject(text);
  if (found) return found;
  const region = jsonRegion(text);
  if (!region) {
    return {
      syntax: {
        message: 'No JSON object found',
        line: 1,
        column: 1,
        hint: 'Paste the AI reply itself: it must contain one JSON object that starts with { and ends with }.',
        excerpt: '',
      },
    };
  }
  const body = text.slice(region.start, region.end);
  try {
    return { json: JSON.parse(body) };
  } catch {
    const found = findJsonSyntaxError(body);
    const offset = region.start + (found?.offset ?? 0);
    const { line, column } = lineCol(text, offset);
    return {
      syntax: {
        message: found?.message ?? 'The text is not valid JSON',
        line,
        column,
        hint: found?.hint ?? 'Check the JSON for a missing comma, quote or bracket.',
        excerpt: excerptAt(text, offset),
      },
    };
  }
}

/** A syntax problem as a report issue (path is the human locator `line L, column C`). */
export function syntaxIssue(s: SyntaxProblem): HintedIssue {
  return { code: 'json-syntax', path: `line ${s.line}, column ${s.column}`, message: s.message, hint: s.hint, excerpt: s.excerpt };
}

// ---------------------------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------------------------

/** Plain Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let x = 1; x <= a.length; x++) {
    const cur = [x];
    for (let y = 1; y <= b.length; y++) {
      cur[y] = Math.min(prev[y] + 1, cur[y - 1] + 1, prev[y - 1] + (a[x - 1] === b[y - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** The closest candidate within `max` edits (case-insensitive), or null. */
export function didYouMean(word: string, candidates: readonly string[], max = 2): string | null {
  let best: string | null = null;
  let bestD = max + 1;
  for (const c of candidates) {
    const d = levenshtein(word.toLowerCase(), c.toLowerCase());
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return bestD <= max ? best : null;
}

const registeredTypes = (): string[] => allSlots().map((s) => s.type);

/** Own-property lookup: user-supplied keys ("constructor", "__proto__") must not hit the prototype. */
const own = <T>(o: Record<string, T>, k: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;

/** What LLMs commonly call our slot types. */
const SLOT_ALIASES: Record<string, string> = {
  quiz: 'choice', mcq: 'choice', question: 'choice', 'multiple-choice': 'choice', multiplechoice: 'choice', radio: 'choice',
  markdown: 'text', paragraph: 'text', heading: 'text', note: 'text', md: 'text', math: 'text', latex: 'text',
  formula: 'compute', calc: 'compute', calculation: 'compute', computed: 'compute', expression: 'compute', output: 'compute',
  graph: 'chart', plot: 'chart', function: 'chart',
  input: 'text-input', textbox: 'text-input', answer: 'text-input', 'free-text': 'text-input', 'short-answer': 'text-input', textarea: 'text-input',
  checklist: 'list', bullets: 'list', todo: 'list',
  picture: 'image', img: 'image', figure: 'image',
  number: 'slider', range: 'slider', knob: 'slider', parameter: 'slider',
  meter: 'progress', 'progress-bar': 'progress',
  grid: 'table',
};

/**
 * The slot type an unknown `type` most likely meant, or null. Tried in order: the name itself,
 * then without a plural -es / -s, each as a type or a known alias ("checklists" → list); then
 * the name fuzzy against the types ("slidr"); then each form fuzzy against the aliases, so a
 * misspelled alias still lands ("quizz", "quizzes" → quiz → choice).
 */
function guessSlotType(bad: string, types: readonly string[]): string | null {
  const key = bad.toLowerCase().replace(/[\s_]+/g, '-');
  const forms = [key];
  if (key.length > 3 && key.endsWith('es')) forms.push(key.slice(0, -2));
  if (key.length > 2 && key.endsWith('s')) forms.push(key.slice(0, -1));
  const known = (t: string | undefined): t is string => !!t && types.includes(t);
  for (const f of forms) {
    if (known(f)) return f;
    const alias = own(SLOT_ALIASES, f);
    if (known(alias)) return alias;
  }
  const near = didYouMean(key, types);
  if (near) return near;
  for (const f of forms) {
    // A typo rarely hits the first letter, and a different one is usually another word (audio
    // vs radio); short words are within two edits of too many short aliases, so allow one there.
    const names = Object.keys(SLOT_ALIASES).filter((a) => a[0] === f[0]);
    const alias = own(SLOT_ALIASES, didYouMean(f, names, f.length <= 4 ? 1 : 2) ?? '');
    if (known(alias)) return alias;
  }
  return null;
}

function slotTypeHint(bad: string | undefined): string {
  const types = registeredTypes();
  const list = `Slot types are: ${types.join(', ')}.`;
  if (!bad) return list;
  const key = bad.toLowerCase().replace(/[\s_]+/g, '-');
  if (/^flash-?cards?$/.test(key)) {
    return `A flashcard is not a slot type: make a card with "verbs": {"flip": true}, the question in "slots" and the answer in "back". ${list}`;
  }
  const guess = guessSlotType(bad, types);
  return guess ? `Did you mean "${guess}"? ${list}` : list;
}

function slotPropsHint(type: string | undefined, message: string): string {
  const sig = type ? propsSignature(type) : '';
  const shape = sig ? `A ${type} slot's props: ${sig}.` : '';
  const specific: Array<[RegExp, string]> = [
    [/answer index/, 'answer lists 0-based option indexes: the first option is 0, so with 3 options the valid indexes are 0, 1 and 2.'],
    [/at least 2 items/, 'Give at least two options.'],
    [/same number of columns/, 'Give every row the same number of cells (pad short rows with "").'],
    [/scheme/, 'Use an https: link, or "" as a placeholder for the author to fill in.'],
    [/key is required/, 'Give the slider a variable name in "key", e.g. "rate".'],
    [/value must be a number/, '"value" is a number such as 5 (no quotes).'],
    [/style must be/, 'style is "bullets", "numbered" or "check".'],
    [/scope must be/, 'scope is "section", "chapter" or "notebook".'],
  ];
  const extra = specific.find(([re]) => re.test(message))?.[1];
  return [extra, shape].filter(Boolean).join(' ') || 'Check this slot\'s props against the slot catalog.';
}

const SLOT_VERBS_HINT =
  'Slot verbs are glow, emphasis, sequential, locked (true/false), reveal {"key": "a", "op": ">=", "val": 1} and hint {"content": "..."}.';
const CARD_VERBS_HINT = 'Card verbs are {"flip": true} (a flashcard with a "back" face) and {"bare": true} (no card frame).';

/** A fix hint for an issue, keyed by its code; null when the message says it all. */
export function hintFor(issue: HintedIssue): string | null {
  if (issue.hint) return issue.hint;
  const { code, path, subject, message } = issue;
  const last = /\.([\w$]+)$/.exec(path)?.[1] ?? '';
  switch (code) {
    case 'not-object':
      return 'The file must be one JSON object: {"version": 2, "notebook": {...}}.';
    case 'version-missing':
      return 'Add "version": 2 at the top level, next to "notebook" (a number, not a string).';
    case 'version-newer':
      return 'This file needs a newer NoteBuilder: update the app. If an AI wrote it, the only valid version is 2: set "version": 2.';
    case 'notebook-missing':
      return 'Wrap the content as {"version": 2, "notebook": {"name": "...", "sections": [...]}}.';
    case 'slot-type-unknown':
      return slotTypeHint(subject);
    case 'slot-type-missing':
      return `Every slot needs a "type". ${slotTypeHint(undefined)}`;
    case 'props-not-object': {
      const sig = subject ? propsSignature(subject) : '';
      return `Every slot needs "props": {...}; use {} when there is nothing to set.${sig ? ` A ${subject} slot's props: ${sig}.` : ''}`;
    }
    case 'slot-props':
      return slotPropsHint(subject, message);
    case 'cycle':
      return 'These formulas depend on each other in a loop, so none of them can be computed. Make one of them read only sliders or numbers: compute b from a, but not a from b.';
    case 'cross-card-read': {
      const v = subject ?? 'it';
      return `In NoteBuilder, variables never cross cards — add a slider/compute that writes ${v} in this card, or move this slot into the card that defines ${v}.`;
    }
    case 'card-width-range':
      return 'Card width w is in twelfths of the row, from 3 to 12: 12 is full width, 6 half, 4 a third. Or leave w out.';
    case 'section-width-range':
      return 'Section width is a positive number of pixels; leave it out to fill the page.';
    case 'fuse-width-range':
      return 'fuseW is a positive share of a fused row (1 and 2 split it 1:2); leave it out for equal shares.';
    case 'bad-verbs':
      return /\.(slots|back)\[\d+\]\.verbs/.test(path) ? SLOT_VERBS_HINT : CARD_VERBS_HINT;
    case 'bad-value':
      if (last === 'width') return 'Use "narrow", "medium" or "wide", or leave width out.';
      if (last === 'kind') return 'The only kind is "divider" (a chapter break with "cards": []); leave kind out for a normal section.';
      return null;
    case 'wrong-type':
      if (last === 'tags' || last === 'cats') return `${last} is a list of strings, e.g. ["idea", "practice"].`;
      if (['sections', 'cards', 'slots', 'back', 'svcOrder'].includes(last)) return `"${last}" must be a JSON array: [ ... ].`;
      if (['locked', 'archived'].includes(last)) return 'Use true or false (without quotes).';
      if (path === 'notebook.name') return 'Give the notebook a "name": "..." (a string).';
      return null;
    default:
      return null;
  }
}

/** Display parts of an issue: where (path, as given) and what (the message minus its path prefix). */
export function describeIssue(issue: Issue): { where: string; what: string } {
  const where = issue.path;
  if (issue.code === 'json-syntax') return { where, what: issue.message };
  let p = where.replace(/^notebook\.(?=sections)/, '');
  while (p) {
    if (issue.message.startsWith(p) && /^[\s:]/.test(issue.message.slice(p.length))) {
      return { where, what: issue.message.slice(p.length).replace(/^[\s:]+/, '') };
    }
    const parent = p.replace(/(\.[\w$-]+|\[\d+\])$/, '');
    if (parent === p) break;
    p = parent;
  }
  if (where.startsWith('notebook.') && issue.message.startsWith(where)) {
    return { where, what: issue.message.slice(where.length).replace(/^[\s:]+/, '') };
  }
  return { where, what: issue.message };
}

/** `notebook.sections[0].cards[1].slots[2].props` → `section 1 › card 2 › slot 3 › props`. */
export function humanPath(path: string): string {
  if (!path) return 'whole file';
  if (/^line \d+/.test(path)) return path;
  const parts: string[] = [];
  for (const m of path.matchAll(/([\w$-]+)(?:\[(\d+)\])?/g)) {
    const [, name, index] = m;
    if (name === 'notebook' && parts.length === 0 && path.startsWith('notebook.sections')) continue;
    const label = { sections: 'section', cards: 'card', slots: 'slot', back: 'back slot' }[name];
    if (label && index !== undefined) parts.push(`${label} ${Number(index) + 1}`);
    else parts.push(index !== undefined ? `${name} ${Number(index) + 1}` : name);
  }
  return parts.join(' › ');
}

// ---------------------------------------------------------------------------------------------
// Lints the app tolerates but an author should hear about (AI path only — never in json-io)
// ---------------------------------------------------------------------------------------------

/** Common LLM spellings of real fields, keyed by the wrong name. */
const FIELD_ALIASES: Record<string, string> = {
  question: 'q', prompt: 'q', choices: 'options', correct: 'answer', correctAnswer: 'answer', correct_answer: 'answer',
  correctIndex: 'answer', answerIndex: 'answer', formula: 'expr', expression: 'expr', output: 'out', variable: 'key',
  var: 'key', content: 'text', markdown: 'text', body: 'text', front: 'slots', cells: 'rows', data: 'rows',
  function: 'fn', caption: 'label', title: 'name',
};

function unknownField(key: string, allowed: string[], parent: string, defName: string): HintedIssue {
  const path = parent ? `${parent}.${key}` : key;
  const alias = own(FIELD_ALIASES, key);
  const guess = alias && allowed.includes(alias) ? alias : didYouMean(key, allowed);
  let hint = guess ? `Did you mean "${guess}"? ` : '';
  if (defName === 'card' && /^(title|heading|name|question|answer)$/.test(key)) {
    hint = 'Cards have no such field: put the content in a slot, e.g. a text slot "## Title" at the top of "slots" (and the answer in "back" for a flip card). ';
  }
  hint += `Fields allowed here: ${allowed.join(', ')}.`;
  return { code: 'unknown-field', path, message: `${path} is not a NoteBuilder field and will be ignored`, subject: key, hint };
}

function walkUnknown(value: unknown, node: JsonSchema, path: string, defName: string, out: HintedIssue[]): void {
  const refName = node.$ref ? /^#\/\$defs\/(.+)$/.exec(node.$ref)?.[1] : undefined;
  const n = resolveRef(node);
  const name = refName ?? defName;
  if (Array.isArray(value)) {
    if (n.items) value.forEach((v, k) => walkUnknown(v, n.items!, `${path}[${k}]`, name, out));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  const props = n.properties ?? {};
  // A matching if/then branch narrows a sub-schema — this is how slot props follow slot type.
  const narrowed: Record<string, JsonSchema> = {};
  for (const branch of n.allOf ?? []) {
    const cond = Object.entries(branch.if?.properties ?? {});
    if (cond.length && cond.every(([k, c]) => c.const !== undefined && obj[k] === c.const)) {
      Object.assign(narrowed, branch.then?.properties ?? {});
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    const sub = own(narrowed, k) ?? own(props, k);
    const at = path ? `${path}.${k}` : k;
    if (sub) walkUnknown(v, sub, at, name, out);
    else if (n.additionalProperties === false) out.push(unknownField(k, Object.keys(props), path, name));
    else if (n.additionalProperties && typeof n.additionalProperties === 'object') {
      walkUnknown(v, n.additionalProperties, at, name, out);
    }
  }
}

/** Fields the published schema does not define: the app ignores them silently, so say so. */
export function lintUnknownFields(json: unknown): HintedIssue[] {
  const out: HintedIssue[] = [];
  walkUnknown(json, NOTEBOOK_SCHEMA, '', '', out);
  return out;
}

/** LaTeX commands whose first letter forms a JSON escape (\f \b \t \r \n). */
const LATEX_AFTER_ESCAPE = new Set([
  'frac', 'forall', 'flat', 'frown',
  'beta', 'bar', 'binom', 'bf', 'big', 'bigcup', 'bigcap', 'bigl', 'bigr', 'boldsymbol', 'begin', 'bmod', 'bot', 'bullet', 'backslash', 'bmatrix', 'boxed',
  'theta', 'tau', 'times', 'text', 'textbf', 'textit', 'textrm', 'tan', 'tanh', 'tilde', 'to', 'top', 'triangle', 'tfrac', 'therefore', 'tag',
  'rho', 'right', 'rightarrow', 'rangle', 'rceil', 'rfloor', 'rbrace', 'rm',
  // not \ne or \ni: a line starting "e.g." or "i.e." would read as one
  'nu', 'neq', 'nabla', 'not', 'neg', 'newline', 'notin', 'nmid', 'nleq', 'ngeq', 'nolimits',
]);
const ESCAPE_LETTER: Record<string, string> = { '\f': 'f', '\b': 'b', '\t': 't', '\r': 'r', '\n': 'n' };

function walkStrings(value: unknown, path: string, visit: (s: string, path: string) => void): void {
  if (typeof value === 'string') visit(value, path);
  else if (Array.isArray(value)) value.forEach((v, k) => walkStrings(v, `${path}[${k}]`, visit));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkStrings(v, path ? `${path}.${k}` : k, visit);
  }
}

/**
 * A single backslash before f, b, t, r or n is a valid JSON escape, so "\frac" parses — as a
 * form feed + "rac" — and the math silently breaks. Flag every form feed / backspace (never
 * meant in notebook text) and any tab / CR / newline that, with its letters, spells a LaTeX
 * command inside a string that has math in it.
 */
export function lintLatexEscapes(json: unknown): HintedIssue[] {
  const out: HintedIssue[] = [];
  walkStrings(json, '', (s, path) => {
    const seen = new Set<string>();
    for (const m of s.matchAll(/[\f\b\t\r\n]([A-Za-z]*)/g)) {
      const letter = ESCAPE_LETTER[m[0][0]];
      const cmd = letter + m[1];
      const always = letter === 'f' || letter === 'b';
      if (!always && !(s.includes('$') && LATEX_AFTER_ESCAPE.has(cmd))) continue;
      if (seen.has(cmd)) continue;
      seen.add(cmd);
      out.push({
        code: 'latex-escape',
        path,
        message: `${path}: \\${cmd} lost its backslash (JSON read "\\${letter}" as an invisible control character)`,
        subject: cmd,
        hint: `In JSON write "\\\\${cmd}" with two backslashes. Ask the AI to double every backslash in LaTeX.`,
      });
    }
  });
  return out;
}

/** Formula-holding slot types and the prop with the formula. */
const EXPR_PROPS: Record<string, string> = { compute: 'expr', chart: 'fn' };
/** A minus at the start or after an operator / `(` / `,`, applied to a name or number that is then raised: `-x^2`. */
const UNARY_MINUS_POWER = /(?:^|[(,?:+\-*/%^=<>!&|])\s*-\s*([A-Za-z_]\w*|\d*\.?\d+)\s*\^/;

/**
 * Formulas that parse but compute something else than an author (or LLM) means: expr.ts binds a
 * leading minus tighter than ^ (-x^2 is (-x)^2, so exp(-x^2) explodes instead of a bell curve)
 * and has no ** operator (it silently yields a wrong number).
 */
export function lintExprPitfalls(json: unknown): HintedIssue[] {
  const out: HintedIssue[] = [];
  const sections = (json as { notebook?: { sections?: unknown } } | null)?.notebook?.sections;
  if (!Array.isArray(sections)) return out;
  sections.forEach((s, si) => {
    const cards = (s as { cards?: unknown } | null)?.cards;
    if (!Array.isArray(cards)) return;
    cards.forEach((c, ci) => {
      for (const face of ['slots', 'back'] as const) {
        const slots = (c as Record<string, unknown> | null)?.[face];
        if (!Array.isArray(slots)) continue;
        slots.forEach((slot, k) => {
          const { type, props } = (slot ?? {}) as { type?: unknown; props?: unknown };
          const prop = typeof type === 'string' ? own(EXPR_PROPS, type) : undefined;
          const src = prop && props && typeof props === 'object' ? (props as Record<string, unknown>)[prop] : undefined;
          if (!prop || typeof src !== 'string') return;
          const path = `notebook.sections[${si}].cards[${ci}].${face}[${k}].props.${prop}`;
          if (src.includes('**')) {
            out.push({
              code: 'expr-pitfall',
              path,
              subject: '**',
              message: `${path}: ** is not an operator in NoteBuilder formulas (the result is silently wrong)`,
              hint: 'Write powers with ^: x^2, not x**2.',
            });
          }
          const m = UNARY_MINUS_POWER.exec(src);
          if (m) {
            out.push({
              code: 'expr-pitfall',
              path,
              subject: `-${m[1]}^`,
              message: `${path}: "-${m[1]}^" raises (-${m[1]}) to the power, not ${m[1]}: a leading minus binds tighter than ^`,
              hint: 'Put the power in parentheses: -(x^2), e.g. exp(-(x^2)/2) for a bell curve.',
            });
          }
        });
      }
    });
  });
  return out;
}

/**
 * Everything the "From AI" check needs in one call: parse (fences and prose tolerated),
 * validate exactly as import does, then add the AI-path lints as warnings.
 */
export function checkNotebookText(text: string): CheckResult {
  const parsed = parseNotebookText(text);
  if ('syntax' in parsed) {
    return { ok: false, syntax: parsed.syntax, errors: [syntaxIssue(parsed.syntax)], warnings: [] };
  }
  const { errors, warnings } = validateNotebookIssues(parsed.json);
  const lints = errors.some((e) => ['not-object', 'notebook-missing'].includes(e.code))
    ? []
    : [...lintUnknownFields(parsed.json), ...lintLatexEscapes(parsed.json), ...lintExprPitfalls(parsed.json)];
  return { ok: errors.length === 0, json: parsed.json, errors, warnings: [...warnings, ...lints] };
}

export type NotebookSummary = {
  name: string;
  sections: number;
  chapters: number;
  cards: number;
  /** Cards holding a choice quiz. */
  quizzes: number;
  /** Flip cards. */
  flashcards: number;
  /** Cards with a slider (an interactive model). */
  interactive: number;
};

/** Counts for the "looks good" preview of a validated notebook document. */
export function notebookSummary(json: unknown): NotebookSummary {
  const nb = (json as { notebook?: { name?: unknown; sections?: unknown } } | null)?.notebook;
  const sections = Array.isArray(nb?.sections) ? (nb.sections as Array<Record<string, unknown>>) : [];
  const cards = sections
    .flatMap((s) => (Array.isArray(s?.cards) ? (s.cards as unknown[]) : []))
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object');
  const types = (c: Record<string, unknown>) =>
    [...(Array.isArray(c.slots) ? c.slots : []), ...(Array.isArray(c.back) ? c.back : [])].map(
      (s) => (s as { type?: unknown } | null)?.type,
    );
  return {
    name: typeof nb?.name === 'string' ? nb.name : '',
    sections: sections.filter((s) => s?.kind !== 'divider').length,
    chapters: sections.filter((s) => s?.kind === 'divider').length,
    cards: cards.length,
    quizzes: cards.filter((c) => types(c).includes('choice')).length,
    flashcards: cards.filter((c) => (c.verbs as { flip?: unknown } | undefined)?.flip === true).length,
    interactive: cards.filter((c) => types(c).includes('slider')).length,
  };
}

// ---------------------------------------------------------------------------------------------
// Fix request
// ---------------------------------------------------------------------------------------------

function numbered(issues: HintedIssue[]): string[] {
  return issues.map((issue, k) => {
    const { where, what } = describeIssue(issue);
    const hint = hintFor(issue);
    const head = `${k + 1}. ${where ? `${where}: ` : ''}${what}`;
    return hint ? `${head}\n   Fix: ${hint}` : head;
  });
}

/**
 * The message an author pastes back into their LLM: every problem with its location and fix,
 * then a strict instruction to return the whole corrected notebook as JSON only.
 */
export function buildFixRequest(errors: HintedIssue[], warnings: HintedIssue[] = []): string {
  const lines: string[] = [];
  if (errors.length) {
    lines.push('Your NoteBuilder JSON has these problems, so it cannot be imported:', '', ...numbered(errors), '');
  }
  if (warnings.length) {
    lines.push(
      errors.length
        ? 'It also has these warnings (it would load, but probably not as you meant):'
        : 'Your NoteBuilder JSON loads, but has these warnings (probably not what you meant):',
      '',
      ...numbered(warnings),
      '',
    );
  }
  if (!errors.length && !warnings.length) lines.push('Please double-check your NoteBuilder JSON against the format rules.', '');
  lines.push(
    'Fix every item above and keep everything else unchanged. Return the full corrected JSON only: one JSON object starting with {"version": 2, no explanations, no code fences.',
  );
  return lines.join('\n');
}
