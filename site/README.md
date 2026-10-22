# NoteBuilder site

The landing page published to GitHub Pages by `.github/workflows/pages.yml`.

- `index.html`: the whole page (no build step; fonts from Google Fonts, everything else inline).
- `build-demo.mjs`: writes `demo/*.html`, the live lessons the page embeds. Each is an example
  notebook from `docs/examples/` injected into the committed Reader template, the same way Share
  does it. `demo/` is generated, so it is git-ignored.

Preview locally from the repository root:

```sh
node site/build-demo.mjs
python3 -m http.server -d site 8000   # then open http://localhost:8000
```

The "Download for macOS" button points at the latest GitHub Release, so attach the DMG to a
release for it to work.
