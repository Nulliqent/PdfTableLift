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
  exportTable,
  initialWorkspace,
  reduce,
  tableSize,
  type PageText,
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
  cols: t.cols,
  repeats: t.repeats ?? 0,
});

const goldenSize = (t: GoldenTable) => ({
  rows: t.grid.length - 1 - t.sections.filter((r) => r !== 0).length,
  cols: t.grid[0]!.length,
});

const goldenExport = (format: "csv" | "tsv" | "md" | "json") => (t: GoldenTable) =>
  t.exports ? t.exports.column[format] : t.exportDigests!.column[format];

for (const golden of loadGoldens()) {
  describe(golden.name, () => {
    if (golden.status === "error") {
      it.todo(`#18 errors: reports "${golden.error}"`);
      return;
    }
    defineComparisons(golden);
  });
}

function defineComparisons(golden: Golden) {
  const run = golden.runs.find((r) => r.columnSpacing === 1 && !r.joining)!;
  const withSections = run.tables.filter((t) => t.sections.length);
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

  for (const format of ["csv", "tsv", "md", "json"] as const) {
    it(`exports the same ${format.toUpperCase()} for each Table without Section Headers`, () => {
      const expected = run.tables.filter((t) => !t.sections.length);
      const actual = tables.filter((_, i) => !run.tables[i]?.sections.length);
      const write = (t: Table) => exportTable(t, format);
      if (expected[0]?.exports)
        expect(actual.map(write)).toEqual(expected.map(goldenExport(format)));
      else expect(actual.map((t) => sha256(write(t)))).toEqual(expected.map(goldenExport(format)));
    });
  }

  if (withSections.length)
    it.todo(
      `#11 Section Headers: sections and As Column / As Rows exports of Tables ${withSections.map((t) => t.n).join(", ")}`,
    );
  it.todo("#12 joining: the runs with joining on");
  for (const other of golden.runs.filter((r) => r.columnSpacing !== 1 && !r.joining)) {
    it(`re-detects the same Tables at Column Spacing ${other.columnSpacing}, joining off`, () => {
      const found = redetect(pages, other.columnSpacing);
      expect(found.map(detectionOf)).toEqual(other.tables.map(detectionOf));
      expect(found.map(tableSize)).toEqual(other.tables.map(goldenSize));
      const plain = other.tables.filter((t) => !t.sections.length);
      const csv = (t: Table) => exportTable(t, "csv");
      const actual = found.filter((_, i) => !other.tables[i]?.sections.length).map(csv);
      expect(plain[0]?.exports ? actual : actual.map(sha256)).toEqual(plain.map(goldenCsv));
    });
  }
}
