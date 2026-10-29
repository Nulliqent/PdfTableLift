// Seam A: Removed Tables through the workspace reducer.
import { describe, expect, it } from "vitest";
import {
  initialWorkspace,
  reduce,
  selectedTable,
  type PageText,
  type TextItem,
  type WorkspaceAction,
  type WorkspaceState,
} from "../../src/engine";

const at = (str: string, x: number, y: number): TextItem => ({
  str,
  x,
  y,
  w: str.length * 5,
  h: 9,
  bold: false,
});

/** A three-row, two-column table whose first cell is `tag`, with its top row at `top`. */
const table = (tag: string, top: number): TextItem[] => [
  at(tag, 72, top),
  at("Qty", 300, top),
  at("Bolt", 72, top - 14),
  at("4", 300, top - 14),
  at("Nut", 72, top - 28),
  at("9", 300, top - 28),
];

const page = (num: number, items: TextItem[]): PageText => ({ num, w: 612, h: 792, items });
const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
const open = (id: string, pages: PageText[], state = initialWorkspace) =>
  run(
    state,
    { type: "documentAdded", id, name: `${id}.pdf`, size: 1 },
    { type: "documentRead", id, pages },
  );
const tablesOf = (state: WorkspaceState, id = "d") =>
  state.documents.find((d) => d.id === id)!.tables;
const names = (state: WorkspaceState, id = "d") => tablesOf(state, id).map((t) => t.grid[0]![0]);

// Three tables stacked on one page (A on top), far enough apart to stay separate.
const stacked = () => [page(1, [...table("A", 700), ...table("B", 500), ...table("C", 300)])];

describe("tableRemoved", () => {
  it("hides the Table and renumbers the rest", () => {
    const state = run(open("d", stacked()), {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(open("d", stacked()))[1]!.id,
    });
    expect(names(state)).toEqual(["A", "C"]);
    expect(tablesOf(state).map((t) => t.n)).toEqual([1, 2]);
  });

  it("moves the selection to the Table that took its place", () => {
    const opened = open("d", stacked());
    const [a, b] = tablesOf(opened);
    const state = run(
      opened,
      { type: "tableSelected", documentId: "d", tableId: b!.id },
      { type: "tableRemoved", documentId: "d", tableId: b!.id },
    );
    expect(selectedTable(state)?.grid[0]![0]).toBe("C");
    expect(a).toBeDefined();
  });

  it("moves to the previous Table when the last one is removed", () => {
    const opened = open("d", stacked());
    const c = tablesOf(opened)[2]!;
    const state = run(
      opened,
      { type: "tableSelected", documentId: "d", tableId: c.id },
      { type: "tableRemoved", documentId: "d", tableId: c.id },
    );
    expect(selectedTable(state)?.grid[0]![0]).toBe("B");
  });

  it("keeps the selection when another Table is removed", () => {
    const opened = open("d", stacked());
    const [a, , c] = tablesOf(opened);
    const state = run(
      opened,
      { type: "tableSelected", documentId: "d", tableId: c!.id },
      { type: "tableRemoved", documentId: "d", tableId: a!.id },
    );
    expect(selectedTable(state)?.grid[0]![0]).toBe("C");
  });

  it("moves to another Document when the last Table of this one is removed", () => {
    const first = open("d", [page(1, table("A", 700))]);
    const both = open("e", [page(1, table("Z", 700))], first);
    const state = run(both, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(both)[0]!.id,
    });
    expect(tablesOf(state)).toEqual([]);
    expect(state.selection?.documentId).toBe("e");
    expect(selectedTable(state)?.grid[0]![0]).toBe("Z");
  });

  it("clears the selection when no Table is left anywhere", () => {
    const opened = open("d", [page(1, table("A", 700))]);
    const state = run(opened, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(opened)[0]!.id,
    });
    expect(state.selection).toBeNull();
  });

  it("ignores an unknown Table", () => {
    const opened = open("d", stacked());
    expect(run(opened, { type: "tableRemoved", documentId: "d", tableId: "nope" })).toBe(opened);
  });
});

describe("Removed Tables through re-detection", () => {
  it("stay hidden when Column Spacing changes", () => {
    const opened = open("d", stacked());
    const state = run(
      opened,
      { type: "tableRemoved", documentId: "d", tableId: tablesOf(opened)[1]!.id },
      { type: "columnSpacingChanged", value: 1.5 },
      { type: "columnSpacingChanged", value: 0.6 },
    );
    expect(names(state)).toEqual(["A", "C"]);
  });

  it("hide a re-detected Table that overlaps by more than 60%", () => {
    const opened = open("d", [page(1, table("B", 500))]);
    const state = run(opened, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(opened)[0]!.id,
    });
    // Re-read the same Document with the table nudged down 10 pt: still mostly the same box.
    const reread = run(state, {
      type: "documentRead",
      id: "d",
      pages: [page(1, table("B", 490))],
    });
    expect(tablesOf(reread)).toEqual([]);
  });

  it("do not hide a Table that overlaps by 60% or less, or sits on another page", () => {
    const opened = open("d", [page(1, table("B", 500))]);
    const state = run(opened, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(opened)[0]!.id,
    });
    const moved = run(state, { type: "documentRead", id: "d", pages: [page(1, table("B", 470))] });
    expect(names(moved)).toEqual(["B"]);
    const elsewhere = run(state, {
      type: "documentRead",
      id: "d",
      pages: [page(2, table("B", 500))],
    });
    expect(names(elsewhere)).toEqual(["B"]);
  });

  it("are per Document", () => {
    const d = open("d", [page(1, table("B", 500))]);
    const both = open("e", [page(1, table("B", 500))], d);
    const state = run(both, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(both)[0]!.id,
    });
    expect(tablesOf(state, "d")).toEqual([]);
    expect(names(state, "e")).toEqual(["B"]);
  });
});

describe("tableRestored", () => {
  it("brings the Table back in its place", () => {
    const opened = open("d", stacked());
    const removed = run(opened, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(opened)[1]!.id,
    });
    const removedId = removed.documents[0]!.removed[0]!.id;
    const state = run(removed, { type: "tableRestored", documentId: "d", removedId });
    expect(names(state)).toEqual(["A", "B", "C"]);
    expect(state.documents[0]!.removed).toEqual([]);
  });

  it("restores only the chosen Removed Table", () => {
    const opened = open("d", stacked());
    const once = run(opened, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(opened)[1]!.id,
    });
    const twice = run(once, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(once)[1]!.id,
    });
    expect(names(twice)).toEqual(["A"]);
    const [first, second] = twice.documents[0]!.removed;
    expect(first!.id).not.toBe(second!.id);
    const state = run(twice, { type: "tableRestored", documentId: "d", removedId: first!.id });
    expect(names(state)).toEqual(["A", "B"]);
  });

  it("selects the Table when the Document had none", () => {
    const opened = open("d", [page(1, table("A", 700))]);
    const removed = run(opened, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(opened)[0]!.id,
    });
    const state = run(removed, {
      type: "tableRestored",
      documentId: "d",
      removedId: removed.documents[0]!.removed[0]!.id,
    });
    expect(selectedTable(state)?.grid[0]![0]).toBe("A");
  });

  it("ignores an unknown Removed Table", () => {
    const opened = open("d", stacked());
    expect(run(opened, { type: "tableRestored", documentId: "d", removedId: "nope" })).toBe(opened);
  });
});
