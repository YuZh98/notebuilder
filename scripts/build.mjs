// Bundle the modular source into a single, runnable, shippable index.html.
// Order: "use strict" preamble → vendored KaTeX → app layers (by numeric prefix).
// The output is the product: one self-contained file (the share/export path inlines it further).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const layers = readdirSync(join(ROOT, "src/app"))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => parseInt(a) - parseInt(b));

const preamble = layers[0]; // 00-preamble.js → "use strict"
const rest = layers.slice(1);
// Escape any closing-script-tag sequence so a stray occurrence in source (a string, a comment)
// can't terminate the inlined <script id="app"> block early and void the whole bundle.
const app = [
  read(`src/app/${preamble}`).trim(),
  read("src/vendor/katex.js").trim(),
  ...rest.map((f) => read(`src/app/${f}`).trim()),
]
  .join("\n\n")
  .replace(/<\/script/gi, "<\\/script");

const css = read("src/styles.css").trim();
const html = read("index.template.html")
  .replace("/*{{STYLES}}*/", () => css)
  .replace("/*{{APP}}*/", () => app);

writeFileSync(join(ROOT, "index.html"), html);
console.log(
  `built index.html — ${(html.length / 1024) | 0} KB · ${layers.length} layers (${rest.join(", ")})`,
);
