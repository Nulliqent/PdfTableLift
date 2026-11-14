// Writes golden snapshots from the app's own engine, for fixtures the prototype gets wrong
// (spec #22: `statement`; spec #30: `statement-sections`, `statement-first-column`; spec #39: `parts-list-drawing`). Same format
// and settings matrix as harness/golden.mjs, but the text items come from the app's PDF Reader and the Tables from the
// workspace reducer and export.
// These snapshots are NOT from the prototype; see README.md. Run with `npm run golden:engine`,
// after `npm run golden`.
//
// It also rewrites the `runs` of the snapshots in RUNS_FROM_ENGINE (spec #22, #25:
// `wrapped-cells`, where F-103 wraps two Cells at once and the prototype makes an extra Row). Their
// text items, `pdfjs` and every other field stay the prototype's; only the Tables are the app's.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  exportTable,
  initialWorkspace,
  reduce,
  type PageText,
  type Table,
  type WorkspaceAction,
} from "../../src/engine";
import { version as pdfjsVersion } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readDocument } from "../unit/support/node-reader";

const root = join(import.meta.dirname, "..", "..");
const snapDir = join(import.meta.dirname, "snapshots");
/** Fixtures snapshotted from the app's engine (harness/golden.mjs leaves these out). */
const FROM_ENGINE = [
  "statement",
  "statement-sections",
  "statement-first-column",
  "parts-list-drawing",
];
/** Prototype snapshots whose Tables (`runs`) come from the app's engine; harness/golden.mjs keeps them. */
const RUNS_FROM_ENGINE = ["wrapped-cells"];
const COLUMN_SPACINGS = [1, 0.5, 2];
const JOINING = [true, false];
const SECTION_MODES = ["column", "rows"] as const;
const FORMATS = ["csv", "tsv", "md", "json"] as const;

/** The same re-detection golden.test.ts runs: open the Document, then set joining and spacing. */
function detect(pages: PageText[], joining: boolean, columnSpacing: number): Table[] {
  const actions: WorkspaceAction[] = [
    { type: "documentAdded", id: "golden", name: "golden.pdf", size: 0 },
    { type: "documentRead", id: "golden", pages },
    { type: "joinChanged", value: joining },
    { type: "columnSpacingChanged", value: columnSpacing },
  ];
  return actions.reduce(reduce, initialWorkspace).documents[0]!.tables;
}

const snapTable = (t: Table) => ({
  n: t.n,
  pages: t.parts.map((p) => p.page),
  parts: t.parts.map((p) => ({ page: p.page, bbox: p.bbox })),
  header: t.header,
  firstBold: t.firstBold,
  grid: t.grid,
  sections: t.sections,
  cols: t.cols,
  repeats: t.repeats,
  exports: Object.fromEntries(
    SECTION_MODES.map((mode) => [
      mode,
      Object.fromEntries(FORMATS.map((f) => [f, exportTable(t, f, mode)])),
    ]),
  ),
});

// The same layout as harness/golden.mjs: values of 120 characters or fewer on one line.
function format(v: unknown, indent = ""): string {
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

for (const name of FROM_ENGINE) {
  const fixture = `tests/fixtures/${name}.pdf`;
  const bytes = readFileSync(join(root, fixture));
  const pages = await readDocument(new Uint8Array(bytes));
  if (typeof pages === "string") throw new Error(`${fixture}: the PDF Reader returned ${pages}`);
  const runs = COLUMN_SPACINGS.flatMap((columnSpacing) =>
    JOINING.map((joining) => ({
      columnSpacing,
      joining,
      tables: detect(pages, joining, columnSpacing).map(snapTable),
    })),
  );
  const snapshot = {
    fixture,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    pdfjs: pdfjsVersion,
    // Not from the prototype: the app's own engine wrote this snapshot.
    engine: "app",
    status: "ready",
    error: "",
    pages,
    runs,
  };
  writeFileSync(join(snapDir, `${name}.json`), format(snapshot) + "\n");
  console.log(`${name}: ${runs.map((r) => r.tables.length).join("/")} tables (app engine)`);
}

for (const name of RUNS_FROM_ENGINE) {
  const path = join(snapDir, `${name}.json`);
  const snapshot = JSON.parse(readFileSync(path, "utf8")) as { pages: PageText[]; runs: unknown };
  // The prototype's own text items, which golden.test.ts checks the app's PDF Reader reproduces.
  const runs = COLUMN_SPACINGS.flatMap((columnSpacing) =>
    JOINING.map((joining) => ({
      columnSpacing,
      joining,
      tables: detect(snapshot.pages, joining, columnSpacing).map(snapTable),
    })),
  );
  writeFileSync(path, format({ ...snapshot, runs }) + "\n");
  console.log(
    `${name}: ${runs.map((r) => r.tables.length).join("/")} tables (runs from app engine)`,
  );
}
