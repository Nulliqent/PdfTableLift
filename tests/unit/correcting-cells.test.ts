// Seam A: correcting cells, the Header Row switch and the edit warning, through the reducer.
import { describe, expect, it } from "vitest";
import {
  exportTable,
  initialWorkspace,
  numericColumns,
  reduce,
  selectedTable,
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

const run = (...actions: WorkspaceAction[]) => actions.reduce(reduce, initialWorkspace);
const opened = () =>
  run(
    { type: "documentAdded", id: "d1", name: "r.pdf", size: 1 },
    { type: "documentRead", id: "d1", pages: [page] },
  );
const tableId = (s: WorkspaceState) => selectedTable(s)!.id;
const edit = (s: WorkspaceState, r: number, c: number, value: string) =>
  reduce(s, { type: "cellEdited", documentId: "d1", tableId: tableId(s), row: r, col: c, value });
const setHeader = (s: WorkspaceState, header: boolean) =>
  reduce(s, { type: "headerToggled", documentId: "d1", tableId: tableId(s), header });

describe("editing cells", () => {
  it("starts unedited", () => {
    expect(selectedTable(opened())!.edited).toBe(false);
  });

  it("changes the cell, flags the Table and flows into the export", () => {
    const table = selectedTable(edit(opened(), 1, 0, "  Portland,  OR "))!;

    expect(table.grid[1]![0]).toBe("Portland, OR");
    expect(table.edited).toBe(true);
    expect(exportTable(table, "csv").split("\n")[1]).toBe('"Portland, OR",West,412.8');
  });

  it("can edit the Header Row, which flows into the export", () => {
    const table = selectedTable(edit(opened(), 0, 2, "Q1 total"))!;
    expect(exportTable(table, "csv").split("\n")[0]).toBe("Store,Region,Q1 total");
  });

  it("leaves the Table unflagged when the text did not change", () => {
    const before = opened();
    expect(edit(before, 1, 0, " Portland ")).toBe(before);
  });

  it("ignores a cell or Table that does not exist", () => {
    const before = opened();
    expect(edit(before, 9, 0, "x")).toBe(before);
    const missing: WorkspaceAction = {
      type: "cellEdited",
      documentId: "d1",
      tableId: "nope",
      row: 0,
      col: 0,
      value: "x",
    };
    expect(reduce(before, missing)).toBe(before);
  });
});

describe("First row is header", () => {
  it("toggles the Header Row and the exports follow", () => {
    const table = selectedTable(setHeader(opened(), false))!;

    expect(table.header).toBe(false);
    expect(table.edited).toBe(true);
    expect(exportTable(table, "md").split("\n")[0]).toBe("| Column 1 | Column 2 | Column 3 |");
    expect(JSON.parse(exportTable(table, "json"))).toHaveLength(3);
  });
});

describe("numeric columns", () => {
  it("flags columns where 70% of the non-empty body cells are numbers", () => {
    expect(numericColumns(selectedTable(opened())!)).toEqual([false, false, true]);
  });

  it("follows the Header Row switch", () => {
    // "Q1" is now a body cell: 2 of 3 are numbers, below 70%.
    expect(numericColumns(selectedTable(setHeader(opened(), false))!)).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("the edit warning", () => {
  const spacing = (value: number): WorkspaceAction => ({ type: "columnSpacingChanged", value });

  it("applies Column Spacing straight away when nothing is edited", () => {
    const state = reduce(opened(), spacing(2));
    expect(state.settings.columnSpacing).toBe(2);
    expect(state.pendingChange).toBeNull();
  });

  it("parks the change instead of applying it while a Table is edited", () => {
    const edited = edit(opened(), 1, 0, "Portland OR");
    const state = reduce(edited, spacing(2));

    expect(state.pendingChange).toEqual(spacing(2));
    expect(state.settings.columnSpacing).toBe(1);
    expect(state.documents).toBe(edited.documents);
  });

  it("does not ask about a value that changes nothing", () => {
    const edited = edit(opened(), 1, 0, "x");
    expect(reduce(edited, spacing(1)).pendingChange).toBeNull();
  });

  it("cancelling leaves the Tables and the setting unchanged", () => {
    const edited = edit(opened(), 1, 0, "x");
    const cancelled = reduce(reduce(edited, spacing(2)), { type: "changeCancelled" });

    expect(cancelled).toEqual(edited);
  });

  it("confirming re-detects and drops the edits", () => {
    const edited = edit(opened(), 1, 0, "x");
    const state = reduce(reduce(edited, spacing(1.5)), { type: "changeConfirmed" });

    expect(state.pendingChange).toBeNull();
    expect(state.settings.columnSpacing).toBe(1.5);
    expect(state.documents.flatMap((d) => d.tables).some((t) => t.edited)).toBe(false);
    expect(selectedTable(state)!.grid[1]![0]).toBe("Portland");
  });

  it("confirming with nothing pending does nothing", () => {
    const s = opened();
    expect(reduce(s, { type: "changeConfirmed" })).toBe(s);
  });
});
