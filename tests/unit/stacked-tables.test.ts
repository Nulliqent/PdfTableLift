// Seam A: Stacked Tables through the workspace reducer and export.
import { describe, expect, it } from "vitest";
import {
  EXPORT_FORMATS,
  exportFile,
  exportTable,
  headerMatch,
  initialWorkspace,
  reduce,
  selectedStackedTable,
  selectedTable,
  tickMatch,
  tickedTables,
  type Document,
  type PageText,
  type WorkspaceAction,
  type WorkspaceState,
} from "../../src/engine";
import { loadGoldens } from "./support/golden";

const goldens = loadGoldens();
const pagesOf = (name: string): PageText[] => goldens.find((g) => g.name === name)!.pages;

const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
/** Opens a fixture's pages with joining off, so Tables that continue stay separate. */
const open = (name: string, id = "d", state = initialWorkspace) =>
  run(
    { ...state, settings: { ...state.settings, join: false } },
    { type: "documentAdded", id, name: `${name}.pdf`, size: 1 },
    { type: "documentRead", id, pages: pagesOf(name) },
  );
const doc = (state: WorkspaceState, id = "d"): Document =>
  state.documents.find((d) => d.id === id)!;
/** The id of "Table n" of the Document. */
const tableId = (state: WorkspaceState, n: number, id = "d") =>
  doc(state, id).tables.find((t) => t.n === n)!.id;
const tableN = (state: WorkspaceState, n: number) => doc(state).tables.find((t) => t.n === n)!;
const tick = (state: WorkspaceState, ...ns: number[]): WorkspaceState =>
  ns.reduce(
    (s, n) => reduce(s, { type: "tableTicked", tableId: tableId(s, n), ticked: true }),
    state,
  );
/** Select Tables, tick the Tables in order, and stack them. */
const stack = (state: WorkspaceState, ...ns: number[]) =>
  reduce(tick(reduce(state, { type: "stackingStarted", documentId: "d" }), ...ns), {
    type: "tablesStacked",
  });

describe("the matching rule", () => {
  // Example Document, joining off: Table 1 has 6 columns (Store, Region, …), Tables 2 and 3 have 5
  // with other titles, Tables 4 and 5 share "Store, Lead, FTE, Open roles, Notes".
  const state = open("example-document");

  it("matches the same titles in the same order", () => {
    expect(headerMatch(tableN(state, 4), tableN(state, 5))).toEqual({ matches: true });
  });

  it("gives the column count as the reason", () => {
    expect(headerMatch(tableN(state, 4), tableN(state, 1))).toEqual({
      matches: false,
      reason: "6 columns, not 5",
    });
  });

  it("gives the first differing title as the reason", () => {
    expect(headerMatch(tableN(state, 4), tableN(state, 2))).toEqual({
      matches: false,
      reason: "'SKU' instead of 'Store'",
    });
  });

  it("ignores case and extra spaces", () => {
    const edited = run(state, {
      type: "cellEdited",
      documentId: "d",
      tableId: tableId(state, 5),
      row: 0,
      col: 3,
      value: "  OPEN   Roles ",
    });
    expect(tableN(edited, 5).grid[0]![3]).toBe("OPEN Roles");
    expect(headerMatch(tableN(edited, 4), tableN(edited, 5))).toEqual({ matches: true });
  });

  it("never matches a Table without a Header Row", () => {
    const off = run(state, {
      type: "headerToggled",
      documentId: "d",
      tableId: tableId(state, 5),
      header: false,
    });
    expect(headerMatch(tableN(off, 4), tableN(off, 5))).toEqual({
      matches: false,
      reason: "No Header Row",
    });
    // Before anything is ticked, only the Header Row is judged.
    expect(tickMatch(doc(off), [], tableN(off, 5))).toEqual({
      matches: false,
      reason: "No Header Row",
    });
    expect(tickMatch(doc(off), [], tableN(off, 1))).toEqual({ matches: true });
  });
});

