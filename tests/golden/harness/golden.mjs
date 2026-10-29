// Golden snapshot harness: runs the prototype's own engine (sliced out of prototype.html) on
// pdf.js 3.11.174, the version the prototype loads from its CDN, and writes what it produces for
// each fixture PDF. Dev-only; see ../README.md. Run with `npm run golden` from the repo root.
//
// Usage: node golden.mjs [file.pdf ...]   (default: every tests/fixtures/*.pdf plus the Example Document)
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const snapDir = join(here, "..", "snapshots");
const PDFJS_VERSION = "3.11.174";

// The settings each fixture is snapshotted under. Column Spacing 1.0 is the default; 0.5 and 2.0
// sit either side of it within the slider's range (0.4-2.6).
const COLUMN_SPACINGS = [1, 0.5, 2];
const JOINING = [true, false];
// Fixtures too big to keep in full: snapshotted at the default Column Spacing only, and with each
// export stored as its SHA-256 digest ("exportDigests") instead of the text ("exports").
const LARGE = new Set(["perf-200-pages"]);
const SECTION_MODES = ["column", "rows"];
const FORMATS = ["csv", "tsv", "md", "json"];

// pdf.js 3.11 prints its warnings (no canvas, no standardFontDataUrl) with console.log.
const log = console.log;
console.log = () => {};
const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
if (pdfjs.version !== PDFJS_VERSION)
  throw new Error(`expected pdfjs-dist ${PDFJS_VERSION}, got ${pdfjs.version}`);

// Slice the engine out of the prototype by its section comments. Both regions hold only
// declarations; their DOM references sit inside function bodies the harness never calls.
const html = readFileSync(join(here, "prototype.html"), "utf8");
const between = (a, b) => {
  const i = html.indexOf(a);
  const j = html.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`marker missing in prototype.html: ${a} / ${b}`);
  return html.slice(i, j);
};
const engineSrc =
  between("/* ---------- Table detection ---------- */", "/* ---------- Export ---------- */") +
  between("/* ---------- Export ---------- */", "function toggleSection");

const ctx = vm.createContext({ console, pdfjs, Set, Map });
vm.runInContext(
  `
  const state = { files: [], sel: null, gap: 1, view: "table", format: "csv", sectionMode: "column", join: true, region: null };
  let uid = 0;
  function render(){} function hud(){}
  ${engineSrc}
  globalThis.api = { state, addFile, detectFile, exportText };
`,
  ctx,
  { filename: "prototype-engine.js" },
);
const { api } = ctx;

const args = process.argv.slice(2);
const fixtureDir = join(root, "tests", "fixtures");
const inputs = args.length
  ? args
  : [
      join(root, "public", "example-document.pdf"),
      ...readdirSync(fixtureDir)
        .filter((f) => f.endsWith(".pdf"))
        .sort()
        .map((f) => join(fixtureDir, f)),
    ];

mkdirSync(snapDir, { recursive: true });
const summary = [];
for (const path of inputs) {
  const name = basename(path, ".pdf");
  const bytes = readFileSync(path);
  api.state.files.length = 0;
  api.state.sel = null;
  api.state.gap = 1;
  api.state.join = true;
  // The prototype's own loading path: item extraction, bold, the US-14 split and error messages.
  await api.addFile(basename(path), new Uint8Array(bytes), bytes.length);
  const f = api.state.files[0];

  const runs = [];
  for (const columnSpacing of LARGE.has(name) ? [1] : COLUMN_SPACINGS) {
    for (const joining of JOINING) {
      // The same re-detection the Column Spacing slider and the join switch trigger.
      api.state.gap = columnSpacing;
      api.state.join = joining;
      if (f.status === "ready") api.detectFile(f);
      runs.push({
        columnSpacing,
        joining,
        tables: f.status === "ready" ? f.tables.map((t) => snapTable(t, LARGE.has(name))) : [],
      });
    }
  }

  const snapshot = {
    fixture: relative(root, path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    pdfjs: PDFJS_VERSION,
    status: f.status,
    error: f.error,
    pages: f.pages.map((p) => ({
      num: p.num,
      w: p.w,
      h: p.h,
      items: p.items.map((it) => ({ str: it.str, x: it.x, y: it.y, w: it.w, h: it.h, bold: it.b })),
    })),
    runs,
  };
  writeFileSync(join(snapDir, `${name}.json`), format(snapshot) + "\n");
  summary.push(
    `${name}: ${f.status}${f.error ? ` (${f.error})` : ""}, ${runs.map((r) => r.tables.length).join("/")} tables`,
  );
  try {
    if (f.pdf) await f.pdf.destroy();
  } catch {
    // already gone
  }
}

function snapTable(t, digestsOnly) {
  const exports = {};
  for (const mode of SECTION_MODES) {
    api.state.sectionMode = mode;
    exports[mode] = Object.fromEntries(
      FORMATS.map((fmt) => {
        const text = api.exportText(t, fmt);
        return [fmt, digestsOnly ? createHash("sha256").update(text, "utf8").digest("hex") : text];
      }),
    );
  }
  api.state.sectionMode = "column";
  return {
    n: t.n,
    pages: t.parts.map((p) => p.page),
    parts: t.parts.map((p) => ({ page: p.page, bbox: p.bbox })),
    header: t.header,
    firstBold: t.firstBold,
    grid: t.grid,
    sections: t.sections,
    cols: t.cols,
    repeats: t.repeats ?? 0,
    [digestsOnly ? "exportDigests" : "exports"]: exports,
  };
}

// JSON with every value that fits in 120 characters on one line (a text item, a grid row, a bbox),
// so snapshot diffs read line by line. JSON.parse reads it like any other JSON.
function format(v, indent = "") {
  const flat = JSON.stringify(v);
  if (v === null || typeof v !== "object" || flat.length <= 120) return flat;
  const inner = indent + "  ";
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return `[\n${v.map((x) => inner + format(x, inner)).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(v);
  return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${format(x, inner)}`).join(",\n")}\n${indent}}`;
}

console.log = log;
console.log(`Snapshots written to ${relative(root, snapDir)}/ (pdf.js ${PDFJS_VERSION})`);
for (const s of summary) console.log(`  ${s}`);
