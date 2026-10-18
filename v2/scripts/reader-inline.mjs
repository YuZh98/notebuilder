// @ts-check
// Pure string helpers for build-reader.mjs. No Node APIs, so src tests can import and pin them.

/** An absolute remote target: http(s) or protocol-relative. */
const REMOTE = String.raw`(?:https?:)?//`;

// `@import url("…")`, `@import url('…')`, `@import url(…)`, `@import "…"` or `@import '…'` aimed at
// a remote target, plus any trailing media / supports / layer list, through its `;` (or sheet end).
const REMOTE_IMPORT_RE = new RegExp(
  String.raw`@import\s*(?:url\(\s*(?:"${REMOTE}[^"]*"|'${REMOTE}[^']*'|${REMOTE}[^"')\s]*)\s*\)` +
    String.raw`|"${REMOTE}[^"]*"|'${REMOTE}[^']*')[^;{}]*(?:;|$)`,
  'gi',
);

/**
 * Drop every `@import` of a remote stylesheet (e.g. the authoring app's Google Fonts import). The
 * shared file must make no network request: a student's IP must not reach a third party just by
 * opening it, and offline it would only log an error. Font stacks fall back to system fonts.
 * @param {string} css
 * @returns {{ css: string, removed: string[] }}
 */
export function stripRemoteImports(css) {
  /** @type {string[]} */
  const removed = [];
  const out = css.replace(REMOTE_IMPORT_RE, (rule) => {
    removed.push(rule.trim());
    return '';
  });
  return { css: out, removed };
}

/**
 * Every reference in the final HTML that would still hit the network (or the file system), as
 * readable offender strings; empty when the page is self-contained. Script bodies are blanked
 * first so JS string literals (e.g. `src="…"` inside code) never trip the scan; stylesheets are
 * scanned in full — url(), any `@import` target, and any absolute http(s) URL left in a <style>.
 * @param {string} html
 * @returns {string[]}
 */
export function externalRefs(html) {
  const scan = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
  /** @type {string[]} */
  const offenders = [];
  /** @param {string} v */
  const external = (v) => !!v && !v.startsWith('data:') && !v.startsWith('#');

  for (const m of scan.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi)) {
    if (external(m[2].trim())) offenders.push(`url(${m[2].trim()})`);
  }
  for (const m of scan.matchAll(/\bsrc=(["'])([^"']*)\1/gi)) {
    if (m[2].trim() && !m[2].trim().startsWith('data:')) offenders.push(`src=${m[2]}`);
  }
  for (const m of scan.matchAll(/\bhref=(["'])([^"']*)\1/gi)) {
    if (external(m[2].trim())) offenders.push(`href=${m[2]}`);
  }

  for (const m of scan.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    // Comments and inlined data: URIs (base64 fonts) can hold anything; neither is a fetch.
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\(\s*(["']?)data:[^)]*\)/gi, 'url(data:)');
    // A stylesheet import is a fetch whatever its form (minifiers emit `@import"…"`, no url()).
    for (const imp of css.matchAll(/@import\s*(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s;]*))/gi)) {
      const target = (imp[1] ?? imp[2] ?? imp[3] ?? '').trim().replace(/\)$/, '');
      if (!target.startsWith('data:')) offenders.push(`@import ${target || '(unparsed)'}`);
    }
    for (const abs of css.matchAll(/\bhttps?:\/\/[^\s"')]+/gi)) {
      if (!offenders.some((o) => o.includes(abs[0]))) offenders.push(`css ${abs[0]}`);
    }
  }
  return offenders;
}
