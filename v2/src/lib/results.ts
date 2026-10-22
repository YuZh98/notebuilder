/**
 * Results export (D1d): a student's own summary of a shared notebook, to download or paste to the
 * teacher. Built from the reader/progress layer on demand and handed to the student — nothing is
 * sent anywhere. Progress mirrors the in-app progress bar; grading asks each slot type's optional
 * `score()` hook, so slot types added later are counted without touching this file.
 */
import { computeProgress } from './progress';
import { getSlot } from './slots/registry';
import type { SlotScore } from './slot-contract';
import type { ReaderStateMap } from './db';
import type { Notebook } from './types';

/** Questions, one per graded slot: every field counts questions, never tries. */
export type GradeTally = {
  correct: number;
  answered: number;
  /** Slots with an answer key, answered or not. */
  items: number;
};

/** Repeatable practice (problem slots): correct answers and tries, summed over every slot. */
export type PracticeTally = { correct: number; attempts: number };

export type Results = {
  /** Notebook name. */
  notebook: string;
  docId: string;
  generatedAt: string;
  student?: string;
  overall: { done: number; total: number; pct: number };
  perSection: { name: string; title?: string; done: number; total: number }[];
  graded: GradeTally;
  /** Present when some slot can be practised (even untried); absent otherwise. */
  practice?: PracticeTally;
  byType: Record<string, GradeTally>;
};

const tally = (): GradeTally => ({ correct: 0, answered: 0, items: 0 });
const count = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const unit = (n: unknown): n is 0 | 1 => n === 0 || n === 1;

/**
 * One question, or null for a result outside the contract. A score() that returns counts (or a
 * correct-but-unanswered verdict) is dropped rather than summed: adding tries to answers is what
 * once printed "5 of 9 answered correct · 3 questions".
 */
function question(r: SlotScore | null): SlotScore | null {
  if (!r || !unit(r.correct) || !unit(r.answered) || r.correct > r.answered) return null;
  return r;
}

export function buildResults(
  notebook: Notebook,
  readerState: ReaderStateMap,
  opts: { docId: string; student?: string; now: Date },
): Results {
  const cardSections = notebook.sections.filter((s) => s.kind !== 'divider');
  const perSection: Results['perSection'] = [];
  for (const s of cardSections) {
    const { done, total } = computeProgress(s.cards, readerState);
    if (total === 0) continue;
    const title = s.title?.trim();
    perSection.push({ name: s.name, ...(title ? { title } : {}), done, total });
  }

  // Grading spans every card, archived ones included: archiving tidies the study view, it
  // doesn't withdraw an answer the student already gave.
  const graded = tally();
  const byType: Record<string, GradeTally> = {};
  let practice: PracticeTally | undefined;
  for (const card of cardSections.flatMap((s) => s.cards)) {
    for (const slot of [...card.slots, ...(card.back ?? [])]) {
      const type = getSlot(slot.type);
      if (!type?.score) continue;
      let r: SlotScore | null;
      try {
        r = question(type.score(slot.props, readerState[card.id]?.[slot.id]));
      } catch {
        continue;
      }
      if (!r) continue;
      const t = (byType[slot.type] ??= tally());
      for (const into of [t, graded]) {
        into.correct += r.correct;
        into.answered += r.answered;
        into.items += 1;
      }
      const p = r.practice;
      if (p && count(p.correct) && count(p.attempts)) {
        practice ??= { correct: 0, attempts: 0 };
        practice.correct += p.correct;
        practice.attempts += p.attempts;
      }
    }
  }

  const student = opts.student?.trim();
  return {
    notebook: notebook.name,
    docId: opts.docId,
    generatedAt: opts.now.toISOString(),
    ...(student ? { student } : {}),
    overall: computeProgress(cardSections.flatMap((s) => s.cards), readerState),
    perSection,
    graded,
    ...(practice ? { practice } : {}),
    byType,
  };
}

const pct = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) : 0);

function gradeLine(t: GradeTally): string {
  return `${t.correct} of ${t.answered} answered correct${t.answered > 0 ? ` (${pct(t.correct, t.answered)}%)` : ''}`;
}

/** "3 correct in 7 tries" — the practice summary, or null when nothing has been tried yet. */
export function practiceLine(p: PracticeTally | undefined): string | null {
  if (!p || p.attempts === 0) return null;
  return `${p.correct} correct in ${p.attempts} ${p.attempts === 1 ? 'try' : 'tries'}`;
}

/** Plain text for copy/paste — no markup, one fact per line. */
export function formatResultsText(r: Results): string {
  const lines = [`NoteBuilder results — ${r.notebook}`];
  if (r.student) lines.push(`Student: ${r.student}`);
  lines.push(`Date: ${r.generatedAt}`);
  lines.push(`Progress: ${r.overall.done} of ${r.overall.total} cards done (${r.overall.pct}%)`);
  lines.push(
    r.graded.items === 0
      ? 'Graded: no auto-graded questions'
      : `Graded: ${gradeLine(r.graded)} · ${r.graded.items} question${r.graded.items === 1 ? '' : 's'}`,
  );
  const practised = practiceLine(r.practice);
  if (practised) lines.push(`Practice: ${practised}`);
  if (r.perSection.length > 0) {
    lines.push('', 'Sections:');
    for (const s of r.perSection) lines.push(`  ${s.title ?? s.name}: ${s.done}/${s.total}`);
  }
  const types = Object.entries(r.byType);
  if (types.length > 0) {
    lines.push('', 'By question type:');
    for (const [type, t] of types) lines.push(`  ${type}: ${gradeLine(t)}`);
  }
  lines.push('', `Notebook id: ${r.docId}`);
  return lines.join('\n');
}
