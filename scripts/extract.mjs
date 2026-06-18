// One-time migration: split the prototype's single index.html into modular source.
// Produces src/styles.css, src/vendor/katex.js, src/app/NN-*.js, and index.template.html.
// The reverse (scripts/build.mjs) concatenates them back into a single runnable index.html.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SRC = process.argv[2];
const OUT = process.argv[3];
const html = readFileSync(SRC, "utf8");

const write = (p, s) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, s);
  console.log("wrote", p, s.length, "bytes");
};

// 1. styles
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
write(`${OUT}/src/styles.css`, css.replace(/^\n/, "") + "\n");

// 2. app script
let app = html.match(/<script id="app">([\s\S]*?)<\/script>/)[1];

// 3. pull the vendored KaTeX bundle out (a base64 blob nobody edits)
const katex = app.match(
  /\/\*KATEX_BUNDLE_START\*\/[\s\S]*?\/\*KATEX_BUNDLE_END\*\//,
)[0];
write(`${OUT}/src/vendor/katex.js`, katex + "\n");
app = app.replace(katex, "").replace(/\n{3,}/g, "\n\n");

// 4. split the rest at the top-level section banners
const slug = (t) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
const parts = app.split(/(?=\/\* ={6,})/);
let n = 0;
const names = [];
for (const part of parts) {
  const body = part.trim();
  if (!body) continue;
  const m = body.match(/^\/\* ={6,}\s*(.*?)\s*={6,} \*\//);
  const name = m ? slug(m[1]) : "preamble";
  const file = `${String(n).padStart(2, "0")}-${name}.js`;
  write(`${OUT}/src/app/${file}`, body + "\n");
  names.push(file);
  n += 10;
}

// 5. template: replace style + script bodies with placeholders
const template = html
  .replace(/<style>[\s\S]*?<\/style>/, "<style>/*{{STYLES}}*/</style>")
  .replace(
    /<script id="app">[\s\S]*?<\/script>/,
    '<script id="app">/*{{APP}}*/</script>',
  )
  .replace(/Learning Spaces — prototype/g, "NoteBuilder");
write(`${OUT}/index.template.html`, template);

write(
  `${OUT}/scripts/.manifest.json`,
  JSON.stringify({ appOrder: names }, null, 2) + "\n",
);
console.log("\nfragments:", names.join(", "));
