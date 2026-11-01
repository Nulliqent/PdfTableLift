// Seam A: Download through the workspace reducer and export (#49).
import { describe, expect, it } from "vitest";
import {
  EXPORT_FORMATS,
  exportFile,
  exportTable,
  initialWorkspace,
  reduce,
  type PageText,
  type TextItem,
  type WorkspaceAction,
  type WorkspaceState,
} from "../../src/engine";

const at = (str: string, x: number, y: number, bold = false): TextItem => ({
  str,
  x,
  y,
  w: str.length * 5,
  h: 9,
  bold,
});
const XS = [72, 200, 320];
const row = (y: number, cells: string[], bold = false) =>
  cells.map((c, i) => at(c, XS[i]!, y, bold));

const page: PageText = {
  num: 1,
  w: 612,
  h: 792,
  items: [
    ...row(700, ["Item", "Qty", "Price"], true),
    ...row(686, ["Bolt", "4", "1.20"]),
    ...row(672, ["Nut", "9", "0.40"]),
    ...row(658, ["Screw", "7", "0.10"]),
  ],
};

const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
const open = () =>
  run(
    initialWorkspace,
    { type: "documentAdded", id: "d", name: "march.pdf", size: 1 },
    { type: "documentRead", id: "d", pages: [page] },
  );

describe("Download", () => {
  it("names the file after the Document and the Table, with the format's extension and type", () => {
    const doc = open().documents[0]!;
    const table = doc.tables[0]!;
    const files = EXPORT_FORMATS.map(({ format }) =>
      exportFile(doc.name, `Table ${table.n}`, table, format),
    );
    expect(files.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: "march.pdf - Table 1.csv", type: "text/csv" },
      { name: "march.pdf - Table 1.tsv", type: "text/tab-separated-values" },
      { name: "march.pdf - Table 1.md", type: "text/markdown" },
      { name: "march.pdf - Table 1.json", type: "application/json" },
    ]);
  });

  it("saves the CSV a user would copy", () => {
    const doc = open().documents[0]!;
    expect(exportFile(doc.name, "Table 1", doc.tables[0]!, "csv").text).toBe(
      "Item,Qty,Price\nBolt,4,1.20\nNut,9,0.40\nScrew,7,0.10",
    );
  });

  it("saves the copy text for every format and both Section Modes", () => {
    const state = run(open(), {
      type: "sectionHeaderToggled",
      documentId: "d",
      tableId: open().documents[0]!.tables[0]!.id,
      row: 2,
    });
    const doc = state.documents[0]!;
    const table = doc.tables[0]!;
    for (const { format } of EXPORT_FORMATS)
      for (const mode of ["column", "rows"] as const)
        expect(exportFile(doc.name, "Table 1", table, format, mode).text).toBe(
          exportTable(table, format, mode),
        );
    expect(exportFile(doc.name, "Table 1", table, "csv", "column").text).toBe(
      "Section,Item,Qty,Price\n,Bolt,4,1.20\nNut 9 0.40,Screw,7,0.10",
    );
  });
});