describe("Select Tables", () => {
  const state = open("example-document");
  const started = reduce(state, { type: "stackingStarted", documentId: "d" });

  it("starts with nothing ticked and judges against the first ticked Table", () => {
    expect(started.stacking).toEqual({ documentId: "d", ticked: [] });
    const ticked = tick(started, 4);
    const s = ticked.stacking!;
    expect(tickMatch(doc(ticked), s.ticked, tableN(ticked, 5))).toEqual({ matches: true });
    expect(tickMatch(doc(ticked), s.ticked, tableN(ticked, 3))).toEqual({
      matches: false,
      reason: "'Week' instead of 'Store'",
    });
  });

  it("refuses to tick a Table that doesn't match", () => {
    const ticked = tick(started, 4, 1);
    expect(ticked.stacking!.ticked).toHaveLength(1);
  });

  it("re-judges the rest against the new first ticked Table after unticking the first", () => {
    const ticked = tick(started, 4, 5);
    const unticked = reduce(ticked, {
      type: "tableTicked",
      tableId: tableId(ticked, 4),
      ticked: false,
    });
    const s = unticked.stacking!;
    expect(s.ticked).toHaveLength(1);
    expect(tickMatch(doc(unticked), s.ticked, tableN(unticked, 4))).toEqual({ matches: true });
    expect(tickMatch(doc(unticked), s.ticked, tableN(unticked, 1)).matches).toBe(false);
    // With only Table 1 ticked, Table 4 is now the one left out.
    const other = tick(
      reduce(unticked, { type: "tableTicked", tableId: tableId(unticked, 5), ticked: false }),
      1,
    );
    expect(tickMatch(doc(other), other.stacking!.ticked, tableN(other, 4))).toEqual({
      matches: false,
      reason: "5 columns, not 6",
    });
  });

  it("does not stack fewer than two Tables", () => {
    const one = reduce(tick(started, 4), { type: "tablesStacked" });
    expect(doc(one).stacked).toEqual([]);
    expect(one.stacking).not.toBeNull();
  });

  it("leaves without a Stacked Table on Cancel", () => {
    const cancelled = reduce(tick(started, 4, 5), { type: "stackingCancelled" });
    expect(cancelled.stacking).toBeNull();
    expect(doc(cancelled).stacked).toEqual([]);
    expect(cancelled.selection).toEqual(state.selection);
  });

  it("is left when Select Region starts, and leaves Select Region when it starts", () => {
    const region = reduce(started, { type: "regionStarted", documentId: "d", page: 1 });
    expect(region.stacking).toBeNull();
    const back = reduce(region, { type: "stackingStarted", documentId: "d" });
    expect(back.region).toBeNull();
    expect(back.stacking).not.toBeNull();
  });

  it("ends when its Document is removed", () => {
    expect(reduce(started, { type: "documentRemoved", id: "d" }).stacking).toBeNull();
  });
});

