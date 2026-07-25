# UI design system

Every visual constant in NoteBuilder v2 is a CSS custom property declared in one place:
the `:root` block at the top of [`v2/src/app.css`](../v2/src/app.css). This page describes the
token families, the rule that keeps them authoritative, the escape hatch when a value genuinely
cannot be a token, and the honest state of adoption today.

## Why tokens at all

NoteBuilder ships seven themes and a self-contained Reader file that a stranger opens on an
unknown machine. Three goals follow:

1. **A theme is a token swap, not a rewrite.** Switching from Dark to Sketch must change
   colours, corners and typeface without any component knowing a theme exists.
2. **The Reader looks like the app.** The Reader bundle compiles the same `app.css`, so
   anything a component hard codes is one more thing that can drift between authoring and
   sharing.
3. **Chrome stays on one grid.** v2 inherits v1's dense 2px rhythm. A stray `7px` is invisible
   in isolation and obvious once four panels sit side by side.

## Token families

All of these are declared once, in `:root` in `v2/src/app.css`.

| Family | Tokens | Values |
|---|---|---|
| Colour and surface | `--bg`, `--panel`, `--panel2`, `--ink`, `--muted`, `--line`, `--accent`, `--accent2`, `--good`, `--warn` | per theme |
| Shape | `--radius` | per theme (14px in the default) |
| Type family | `--font`, `--mono` | per theme; `--mono` defaults to a system mono stack |
| Elevation | `--glow` | per theme |
| Spacing | `--space-1` … `--space-6` | 2, 4, 6, 8, 10, 12px |
| Type roles | `--fs-2xs`, `--fs-xs`, `--fs-sm`, `--fs-md`, `--fs-lg` | 10, 11, 12, 13, 16px |
| Inner radii | `--radius-sm`, `--radius-md`, `--radius-lg` | 4, 6, 10px |
| Motion | `--t-quick`, `--t-base`, `--t-slow`, `--ease-out` | 0.12s, 0.15s, 0.35s, `cubic-bezier(0.2, 0.8, 0.2, 1)` |

The split in that table is the important part. The first four families are theme surface: every
theme redefines them. The last four are structure: they are declared exactly once, in `:root`,
and no theme block touches them. The inner radii exist precisely so that small chrome corners
stay put while the theme swapped `--radius` changes the shape of panels around them.

## Theming

The `:root` block is itself the default Dark theme. The six alternates are plain sibling
selectors of the form `body[data-theme="<id>"]` in the same file, and they redefine the same
ten colour and surface tokens plus `--radius`; five of them also swap `--glow` and `--font`.
The ids and their display names live in [`v2/src/lib/themes.ts`](../v2/src/lib/themes.ts):
`''` (Dark, the default), `plain` (Black and White, the light theme), `mono` (Graphite),
`study` (Tomoé), `sketch` (Sketch), `aurora` (Aurora), `cyber` (Cyberpunk).

Applying a theme is one line: `applyTheme` sets `document.body.dataset.theme`, or deletes the
attribute for the default. `normalizeThemeId` maps the legacy ids `dark` and `light` onto `''`
and `plain`, and falls back to `''` for anything unrecognised, so an old preference row or an
old shared file can never leave the UI unstyled.

Two themes animate. A `@media (prefers-reduced-motion: reduce)` block in `app.css` sets
`animation: none !important` on the animated `aurora` and `cyber` selectors, so the reduced
motion preference is honoured without disabling the theme.

## The governance rule

This is the rule as it stands in the ["Design tokens" section of `v2/README.md`](../v2/README.md),
quoted verbatim so the two documents cannot drift:

> Every dimension, font size, corner and duration in v2 comes from the `:root` token block in
> `src/app.css` — colours and surfaces, plus the spacing scale (`--space-1`…`--space-6`), type roles
> (`--fs-2xs`…`--fs-lg`), fixed inner-chrome radii (`--radius-sm/md/lg`, distinct from the
> theme-swapped `--radius`) and motion presets (`--t-quick/base/slow`, `--ease-out`). New UI uses those
> tokens; if the value you need has no token, extend the token block first rather than writing a
> literal. A literal that genuinely cannot be a token must carry a trailing
> `/* token-exempt: <reason> */` comment, and 1px hairlines and `0` are exempt by default.

In short: reach for a token, extend the token block if none fits, and only then write a
literal with a stated reason.

## The exemption convention

An exempt literal carries a trailing comment naming why it is not a token:

```css
padding-right: 26px; /* token-exempt: one-off gutter that clears the section controls */
```

It works in inline styles too, which is where most of them are:

```svelte
<span style="display:inline-flex;gap:3px; /* token-exempt: 3px sits off the 2px scale; snapping it would rewrap the chip rows */">
```

There are seventeen such comments in the tree today, and they cluster into three honest
reasons: values that sit off the 2px scale and would reflow if snapped (the `3px` chip and row
gaps), grid track floors that are not spacing at all (`minmax(80px, auto)`, `minmax(160px, …)`),
and one-off element sizes such as a native colour swatch or a numeric field width. `1px`
hairlines and `0` need no comment.

## Honest state of adoption

Tokens are enforced for new UI, not yet uniform across the whole tree.

**Components are tokenised.** Across `v2/src/lib/components/*.svelte` and
`v2/src/lib/slots/*.svelte` there are 88 `var(--space-*)` uses, 20 `var(--fs-*)` uses and 14
uses of the inner radii. Twenty nine of the forty four Svelte components carry their own scoped
`<style>` block, and that is where the token discipline is applied.

**`app.css` is not.** It is 2044 lines, most of it chrome ported wholesale from v1, and it
still writes those values as literals: zero `var(--space-*)`, zero `var(--fs-*)` and zero
`var(--radius-sm|md|lg)` uses appear in it. It does use the motion tokens in seven places, and
it uses the colour and surface tokens throughout, which is what makes the seven themes work at
all. The spacing, type and inner radius families are, for now, tokens that the ported
stylesheet does not yet consume.

That gap is a known follow-up, not a hidden one. The direction is one way: new work uses
tokens, and `app.css` rules get converted as they are touched. Nothing in the build enforces
this yet, so it rests on review.

Reproduce any count above with `grep` over `v2/src/app.css` and `v2/src/lib/**/*.svelte`.
