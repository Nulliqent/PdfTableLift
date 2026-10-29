// Seam A: correcting Section Headers and the two Section Modes, through the reducer and export.
import { describe, expect, it } from "vitest";
import {
  exportTable,
  initialWorkspace,
  reduce,
  selectedTable,
  tableSize,
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
const row = (y: number, cells: string[], bold = false) =>
  cells.map((c, i) => at(c, [72, 200, 320][i]!, y, bold));

const page: PageText = {
  num: 1,
  w: 612,
  h: 792,
  items: [
    ...row(710, ["Store", "Region", "Q1"], true),
    ...row(696, ["Portland", "West", "412.8"]),
    ...row(682, ["Austin", "South", "1,204"]),
  ],
};

const opened = () =>
  (
    [
      { type: "documentAdded", id: "d1", name: "r.pdf", size: 1 },
      { type: "documentRead", id: "d1", pages: [page] },
    ] as WorkspaceAction[]
  ).reduce(reduce, initialWorkspace);
const toggle = (s: WorkspaceState, r: number) =>
  reduce(s, {
    type: "sectionHeaderToggled",
    documentId: "d1",
    tableId: selectedTable(s)!.id,
    row: r,
  });

describe("toggling a Section Header", () => {
  it("marks a row, gathers its text into the first cell and counts as an edit", () => {
    const table = selectedTable(toggle(opened(), 1))!;
    expect(table.sections).toEqual([1]);
    expect(table.grid[1]).toEqual(["Portland West 412.8", "", ""]);
    expect(table.edited).toBe(true);
    expect(tableSize(table)).toEqual({ rows: 1, cols: 3 });
  });

  it("turns a Section Header back into a data row", () => {
    const table = selectedTable(toggle(toggle(opened(), 1), 1))!;
    expect(table.sections).toEqual([]);
  });

  it("ignores the Header Row and rows that do not exist", () => {
    const before = opened();
    expect(toggle(before, 0)).toBe(before);
    expect(toggle(before, 9)).toBe(before);
  });

  it("makes a pending Column Spacing change wait for confirmation", () => {
    const s = reduce(toggle(opened(), 1), { type: "columnSpacingChanged", value: 1.5 });
    expect(s.pendingChange).toMatchObject({ type: "columnSpacingChanged", value: 1.5 });
  });
});

describe("the Example Document", () => {
  const sectioned: PageText = {
    num: 2,
    w: 612,
    h: 792,
    items: [
      ...row(710, ["Store", "Region", "Q1"], true),
      ...row(696, ["West"]),
      ...row(682, ["Portland", "West", "412.8"]),
      ...row(668, ["Austin", "South", "1,204"]),
    ],
  };
  const open = (example: boolean) =>
    (
      [
        { type: "documentAdded", id: "ex", name: "ex.pdf", size: 1, example },
        { type: "documentRead", id: "ex", pages: [page, sectioned] },
      ] as WorkspaceAction[]
    ).reduce(reduce, initialWorkspace);

  it("opens on its first Table with Section Headers", () => {
    const table = selectedTable(open(true))!;
    expect(table.page).toBe(2);
    expect(table.sections.some((r) => r > 0)).toBe(true);
  });

  it("is not special for a Document the user opened", () => {
    expect(selectedTable(open(false))!.page).toBe(1);
  });
});

describe("Section Modes", () => {
  const marked = () => selectedTable(toggle(opened(), 1))!;

  it("As Column adds a leading Section column", () => {
    expect(exportTable(marked(), "csv", "column")).toBe(
      'Section,Store,Region,Q1\nPortland West 412.8,Austin,South,"1,204"',
    );
  });

  it("As Rows keeps the Section Header as a row", () => {
    expect(exportTable(marked(), "csv", "rows")).toBe(
      'Store,Region,Q1\nPortland West 412.8,,\nAustin,South,"1,204"',
    );
    expect(exportTable(marked(), "md", "rows")).toContain("| **Portland West 412.8** | | |");
    expect(JSON.parse(exportTable(marked(), "json", "rows"))).toEqual([
      { section: "Portland West 412.8", rows: [{ Store: "Austin", Region: "South", Q1: "1,204" }] },
    ]);
  });

  it("is the same in both modes for a Table without Section Headers", () => {
    const t = selectedTable(opened())!;
    expect(exportTable(t, "csv", "column")).toBe(exportTable(t, "csv", "rows"));
  });
});
