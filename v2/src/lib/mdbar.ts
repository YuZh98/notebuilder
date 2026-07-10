export const SYMBOLS = ['α','β','γ','δ','ε','θ','λ','μ','π','ρ','σ','φ','ω','Σ','Π','∑','∫','√','∞','≤','≥','≠','≈','±','×','÷','→','∈','∉','∀','∃','¬','ℝ','ℕ','ℤ','𝔼','😀','🔥','✅','⭐','📌','💡','❓','📘','🎯','⚠️'];

export type MdKey = 'b' | 'i' | 'code' | 'hl' | 'h' | 'ul' | 'math' | 'mathb';

export const MD_BUTTONS: ReadonlyArray<readonly [MdKey, string]> = [
  ['b', '𝐁'],
  ['i', '𝑰'],
  ['code', '‹›'],
  ['hl', '▣'],
  ['h', 'H'],
  ['ul', '•'],
  ['math', '∑'],
  ['mathb', '∬'],
];

export const COLOR_KEYS = ['accent', 'accent2', 'good', 'warn', 'muted'];

function emitInput(ta: HTMLTextAreaElement): void {
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

export function taWrap(ta: HTMLTextAreaElement, pre: string, post: string, ph = ''): void {
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const v = ta.value;
  const sel = v.slice(s, e) || ph;
  ta.value = v.slice(0, s) + pre + sel + post + v.slice(e);
  ta.focus();
  ta.selectionStart = s + pre.length;
  ta.selectionEnd = s + pre.length + sel.length;
  emitInput(ta);
}

export function taPre(ta: HTMLTextAreaElement, pre: string): void {
  const s = ta.selectionStart;
  const v = ta.value;
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  ta.value = v.slice(0, ls) + pre + v.slice(ls);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + pre.length;
  emitInput(ta);
}

export function taIns(ta: HTMLTextAreaElement, t: string): void {
  const s = ta.selectionStart;
  const v = ta.value;
  ta.value = v.slice(0, s) + t + v.slice(ta.selectionEnd);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + t.length;
  emitInput(ta);
}

const MD_ACTIONS: Record<MdKey, (ta: HTMLTextAreaElement) => void> = {
  b: (ta) => taWrap(ta, '**', '**', 'bold'),
  i: (ta) => taWrap(ta, '*', '*', 'italic'),
  code: (ta) => taWrap(ta, '`', '`', 'code'),
  hl: (ta) => taWrap(ta, '==', '==', 'mark'),
  h: (ta) => taPre(ta, '## '),
  ul: (ta) => taPre(ta, '- '),
  math: (ta) => taWrap(ta, '$', '$', 'x'),
  mathb: (ta) => taWrap(ta, '\n$$\n', '\n$$\n', 'x^2'),
};

export function doMd(ta: HTMLTextAreaElement, key: MdKey): void {
  MD_ACTIONS[key](ta);
}