describe("a Stacked Table", () => {
  it("has one Header Row and every Row of its Members in tick order", () => {
    const state = open("repeated-header");
    const stacked = stack(state, 3, 1);
    const built = selectedStackedTable(stacked)!;
    expect(built.record.n).toBe(1);
    expect(stacked.stacking).toBeNull();
    expect(selectedTable(stacked)).toBeNull();
    expect(built.table.grid.map((r) => r[0])).toEqual([
      "Order",
      "A-1013",
      "A-1014",
      "A-1015",
      "A-1016",
      "A-1017",
      "A-1018",
      "A-1001",
      "A-1002",
      "A-1003",
      "A-1004",
      "A-1005",
      "A-1006",
    ]);
    expect(exportTable(built.table, "csv").split("\n").slice(0, 3)).toEqual([
      "Order,City,Units,Total",
      "A-1013,Eugene,23,361.9",
      "A-1014,Fresno,59,785.7",
    ]);
    expect(built.members.map((m) => m.table?.n)).toEqual([3, 1]);
    expect(built.members.every((m) => m.leftOut === null)).toBe(true);
    // Each Row says which Member and which of its grid rows it came from.
    expect(built.origin[0]).toEqual({ member: 0, row: 0 });
    expect(built.origin[7]).toEqual({ member: 1, row: 1 });
  });

  it("takes its Header Row from the first Member as written there", () => {
    const state = open("repeated-header");
    const edited = run(state, {
      type: "cellEdited",
      documentId: "d",
      tableId: tableId(state, 2),
      row: 0,
      col: 1,
      value: "CITY",
    });
    const built = selectedStackedTable(stack(edited, 2, 1))!;
    expect(built.table.grid[0]).toEqual(["Order", "CITY", "Units", "Total"]);
    expect(built.table.grid).toHaveLength(13);
  });

  it("keeps each Member's Section Headers in place, in As Column and As Rows", () => {
    const built = selectedStackedTable(stack(open("example-document"), 4, 5))!;
    // Table 4 has Section Headers on rows 1, 8 and 17 of its 21 rows; Table 5 on row 8 of its 12.
    expect(built.table.sections).toEqual([1, 8, 17, 28]);
    expect(built.table.grid).toHaveLength(32);
    expect(built.table.grid[28]![0]).toBe("Online & Fleet");
    const rows = exportTable(built.table, "csv", "rows").split("\n");
    expect(rows[0]).toBe("Store,Lead,FTE,Open roles,Notes");
    expect(rows[21]).toBe("Madison Willy St,N. Kowalski,6,1,");
    expect(rows[28]).toBe("Online & Fleet,,,,");
    const column = exportTable(built.table, "csv", "column").split("\n");
    expect(column[0]).toBe("Section,Store,Lead,FTE,Open roles,Notes");
    // Table 5's first Rows sit under Table 4's last Section Header, as on the page.
    expect(column[18]).toBe("Midwest & Northeast,Madison Willy St,N. Kowalski,6,1,");
    expect(column.at(-1)).toBe("Online & Fleet,Warehouse Reno,R. Ibarra,15,3,");
  });

  it("is numbered per Document and leaves its Members standing", () => {
    const state = open("repeated-header");
    const first = stack(state, 1, 2);
    const second = stack(first, 2, 3);
    expect(doc(second).stacked.map((s) => s.n)).toEqual([1, 2]);
    expect(doc(second).tables).toEqual(doc(state).tables);
    // A Table can be in two Stacked Tables.
    expect(selectedStackedTable(second)!.members.map((m) => m.table?.n)).toEqual([2, 3]);
    const other = open("repeated-header", "e", second);
    const third = run(
      other,
      { type: "stackingStarted", documentId: "e" },
      { type: "tableTicked", tableId: tableId(other, 1, "e"), ticked: true },
      { type: "tableTicked", tableId: tableId(other, 2, "e"), ticked: true },
      { type: "tablesStacked" },
    );
    expect(doc(third, "e").stacked.map((s) => s.n)).toEqual([1]);
  });

  it("follows its Members: a Member's Cell edit shows in it", () => {
    const stacked = stack(open("repeated-header"), 1, 2);
    const edited = reduce(stacked, {
      type: "cellEdited",
      documentId: "d",
      tableId: tableId(stacked, 2),
      row: 1,
      col: 1,
      value: "Gary, IN",
    });
    expect(selectedStackedTable(edited)!.table.grid[7]).toEqual([
      "A-1007",
      "Gary, IN",
      "78",
      "566.6",
    ]);
  });

  it("can be selected, and a Member selected on its own again", () => {
    const stacked = stack(open("repeated-header"), 1, 2);
    const id = doc(stacked).stacked[0]!.id;
    const member = reduce(stacked, {
      type: "tableSelected",
      documentId: "d",
      tableId: tableId(stacked, 2),
    });
    expect(selectedStackedTable(member)).toBeNull();
    expect(selectedTable(member)?.n).toBe(2);
    const back = reduce(member, { type: "stackedTableSelected", documentId: "d", stackedId: id });
    expect(selectedStackedTable(back)?.record.id).toBe(id);
  });

  it("stays selected through a Column Spacing change and keeps its Members", () => {
    const stacked = stack(open("repeated-header"), 1, 2);
    const spaced = reduce(stacked, { type: "columnSpacingChanged", value: 1.2 });
    const built = selectedStackedTable(spaced)!;
    expect(built.members.map((m) => m.table?.n)).toEqual([1, 2]);
    expect(built.table.grid).toHaveLength(13);
  });

  it("is gone with its Document", () => {
    const stacked = stack(open("repeated-header"), 1, 2);
    const removed = reduce(stacked, { type: "documentRemoved", id: "d" });
    expect(removed.selection).toBeNull();
  });
});

