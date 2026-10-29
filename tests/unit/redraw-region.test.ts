// Seam A: redrawing the Region of a Table, including one Part of a Joined Table.
import { describe, expect, it } from "vitest";
import {
  initialWorkspace,
  reduce,
  selectedTable,
  type Bbox,
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
const page = (num: number, items: TextItem[]): PageText => ({ num, w: 612, h: 792, items });
const HEAD = ["Item", "Qty", "Price"];
const foot = (rows: string[][]) =>
  rows.reduce<TextItem[]>(
    (items, r, i) => [...items, ...row(150 - i * 14, r)],
    row(164, HEAD, true),
  );
const top = (rows: string[][]) =>
  rows.reduce<TextItem[]>(
    (items, r, i) => [...items, ...row(720 - i * 14, r)],
    row(734, HEAD, true),
  );

const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
const open = (pages: PageText[]) =>
  run(
    initialWorkspace,
    { type: "documentAdded", id: "d", name: "d.pdf", size: 1 },
    { type: "documentRead", id: "d", pages },
  );
const tablesOf = (state: WorkspaceState) => state.documents[0]!.tables;
const pagesOf = (state: WorkspaceState) => tablesOf(state).map((t) => t.parts.map((p) => p.page));
const kind = (state: WorkspaceState) => tablesOf(state).map((t) => t.manual !== null);

/** Redraws the Region of `tables[index]` on `pageNum` to `bbox` and saves it. */
const redraw = (state: WorkspaceState, index: number, pageNum: number, bbox: Bbox) =>
  run(
    state,
    { type: "regionStarted", documentId: "d", page: pageNum, tableId: tablesOf(state)[index]!.id },
    { type: "regionChanged", page: pageNum, bbox },
    { type: "regionCommitted" },
  );

const edit = (state: WorkspaceState): WorkspaceState =>
  reduce(state, {
    type: "cellEdited",
    documentId: "d",
    tableId: tablesOf(state)[0]!.id,
    row: 1,
    col: 0,
    value: "Washer",
  });

const solo = page(
  1,
  top([
    ["Bolt", "4", "1.20"],
    ["Nut", "9", "0.40"],
  ]),
);
/** The same table with a stray line of text far below it. */
const withStray = page(1, [...solo.items, ...row(400, ["Far", "1", "2"])]);
const two = [page(1, foot([["Bolt", "4", "1.20"]])), page(2, top([["Screw", "7", "0.10"]]))];
// A middle page whose table runs from top to foot, so three pages join into one.
const mid = page(2, [
  ...row(734, HEAD, true),
  ...Array.from({ length: 42 }, (_, i) => row(720 - i * 14, ["Screw", "7", "0.10"])).flat(),
]);
const three = [two[0]!, mid, page(3, top([["Nail", "1", "0.01"]]))];

describe("redrawing a Region", () => {
  it("opens on the page of the Table with its current bounds", () => {
    const state = open([solo]);
    const t = tablesOf(state)[0]!;
    const started = reduce(state, {
      type: "regionStarted",
      documentId: "d",
      page: 1,
      tableId: t.id,
    });
    expect(started.region).toMatchObject({ documentId: "d", page: 1, bbox: t.parts[0]!.bbox });
  });

  it("replaces a Detected Table with a Hand-drawn Table (US-31, US-32)", () => {
    const state = redraw(open([solo]), 0, 1, [60, 690, 560, 760]);
    expect(kind(state)).toEqual([true]);
    expect(tablesOf(state)[0]!.grid.map((r) => r[0])).toEqual(["Item", "Bolt", "Nut"]);
    expect(selectedTable(state)).toBe(tablesOf(state)[0]);
    expect(state.region).toBeNull();
  });

  it("does not save a Region with no text", () => {
    const state = redraw(open([solo]), 0, 1, [60, 100, 560, 200]);
    expect(kind(state)).toEqual([false]);
    expect(state.region).not.toBeNull();
  });

  it("still replaces the original when the new Region covers none of it", () => {
    const state = redraw(open([withStray]), 0, 1, [60, 395, 560, 412]);
    expect(kind(state)).toEqual([true]);
    expect(tablesOf(state)).toHaveLength(1);
    expect(tablesOf(state)[0]!.grid[0]).toEqual(["Far", "1", "2"]);
  });

  it("replaces a Hand-drawn Table's own Region rather than adding a second", () => {
    const first = redraw(open([solo]), 0, 1, [60, 690, 560, 760]);
    const again = redraw(first, 0, 1, [60, 670, 560, 760]);
    expect(again.documents[0]!.regions).toHaveLength(1);
    expect(tablesOf(again)).toHaveLength(1);
    expect(tablesOf(again)[0]!.grid).toHaveLength(3);
    expect(selectedTable(again)).toBe(tablesOf(again)[0]);
  });

  it("keeps the replaced Detected Table hidden when the Hand-drawn Table is redrawn away from it", () => {
    const first = redraw(open([withStray]), 0, 1, [60, 690, 560, 760]);
    const moved = redraw(first, 0, 1, [60, 395, 560, 412]);
    expect(tablesOf(moved)).toHaveLength(1);
    expect(tablesOf(moved)[0]!.grid[0]).toEqual(["Far", "1", "2"]);
  });

  it("agrees with the 30% rule: a Region over most of a Detected Table drops it either way", () => {
    const drawn = run(
      open([solo]),
      { type: "regionStarted", documentId: "d", page: 1 },
      { type: "regionChanged", page: 1, bbox: [60, 690, 560, 760] },
      { type: "regionCommitted" },
    );
    expect(kind(drawn)).toEqual([true]);
    expect(kind(redraw(open([solo]), 0, 1, [60, 690, 560, 760]))).toEqual([true]);
  });

  it("brings the Detected Table back when the Hand-drawn Table that replaced it is removed", () => {
    const hand = redraw(open([solo]), 0, 1, [60, 690, 560, 760]);
    const tableId = tablesOf(hand)[0]!.id;
    const gone = reduce(hand, { type: "tableRemoved", documentId: "d", tableId });
    expect(kind(gone)).toEqual([false]);
  });

  it("ignores an unknown Table", () => {
    const state = reduce(open([solo]), {
      type: "regionStarted",
      documentId: "d",
      page: 1,
      tableId: "nope",
    });
    expect(state.region).toBeNull();
  });
});

describe("redrawing one Part of a Joined Table", () => {
  it("replaces just that Part, leaving the other Part on its own (two Parts)", () => {
    expect(pagesOf(open(two))).toEqual([[1, 2]]);
    const state = redraw(open(two), 0, 2, [60, 700, 560, 760]);
    expect(pagesOf(state)).toEqual([[1], [2]]);
    expect(kind(state)).toEqual([false, true]);
    expect(tablesOf(state)[0]!.grid).toEqual([HEAD, ["Bolt", "4", "1.20"]]);
  });

  it("replaces the first Part and leaves the second standing alone", () => {
    const state = redraw(open(two), 0, 1, [60, 120, 560, 180]);
    expect(pagesOf(state)).toEqual([[1], [2]]);
    expect(kind(state)).toEqual([true, false]);
    // The remaining Part keeps its own Header Row; nothing was dropped as a repeat.
    expect(tablesOf(state)[1]!.repeats).toBe(0);
    expect(tablesOf(state)[1]!.grid[0]).toEqual(HEAD);
  });

  it("does not rejoin the remaining Parts of a three-Part Table", () => {
    expect(pagesOf(open(three))).toEqual([[1, 2, 3]]);
    const state = redraw(open(three), 0, 1, [60, 120, 560, 180]);
    expect(pagesOf(state)).toEqual([[1], [2], [3]]);
    expect(kind(state)).toEqual([true, false, false]);
  });

  it("splits around a replaced middle Part", () => {
    const state = redraw(open(three), 0, 2, [60, 700, 560, 760]);
    expect(pagesOf(state)).toEqual([[1], [2], [3]]);
    expect(kind(state)).toEqual([false, true, false]);
  });

  it("opens on the Part of the page asked for", () => {
    const state = open(two);
    const started = reduce(state, {
      type: "regionStarted",
      documentId: "d",
      page: 2,
      tableId: tablesOf(state)[0]!.id,
    });
    expect(started.region).toMatchObject({ page: 2, bbox: tablesOf(state)[0]!.parts[1]!.bbox });
  });

  it("stays split when joining or Column Spacing re-detects", () => {
    const state = redraw(open(two), 0, 2, [60, 700, 560, 760]);
    const off = reduce(state, { type: "joinChanged", value: false });
    const on = reduce(off, { type: "joinChanged", value: true });
    expect(pagesOf(on)).toEqual([[1], [2]]);
    expect(pagesOf(reduce(on, { type: "columnSpacingChanged", value: 1.2 }))).toEqual([[1], [2]]);
  });

  it("joins again once the Hand-drawn Table is removed", () => {
    const state = redraw(open(two), 0, 2, [60, 700, 560, 760]);
    const tableId = tablesOf(state)[1]!.id;
    const gone = reduce(state, { type: "tableRemoved", documentId: "d", tableId });
    expect(pagesOf(gone)).toEqual([[1, 2]]);
  });
});

describe("the edit warning", () => {
  it("asks before a redraw discards corrections, then applies on confirmation", () => {
    const asked = redraw(edit(open([solo])), 0, 1, [60, 690, 560, 760]);
    expect(asked.pendingChange?.type).toBe("regionCommitted");
    expect(kind(asked)).toEqual([false]);
    const done = reduce(asked, { type: "changeConfirmed" });
    expect(kind(done)).toEqual([true]);
    expect(done.pendingChange).toBeNull();
    expect(selectedTable(done)!.manual).not.toBeNull();
  });

  it("changes nothing when cancelled", () => {
    const asked = redraw(edit(open([solo])), 0, 1, [60, 690, 560, 760]);
    const cancelled = reduce(asked, { type: "changeCancelled" });
    expect(kind(cancelled)).toEqual([false]);
    expect(tablesOf(cancelled)[0]!.edited).toBe(true);
  });
});
