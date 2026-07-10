import katex from 'katex';
import type { Scope } from './variable-graph';

const PALETTE_KEYS = ['accent', 'accent2', 'good', 'warn', 'muted', 'ink'];

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** {{key}} interpolation — variable lookup only, no eval; missing key renders '?' */
export function interp(text: string, scope?: Scope): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) =>
    scope && scope[k] != null ? String(scope[k]) : '?'
  );
}

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode: display, trust: false });
  } catch {
    return '<span class="math-err">' + escapeHtml(tex) + '</span>';
  }
}

// Runs on already-escaped text; emits only our own tags around escaped content.
function applyMarks(t: string): string {
  return t
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/_([^_\n]+?)_/g, '<i>$1</i>')
    .replace(/~~([^~]+?)~~/g, '<s>$1</s>')
    .replace(/==([^=]+?)==/g, '<mark>$1</mark>')
    .replace(
      /\{c:([a-z0-9]+)\}([\s\S]+?)\{\/c\}/g,
      (_m, k: string, x: string) =>
        '<span style="color:var(--' + (PALETTE_KEYS.includes(k) ? k : 'ink') + ')">' + x + '</span>'
    )
    .replace(
      /\{bg:([a-z0-9]+)\}([\s\S]+?)\{\/bg\}/g,
      (_m, k: string, x: string) =>
        '<mark style="background:color-mix(in srgb,var(--' +
        (PALETTE_KEYS.includes(k) ? k : 'accent2') +
        ') 32%,transparent)">' +
        x +
        '</mark>'
    )
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, txt: string, url: string) => {
      const safe = /^(https?:|mailto:|#|\/)/i.test(url) ? url : '#';
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + txt + '</a>';
    });
}

// Math is stashed BEFORE escaping (KaTeX emits its own HTML); code AFTER (keeps escaped literals).
function mdInlineRaw(raw: string): string {
  const st: string[] = [];
  const keep = (h: string): string => {
    st.push(h);
    return '@@K' + (st.length - 1) + 'K@@';
  };
  let t = raw.replace(/\$(\S[^$\n]*?\S|\S)\$/g, (_m, x: string) => keep(renderMath(x.trim(), false)));
  t = escapeHtml(t).replace(/`([^`]+)`/g, (_m, x: string) => keep('<code>' + x + '</code>'));
  t = applyMarks(t).replace(/\n/g, '<br>');
  return t.replace(/@@K(\d+)K@@/g, (_m, i: string) => st[Number(i)]);
}

function mdBlockRaw(raw: string): string {
  const st: string[] = [];
  const keep = (h: string): string => {
    st.push(h);
    return '@@K' + (st.length - 1) + 'K@@';
  };
  let t = raw
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, x: string) => keep(renderMath(x.trim(), true)))
    .replace(/\$(\S[^$\n]*?\S|\S)\$/g, (_m, x: string) => keep(renderMath(x.trim(), false)));
  t = escapeHtml(t).replace(/`([^`]+)`/g, (_m, x: string) => keep('<code>' + x + '</code>'));

  const L = t.split('\n');
  let o = '';
  let lt: 'ul' | 'ol' | null = null;
  const cl = (): void => {
    if (lt) {
      o += '</' + lt + '>';
      lt = null;
    }
  };
  const isRow = (s: string): boolean => /^\s*\|.*\|\s*$/.test(s);
  const isSep = (s: string): boolean =>
    s.includes('-') && /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(s);
  const cells = (s: string): string[] =>
    s
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
  const alignOf = (s: string): string => {
    const l = s.startsWith(':'),
      r = s.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
  };

  for (let i = 0; i < L.length; i++) {
    const ln = L[i];
    let m: RegExpMatchArray | null;
    if (isRow(ln) && i + 1 < L.length && isSep(L[i + 1])) {
      cl();
      const head = cells(ln),
        al = cells(L[i + 1]).map(alignOf);
      let j = i + 2,
        body = '';
      while (j < L.length && isRow(L[j])) {
        const cs = cells(L[j]);
        body +=
          '<tr>' +
          head
            .map(
              (_, k) =>
                `<td${al[k] ? ` style="text-align:${al[k]}"` : ''}>` +
                applyMarks(cs[k] || '') +
                '</td>'
            )
            .join('') +
          '</tr>';
        j++;
      }
      o +=
        '<table class="md-table"><thead><tr>' +
        head
          .map(
            (h, k) => `<th${al[k] ? ` style="text-align:${al[k]}"` : ''}>` + applyMarks(h) + '</th>'
          )
          .join('') +
        '</tr></thead>' +
        (body ? `<tbody>${body}</tbody>` : '') +
        '</table>';
      i = j - 1;
      continue;
    }
    if ((m = ln.match(/^(#{1,3})\s+(.*)$/))) {
      cl();
      const lv = m[1].length + 1;
      o += '<h' + lv + '>' + applyMarks(m[2]) + '</h' + lv + '>';
    } else if ((m = ln.match(/^&gt;\s?(.*)$/))) {
      cl();
      o += '<blockquote>' + applyMarks(m[1]) + '</blockquote>';
    } else if ((m = ln.match(/^\s*[-*]\s+(.*)$/))) {
      if (lt !== 'ul') {
        cl();
        o += '<ul>';
        lt = 'ul';
      }
      o += '<li>' + applyMarks(m[1]) + '</li>';
    } else if ((m = ln.match(/^\s*\d+\.\s+(.*)$/))) {
      if (lt !== 'ol') {
        cl();
        o += '<ol>';
        lt = 'ol';
      }
      o += '<li>' + applyMarks(m[1]) + '</li>';
    } else {
      cl();
      if (ln.trim()) {
        const ind = (ln.match(/^ +/) || [''])[0];
        o += '<div>' + '&nbsp;'.repeat(ind.length) + applyMarks(ln.slice(ind.length)) + '</div>';
      } else o += '<br>';
    }
  }
  cl();
  return o.replace(/@@K(\d+)K@@/g, (_m, i: string) => st[Number(i)]);
}

export function renderInline(text: string, scope?: Scope): string {
  return mdInlineRaw(interp(text, scope));
}

export function renderMarkdown(text: string, scope: Scope = {}): string {
  return mdBlockRaw(interp(text, scope));
}