describe("Edit Members", () => {
  const stacked = stack(open("repeated-header"), 1, 2);
  const id = doc(stacked).stacked[0]!.id;
  const editing = reduce(stacked, { type: "membersEditStarted", documentId: "d", stackedId: id });

  it("opens the checkboxes with the current Members ticked, in order", () => {
    expect(editing.stacking?.stackedId).toBe(id);
    expect(tickedTables(doc(editing), editing.stacking!.ticked).map((t) => t.n)).toEqual([1, 2]);
  });

  it("adds, removes and reorders Members on Save, and the grid follows the new order", () => {
    const saved = run(
      tick(editing, 3),
      { type: "tableTicked", tableId: tableId(editing, 1), ticked: false },
      { type: "memberMoved", tableId: tableId(editing, 3), direction: "up" },
      { type: "membersSaved" },
    );
    expect(saved.stacking).toBeNull();
    expect(doc(saved).stacked).toHaveLength(1);
    const built = selectedStackedTable(saved)!;
    expect(built.record.id).toBe(id);
    expect(built.members.map((m) => m.table?.n)).toEqual([3, 2]);
    expect(built.table.grid.map((r) => r[0])).toEqual([
      "Order",
      "A-1013",
      "A-1014",
      "A-1015",
      "A-1016",
      "A-1017",
      "A-1018",
      "A-1007",
      "A-1008",
      "A-1009",
      "A-1010",
      "A-1011",
      "A-1012",
    ]);
    // The Members themselves are untouched.
    expect(doc(saved).tables).toEqual(doc(stacked).tables);
  });

  it("moves a Member up or down, and not past either end", () => {
    const three = tick(editing, 3);
    const order = (s: WorkspaceState) => tickedTables(doc(s), s.stacking!.ticked).map((t) => t.n);
    const move = (s: WorkspaceState, n: number, direction: "up" | "down") =>
      reduce(s, { type: "memberMoved", tableId: tableId(s, n), direction });
    expect(order(move(three, 1, "down"))).toEqual([2, 1, 3]);
    expect(order(move(three, 3, "up"))).toEqual([1, 3, 2]);
    expect(move(three, 1, "up")).toBe(three);
    expect(move(three, 3, "down")).toBe(three);
  });

  it("leaves the Members as they were on Cancel", () => {
    const cancelled = run(
      tick(editing, 3),
      { type: "memberMoved", tableId: tableId(editing, 3), direction: "up" },
      { type: "stackingCancelled" },
    );
    expect(cancelled.stacking).toBeNull();
    expect(doc(cancelled).stacked).toEqual(doc(stacked).stacked);
  });

  it("keeps a Stacked Table saved with one Member, and refuses to save with none", () => {
    const one = run(
      editing,
      { type: "tableTicked", tableId: tableId(editing, 1), ticked: false },
      { type: "membersSaved" },
    );
    const built = selectedStackedTable(one)!;
    expect(built.members.map((m) => m.table?.n)).toEqual([2]);
    expect(built.table.grid).toHaveLength(7);
    expect(exportTable(built.table, "csv").split("\n")[0]).toBe("Order,City,Units,Total");

    const none = run(
      editing,
      { type: "tableTicked", tableId: tableId(editing, 1), ticked: false },
      { type: "tableTicked", tableId: tableId(editing, 2), ticked: false },
    );
    expect(reduce(none, { type: "membersSaved" })).toBe(none);
    // Stack N Tables does not make a second Stacked Table while editing one.
    expect(doc(reduce(tick(editing, 3), { type: "tablesStacked" })).stacked).toHaveLength(1);
  });
});

