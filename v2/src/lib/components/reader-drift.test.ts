/**
 * Reader drift guard — source-level parity test.
 *
 * Parses the <CardView ...> prop list out of App.svelte and Reader.svelte,
 * asserts the key sets match (with an explicit allow-list for reader-only props).
 * If a prop is added to one and not the other, this test fails.
 *
 * Precedent: scratch/compare-themes.mjs (source-level comparison).
 */
import { describe, it, expect } from 'vitest';
import appSrc from '../../App.svelte?raw';
import readerSrc from './Reader.svelte?raw';

/** Extract prop keys from the first <CardView ...> block in a source file. */
function extractCardViewProps(src: string): string[] {
  // Find the <CardView block — starts at `<CardView` and ends at `/>`
  const start = src.indexOf('<CardView');
  if (start < 0) throw new Error('No <CardView found');
  const end = src.indexOf('/>', start);
  if (end < 0) throw new Error('No /> closing <CardView found');
  const block = src.slice(start, end);

  const props: string[] = [];
  // Match shorthand props like {card} {editable}
  for (const m of block.matchAll(/\{(\w+)\}/g)) {
    // Exclude inline expressions like {card.id} or {$mode === ...}
    if (!m[1].includes('.') && !m[1].startsWith('$')) {
      props.push(m[1]);
    }
  }
  // Match named props like selected={...} or ondelete={() => ...}
  for (const m of block.matchAll(/^\s+(\w+)[={]/gm)) {
    props.push(m[1]);
  }
  return [...new Set(props)].sort();
}

// Reader-only props that are allowed to differ (e.g. props only the Reader needs).
const READER_ONLY_ALLOW: string[] = [];
const APP_ONLY_ALLOW: string[] = [];

describe('Reader drift guard', () => {
  const appProps = extractCardViewProps(appSrc);
  const readerProps = extractCardViewProps(readerSrc);

  it('App and Reader pass the same CardView prop keys', () => {
    const appOnly = appProps.filter((p) => !readerProps.includes(p) && !APP_ONLY_ALLOW.includes(p));
    const readerOnly = readerProps.filter((p) => !appProps.includes(p) && !READER_ONLY_ALLOW.includes(p));

    if (appOnly.length > 0 || readerOnly.length > 0) {
      const msg = [
        appOnly.length > 0 ? `App-only (missing from Reader): ${appOnly.join(', ')}` : '',
        readerOnly.length > 0 ? `Reader-only (missing from App): ${readerOnly.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      expect.fail(`CardView prop drift detected:\n${msg}`);
    }
  });

  // A partial parse would shrink BOTH lists symmetrically and still compare equal, so the guard
  // above must not be trusted without proof that extraction actually found the prop set.
  it('extraction finds a real prop set in both files', () => {
    for (const [name, props] of [
      ['App', appProps],
      ['Reader', readerProps],
    ] as const) {
      expect(props.length, `${name}: too few props — extraction likely truncated`).toBeGreaterThan(10);
      expect(props, `${name}: missing a known prop — extraction likely truncated`).toContain('card');
      expect(props, `${name}: missing a known prop — extraction likely truncated`).toContain(
        'onupdateslot',
      );
    }
  });
});
