# Security Policy

## Reporting a vulnerability

Open a private security advisory on this repository, or email the maintainers. Please do not file public
issues for vulnerabilities. We aim to acknowledge within a few days.

## Threat model

NoteBuilder is a client-only app: it runs entirely in the browser and persists to `localStorage`. There
is no server, account, or network call. The main surface is **rendering untrusted notebook content** (a
shared `.html` file or imported JSON may contain attacker-authored text and formulas).

Mitigations in the code:

- **No `eval` / `Function` on user content.** Formulas run through a small custom expression evaluator
  (`EXPR`) that resolves own-keys only — never prototype properties.
- **Escape-first rendering.** All user text passes through `esc` / `md` (which escapes before inserting
  HTML) before reaching `innerHTML`.
- **No remote code.** KaTeX is vendored and inlined, so the shipped bundle makes no network requests.
  (A CDN fallback path exists in the source for the unbundled dev case; it is dead code once the build
  inlines KaTeX.) Markdown links render with `rel="noopener noreferrer"`, and image syntax is not
  supported — so notebook content cannot pull in remote assets.

A shared file embeds only the exported notebook — not your other notebooks or your product library.