describe("Remove Stacked Table", () => {
  const state = open("repeated-header");
  const first = stack(state, 1, 2);
  const both = stack(first, 2, 3);
  const [one, two] = doc(both).stacked;

  it("removes only it: its Members and other Stacked Tables sharing a Member stay", () => {
    const edited = reduce(both, {
      type: "cellEdited",
      documentId: "d",
      tableId: tableId(both, 2),
      row: 1,
      col: 1,
      value: "Gary, IN",
    });
    const removed = reduce(edited, {
      type: "stackedTableRemoved",
      documentId: "d",
      stackedId: two!.id,
    });
    expect(doc(removed).stacked).toEqual([one]);
    expect(doc(removed).tables).toEqual(doc(edited).tables);
    expect(tableN(removed, 2).grid[1]![1]).toBe("Gary, IN");
    // The selection moves to its first Member.
    expect(selectedTable(removed)?.n).toBe(2);
  });

  it("keeps the selection when another Stacked Table is removed, and ends its Edit Members", () => {
    const editing = reduce(both, {
      type: "membersEditStarted",
      documentId: "d",
      stackedId: one!.id,
    });
    const removed = reduce(editing, {
      type: "stackedTableRemoved",
      documentId: "d",
      stackedId: one!.id,
    });
    expect(removed.stacking).toBeNull();
    const other = reduce(both, {
      type: "stackedTableRemoved",
      documentId: "d",
      stackedId: one!.id,
    });
    expect(selectedStackedTable(other)?.record.id).toBe(two!.id);
  });
});

/** Turns the Source switch of the selected Stacked Table on or off. */
const source = (state: WorkspaceState, on: boolean) =>
  reduce(state, {
    type: "stackedSourceToggled",
    documentId: "d",
    stackedId: selectedStackedTable(state)!.record.id,
    source: on,
  });
/** The selected Stacked Table as text, as Copy and Download give it. */
const text = (
  state: WorkspaceState,
  format: (typeof EXPORT_FORMATS)[number]["format"],
  mode: "column" | "rows",
) => {
  const built = selectedStackedTable(state)!;
  return exportTable(built.table, format, mode, built.source);
};

