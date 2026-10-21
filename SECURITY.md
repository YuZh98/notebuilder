# Security Policy

## Reporting a vulnerability

Open a **private security advisory** on this repository (Security → Report a vulnerability).
Please do not file public issues for vulnerabilities. We aim to acknowledge within a few days.

## Threat model

NoteBuilder is local-first: there is no server and no account. The only runtime network requests
are theme webfonts and remote images a notebook may embed. The
desktop app (`v2/`) persists to a local SQLite database; the legacy web prototype (repository root)
persists to `localStorage`. The main attack surface in both is **rendering untrusted notebook
content** — an imported JSON file or a shared Reader `.html` may contain attacker-authored text and
formulas.

Mitigations in the code:

- **No `eval` / `new Function` on user content.** Formulas run through a small custom expression
  evaluator (`v2/src/lib/expr.ts`; `EXPR` in the prototype) that resolves identifiers from own
  scope keys only — never prototype properties.
- **Escape-first rendering.** All user text is HTML-escaped before markdown/KaTeX markup is applied
  and before it reaches any `{@html}` / `innerHTML` sink (`v2/src/lib/markdown.ts`).
- **No remote code.** KaTeX is bundled at build time; rendered markdown links carry
  `rel="noopener noreferrer"`. Notebook images may load from remote URLs, but nothing remote
  executes.
- **Parameterized SQL** for all database access; ids are sanitized on import.
- **Slim export.** A shared file embeds only the exported notebook — never other notebooks, the
  card-type library, or the reader's local state.
