// Golden snapshots: each fixture PDF goes through the PDF Reader (seam B) and then the workspace
// reducer and export (seam A), and the result is compared with what the prototype produced on
// pdf.js 3.11 (tests/golden/snapshots). A snapshot is never updated to make a test pass: a
// difference is a regression, or a pdf.js change to report.
//
// Cases a later ticket enables are listed as todos named after that ticket. To enable one,
// replace the todo with a comparison in the same style.
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  READ_ERROR_MESSAGES,
  exportTable,
  initialWorkspace,
  reduce,
  tableSize,
  type PageText,
  type SectionMode,
  type Table,
} from "../../src/engine";
import { fixtureBytes, loadGoldens, type Golden, type GoldenTable } from "./support/golden";
import { readDocument } from "./support/node-reader";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Opens the pages as a Document and returns its Tables. */
function detect(pages: PageText[]): Table[] {
  const state = [
    { type: "documentAdded", id: "golden", name: "golden.pdf", size: 0 } as const,
    { type: "documentRead", id: "golden", pages } as const,
  ].reduce(reduce, initialWorkspace);
  return state.documents[0]!.tables;
}

/** Opens the pages at the default Column Spacing, then moves the slider to `columnSpacing`. */
function redetect(pages: PageText[], columnSpacing: number): Table[] {
  const opened = [
    { type: "documentAdded", id: "golden", name: "golden.pdf", size: 0 } as const,
    { type: "documentRead", id: "golden", pages } as const,
  ].reduce(reduce, initialWorkspace);
  const moved = reduce(opened, { type: "columnSpacingChanged", value: columnSpacing });
  return moved.documents[0]!.tables;
}

/** What this ticket covers of a Table: detection, the grid, its pages and size. */
const detectionOf = (t: Table | GoldenTable) => ({
  n: t.n,
  pages: t.parts.map((p) => p.page),
  parts: t.parts,
  header: t.header,
  firstBold: t.firstBold,
  grid: t.grid,
  sections: t.sections,
  cols: t.cols,
  repeats: t.repeats ?? 0,
});

const goldenSize = (t: GoldenTable) => ({
  rows: t.grid.length - 1 - t.sections.filter((r) => r !== 0).length,
  cols: t.grid[0]!.length,
});

type Format = "csv" | "tsv" | "md" | "json";
const goldenExport =
  (format: Format, mode: SectionMode = "column") =>
  (t: GoldenTable) =>
    t.exports ? t.exports[mode][format] : t.exportDigests![mode][format];

/** Every Table's export in `format` and `mode` against the snapshot (digests for large ones). */
function expectExports(
  actual: Table[],
  expected: GoldenTable[],
  format: Format,
  mode: SectionMode,
) {
  const write = (t: Table) => exportTable(t, format, mode);
  if (expected[0]?.exports)
    expect(actual.map(write)).toEqual(expected.map(goldenExport(format, mode)));
  else
    expect(actual.map((t) => sha256(write(t)))).toEqual(expected.map(goldenExport(format, mode)));
}

for (const golden of loadGoldens()) {
  describe(golden.name, () => {
    if (golden.status === "error") {
      defineErrorComparisons(golden);
      return;
    }
    defineComparisons(golden);
  });
}

/** An error fixture: the PDF Reader returns a ReadError, which the Document shows as the prototype's message. */
function defineErrorComparisons(golden: Golden) {
  it(`reports "${golden.error}" and detects no Tables`, async () => {
    const result = await readDocument(fixtureBytes(golden));
    if (typeof result !== "string") throw new Error("expected a ReadError, got pages");

    const state = [
      { type: "documentAdded", id: "golden", name: "golden.pdf", size: 0 } as const,
      { type: "documentFailed", id: "golden", error: result } as const,
    ].reduce(reduce, initialWorkspace);

    const doc = state.documents[0]!;
    expect(doc.status).toBe("error");
    expect(READ_ERROR_MESSAGES[doc.error!]).toBe(golden.error);
    expect(doc.tables).toEqual([]);
    for (const run of golden.runs) expect(run.tables).toEqual([]);
  });
}

function defineComparisons(golden: Golden) {
  const run = golden.runs.find((r) => r.columnSpacing === 1 && !r.joining)!;
  let pages: PageText[];
  let tables: Table[];

  beforeAll(async () => {
    const result = await readDocument(fixtureBytes(golden));
    if (typeof result === "string") throw new Error(`the PDF Reader returned ${result}`);
    pages = result;
    tables = detect(pages);
  });

  it("reads the same pages and text items as the prototype", () => {
    expect(pages).toEqual(golden.pages);
  });

  it("detects the same Tables, pages and sizes at Column Spacing 1.0, joining off", () => {
    expect(tables.map(detectionOf)).toEqual(run.tables.map(detectionOf));
    expect(tables.map(tableSize)).toEqual(run.tables.map(goldenSize));
  });

  for (const mode of ["column", "rows"] as const) {
    for (const format of ["csv", "tsv", "md", "json"] as const) {
      it(`exports the same ${format.toUpperCase()} for every Table, Section Mode ${mode}`, () => {
        expectExports(tables, run.tables, format, mode);
      });
    }
  }

  it.todo("#12 joining: the runs with joining on");
  for (const other of golden.runs.filter((r) => r.columnSpacing !== 1 && !r.joining)) {
    it(`re-detects the same Tables at Column Spacing ${other.columnSpacing}, joining off`, () => {
      const found = redetect(pages, other.columnSpacing);
      expect(found.map(detectionOf)).toEqual(other.tables.map(detectionOf));
      expect(found.map(tableSize)).toEqual(other.tables.map(goldenSize));
      expectExports(found, other.tables, "csv", "column");
      expectExports(found, other.tables, "csv", "rows");
    });
  }
}