describe("the Source switch", () => {
  const stacked = stack(open("example-document"), 4, 5);

  it("is off by default, and nothing changes while it is", () => {
    const built = selectedStackedTable(stacked)!;
    expect(built.record.source).toBe(false);
    expect(built.source).toBeNull();
    for (const { format } of EXPORT_FORMATS)
      for (const mode of ["column", "rows"] as const)
        expect(text(stacked, format, mode)).toBe(exportTable(built.table, format, mode));
    const off = source(source(stacked, true), false);
    expect(text(off, "csv", "rows")).toBe(exportTable(built.table, "csv", "rows"));
  });

  it("puts a leading Source column with each Row's page in CSV and TSV, As Column", () => {
    const on = source(stacked, true);
    expect(selectedStackedTable(on)!.record.source).toBe(true);
    const csv = text(on, "csv", "column").split("\n");
    expect(csv[0]).toBe("Source,Section,Store,Lead,FTE,Open roles,Notes");
    expect(csv[18]).toBe("p3,Midwest & Northeast,Madison Willy St,N. Kowalski,6,1,");
    expect(csv.at(-1)).toBe("p3,Online & Fleet,Warehouse Reno,R. Ibarra,15,3,");
    expect(csv.slice(1, 18).every((r) => r.startsWith("p2,"))).toBe(true);
    const tsv = text(on, "tsv", "column").split("\n");
    expect(tsv[0]).toBe("Source\tSection\tStore\tLead\tFTE\tOpen roles\tNotes");
    expect(tsv[18]!.startsWith("p3\tMidwest & Northeast\tMadison Willy St")).toBe(true);
  });

  it("gives Section Headers an empty Source Cell As Rows", () => {
    const on = source(stacked, true);
    const csv = text(on, "csv", "rows").split("\n");
    expect(csv[0]).toBe("Source,Store,Lead,FTE,Open roles,Notes");
    expect(csv[21]).toBe("p3,Madison Willy St,N. Kowalski,6,1,");
    expect(csv[28]).toBe(",Online & Fleet,,,,");
    expect(text(on, "tsv", "rows").split("\n")[28]).toBe("\tOnline & Fleet\t\t\t\t");
  });

  it("puts the Source column first in Markdown", () => {
    const on = source(stacked, true);
    const plain = selectedStackedTable(on)!.table;
    const column = text(on, "md", "column").split("\n");
    expect(column[0]).toBe("| Source | Section | Store | Lead | FTE | Open roles | Notes |");
    // The Source and Section columns are never right-aligned; the rest align as without Source.
    expect(column[1]).toBe(
      `| --- | ${exportTable(plain, "md", "column").split("\n")[1]!.slice(2)}`,
    );
    expect(column.at(-1)).toBe("| p3 | Online & Fleet | Warehouse Reno | R. Ibarra | 15 | 3 |  |");
    const rows = text(on, "md", "rows").split("\n");
    expect(rows[0]).toBe("| Source | Store | Lead | FTE | Open roles | Notes |");
    // The Header Row is a line of its own and the separator another, so grid row r is line r + 1.
    expect(rows[29]).toBe("|  | **Online & Fleet** | | | | |");
    expect(rows.at(-1)).toBe("| p3 | Warehouse Reno | R. Ibarra | 15 | 3 |  |");
  });

  it("puts Source first in JSON, in both Section Modes", () => {
    const on = source(stacked, true);
    const column = JSON.parse(text(on, "json", "column")) as Record<string, string>[];
    expect(Object.keys(column[0]!)).toEqual([
      "Source",
      "Section",
      "Store",
      "Lead",
      "FTE",
      "Open roles",
      "Notes",
    ]);
    expect(column.at(-1)!.Source).toBe("p3");
    const rows = JSON.parse(text(on, "json", "rows")) as {
      section: string | null;
      rows: Record<string, string>[];
    }[];
    expect(rows.at(-1)!.section).toBe("Online & Fleet");
    expect(rows.at(-1)!.rows.at(-1)).toEqual({
      Source: "p3",
      Store: "Warehouse Reno",
      Lead: "R. Ibarra",
      FTE: "15",
      "Open roles": "3",
      Notes: "",
    });
  });

  it("gives a Row of a Joined Member its own page, not the Joined Table's range", () => {
    // Joining on: Split by Page, then Join Again at page 2, leaves Table 1 joined over pages 1
    // and 2, and Table 2 on page 3.
    const joined = run(
      initialWorkspace,
      { type: "documentAdded", id: "d", name: "repeated-header.pdf", size: 1 },
      { type: "documentRead", id: "d", pages: pagesOf("repeated-header") },
    );
    const parted = reduce(joined, {
      type: "splitByPage",
      documentId: "d",
      tableId: tableId(joined, 1),
    });
    const split = reduce(parted, {
      type: "joinAgain",
      documentId: "d",
      tableId: tableId(parted, 2),
    });
    expect(doc(split).tables.map((t) => t.parts.map((p) => p.page))).toEqual([[1, 2], [3]]);
    const on = source(stack(split, 2, 1), true);
    const stackedId = doc(on).stacked[0]!.id;
    const pages = (s: WorkspaceState) =>
      text(reduce(s, { type: "stackedTableSelected", documentId: "d", stackedId }), "csv", "column")
        .split("\n")
        .slice(1)
        .map((r) => r.split(",")[0]);
    expect(pages(on)).toEqual([
      ...Array<string>(6).fill("p3"),
      ...Array<string>(6).fill("p1"),
      ...Array<string>(6).fill("p2"),
    ]);
    // A Row combined across the page break takes the upper Row's page; Split back restores both.
    const combined = reduce(on, {
      type: "rowCombined",
      documentId: "d",
      tableId: tableId(on, 1),
      row: 6,
      direction: "below",
    });
    expect(pages(combined).slice(6)).toEqual([
      ...Array<string>(6).fill("p1"),
      ...Array<string>(5).fill("p2"),
    ]);
    const back = reduce(combined, {
      type: "rowSplitBack",
      documentId: "d",
      tableId: tableId(on, 1),
      row: 6,
    });
    expect(pages(back)).toEqual(pages(on));
  });
});

describe("Download of a Stacked Table", () => {
  it("gives the same text as Copy, named after the Document and the Stacked Table", () => {
    for (const on of [false, true]) {
      const state = source(stack(open("example-document"), 4, 5), on);
      const built = selectedStackedTable(state)!;
      for (const { format } of EXPORT_FORMATS)
        for (const mode of ["column", "rows"] as const) {
          const file = exportFile(
            doc(state).name,
            `Stacked Table ${built.record.n}`,
            built.table,
            format,
            mode,
            built.source,
          );
          expect(file.text).toBe(text(state, format, mode));
          expect(file.name).toBe(`example-document.pdf - Stacked Table 1.${format}`);
        }
    }
  });
});
