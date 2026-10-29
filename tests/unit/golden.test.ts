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

const goldenCsv = (t: GoldenTable) =>
  t.exports ? t.exports.column.csv : t.exportDigests!.column.csv;

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

  it("exports the same CSV for each Table without Section Headers", () => {
    const expected = run.tables.filter((t) => !t.sections.length);
    const actual = tables.filter((_, i) => !run.tables[i]?.sections.length);
    const csv = (t: Table) => exportTable(t, "csv");
    if (expected[0]?.exports) expect(actual.map(csv)).toEqual(expected.map(goldenCsv));
    else expect(actual.map((t) => sha256(csv(t)))).toEqual(expected.map(goldenCsv));
  });

  if (withSections.length)
    it.todo(
      `#11 Section Headers: sections and As Column / As Rows exports of Tables ${withSections.map((t) => t.n).join(", ")}`,
    );
  it.todo("#10 export formats: TSV, Markdown and JSON");
  it.todo("#12 joining: the runs with joining on");
  if (golden.runs.some((r) => r.columnSpacing !== 1))
    it.todo("#7 Column Spacing: the runs at 0.5 and 2.0 with joining off");
}
