// Seam A: Joined Tables through the workspace reducer and export.
import { describe, expect, it } from "vitest";
import {
  exportTable,
  initialWorkspace,
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
const XS = [72, 200, 320];
const row = (y: number, cells: string[], bold = false) =>
  cells.map((c, i) => at(c, XS[i]!, y, bold));
const page = (num: number, items: TextItem[]): PageText => ({ num, w: 612, h: 792, items });

const HEAD = ["Item", "Qty", "Price"];
/** A table that runs to the foot of the page, and one that starts at the top of the next. */
const foot = (rows: string[][], head = HEAD) =>
  rows.reduce<TextItem[]>(
    (items, r, i) => [...items, ...row(150 - i * 14, r)],
    row(164, head, true),
  );
const top = (rows: string[][], head: string[] | null = HEAD) =>
  rows.reduce<TextItem[]>(
    (items, r, i) => [...items, ...row(720 - i * 14, r)],
    head ? row(734, head, true) : [],
  );

const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
const open = (pages: PageText[], state = initialWorkspace) =>
  run(
    state,
    { type: "documentAdded", id: "d", name: "d.pdf", size: 1 },
    { type: "documentRead", id: "d", pages },
  );
const tablesOf = (state: WorkspaceState) => state.documents[0]!.tables;
const joinOff = (state: WorkspaceState) => reduce(state, { type: "joinChanged", value: false });
const joinOn = (state: WorkspaceState) => reduce(state, { type: "joinChanged", value: true });

const continued = [
  page(
    1,
    foot([
      ["Bolt", "4", "1.20"],
      ["Nut", "9", "0.40"],
    ]),
  ),
  page(
    2,
    top([
      ["Screw", "7", "0.10"],
      ["Washer", "3", "0.05"],
    ]),
  ),
];

describe("joining", () => {
  it("stitches a table that continues onto the next page and drops the repeated Header Row", () => {
    const [t, ...rest] = tablesOf(open(continued));
    expect(rest).toEqual([]);
    expect(t!.parts.map((p) => p.page)).toEqual([1, 2]);
    expect(t!.repeats).toBe(1);
    expect(t!.grid.map((r) => r[0])).toEqual(["Item", "Bolt", "Nut", "Screw", "Washer"]);
  });

  it("keeps a continuation that has no header of its own", () => {
    const rows = [
      ["Screw", "7", "0.10"],
      ["Washer", "3", "0.05"],
    ];
    const state = open([continued[0]!, page(2, top(rows, null))]);
    const [t] = tablesOf(state);
    expect(t!.repeats).toBe(0);
    expect(t!.grid.map((r) => r[0])).toEqual(["Item", "Bolt", "Nut", "Screw", "Washer"]);
  });

  it("keeps tables apart when the next page opens with a different bold header", () => {
    const other = ["Name", "Age", "City"];
    const state = open([
      continued[0]!,
      page(
        2,
        top(
          [
            ["Ann", "31", "Oslo"],
            ["Bo", "28", "Rome"],
          ],
          other,
        ),
      ),
    ]);
    expect(tablesOf(state)).toHaveLength(2);
  });

  it("keeps tables apart when body text sits between them", () => {
    const prose = [
      at("Notes on the figures above.", 72, 100),
      at("More notes follow here.", 72, 80),
    ];
    const three = [at("a", 72, 70), at("b", 72, 60), at("c", 72, 50)];
    const state = open([page(1, [...continued[0]!.items, ...prose, ...three]), continued[1]!]);
    expect(tablesOf(state)).toHaveLength(2);
  });

  it("does not join pages that are not consecutive", () => {
    const state = open([continued[0]!, page(2, []), { ...continued[1]!, num: 3 }]);
    expect(tablesOf(state)).toHaveLength(2);
  });

  it("joins across three pages", () => {
    const state = open([...continued, { ...continued[1]!, num: 3 }]);
    expect(tablesOf(state)[0]!.parts.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(tablesOf(state)[0]!.repeats).toBe(2);
  });

  it("exports a Joined Table as one continuous table in both Section Modes", () => {
    const t = tablesOf(open(continued))[0]!;
    expect(exportTable(t, "csv", "column")).toBe(
      "Item,Qty,Price\nBolt,4,1.20\nNut,9,0.40\nScrew,7,0.10\nWasher,3,0.05",
    );
    expect(exportTable(t, "csv", "rows")).toBe(exportTable(t, "csv", "column"));
  });

  it("carries a section across the page break", () => {
    const first = page(1, [
      ...row(164, HEAD, true),
      ...[at("Hardware", 72, 150)],
      ...row(136, ["Bolt", "4", "1.20"]),
      ...row(122, ["Nut", "9", "0.40"]),
    ]);
    const second = page(2, [
      ...row(734, HEAD, true),
      ...row(720, ["Screw", "7", "0.10"]),
      at("Tools", 72, 706),
      ...row(692, ["Saw", "1", "9.00"]),
    ]);
    const t = tablesOf(open([first, second]))[0]!;
    expect(t.parts).toHaveLength(2);
    expect(t.sections).toEqual([1, 5]);
    expect(exportTable(t, "csv", "column")).toBe(
      [
        "Section,Item,Qty,Price",
        "Hardware,Bolt,4,1.20",
        "Hardware,Nut,9,0.40",
        "Hardware,Screw,7,0.10",
        "Tools,Saw,1,9.00",
      ].join("\n"),
    );
    expect(exportTable(t, "csv", "rows").split("\n")).toEqual([
      "Item,Qty,Price",
      "Hardware,,",
      "Bolt,4,1.20",
      "Nut,9,0.40",
      "Screw,7,0.10",
      "Tools,,",
      "Saw,1,9.00",
    ]);
  });
});

describe("the join switch", () => {
  it("is on by default and splits the table when switched off", () => {
    const on = open(continued);
    expect(on.settings.join).toBe(true);
    const off = joinOff(on);
    expect(off.settings.join).toBe(false);
    expect(tablesOf(off).map((t) => t.parts.length)).toEqual([1, 1]);
    expect(tablesOf(off).map((t) => t.n)).toEqual([1, 2]);
    expect(tablesOf(joinOn(off))[0]!.parts).toHaveLength(2);
  });

  it("ignores a no-op", () => {
    const on = open(continued);
    expect(joinOn(on)).toBe(on);
  });

  it("re-detects every Document", () => {
    const both = run(
      open(continued),
      { type: "documentAdded", id: "e", name: "e.pdf", size: 1 },
      { type: "documentRead", id: "e", pages: continued },
      { type: "joinChanged", value: false },
    );
    expect(both.documents.map((d) => d.tables.length)).toEqual([2, 2]);
  });

  it("warns before discarding corrections, then applies on confirmation", () => {
    const edited = run(open(continued), {
      type: "cellEdited",
      documentId: "d",
      tableId: tablesOf(open(continued))[0]!.id,
      row: 1,
      col: 0,
      value: "Bolts",
    });
    const asked = joinOff(edited);
    expect(asked.settings.join).toBe(true);
    expect(asked.pendingChange).toEqual({ type: "joinChanged", value: false });
    expect(tablesOf(asked)).toHaveLength(1);

    const cancelled = reduce(asked, { type: "changeCancelled" });
    expect(cancelled.settings.join).toBe(true);
    expect(tablesOf(cancelled)[0]!.grid[1]![0]).toBe("Bolts");

    const confirmed = reduce(asked, { type: "changeConfirmed" });
    expect(confirmed.settings.join).toBe(false);
    expect(confirmed.pendingChange).toBeNull();
    expect(tablesOf(confirmed)).toHaveLength(2);
  });
});

describe("selection through joining", () => {
  it("follows the selected Table when pages join and split", () => {
    const off = joinOff(open(continued));
    const [, second] = tablesOf(off);
    const onSecond = reduce(off, { type: "tableSelected", documentId: "d", tableId: second!.id });
    const joined = joinOn(onSecond);
    expect(selectedTable(joined)).toBe(tablesOf(joined)[0]);
    const split = joinOff(joined);
    expect(selectedTable(split)).toBe(tablesOf(split)[0]);
  });
});

describe("with Removed Tables", () => {
  it("removing a Joined Table hides all its Parts, with joining on or off", () => {
    const opened = open(continued);
    const removed = reduce(opened, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(opened)[0]!.id,
    });
    expect(tablesOf(removed)).toEqual([]);
    expect(removed.documents[0]!.removed[0]!.parts).toHaveLength(2);
    expect(tablesOf(joinOff(removed))).toEqual([]);
    expect(tablesOf(joinOn(joinOff(removed)))).toEqual([]);
  });

  it("restoring a Joined Table brings every Part back, joined", () => {
    const opened = open(continued);
    const removed = reduce(opened, {
      type: "tableRemoved",
      documentId: "d",
      tableId: tablesOf(opened)[0]!.id,
    });
    const back = reduce(removed, {
      type: "tableRestored",
      documentId: "d",
      removedId: removed.documents[0]!.removed[0]!.id,
    });
    expect(tablesOf(back)[0]!.parts).toHaveLength(2);
  });

  it("a Table removed while joining was off stays removed, and its neighbour stays alone", () => {
    const off = joinOff(open(continued));
    const first = tablesOf(off)[0]!;
    const removed = reduce(off, { type: "tableRemoved", documentId: "d", tableId: first.id });
    const on = joinOn(removed);
    expect(tablesOf(on)).toHaveLength(1);
    expect(tablesOf(on)[0]!.parts.map((p) => p.page)).toEqual([2]);
  });
});

describe("with Hand-drawn Tables", () => {
  const draw = (state: WorkspaceState, pageNum: number, bbox: [number, number, number, number]) =>
    run(
      state,
      { type: "regionStarted", documentId: "d", page: pageNum },
      { type: "regionChanged", page: pageNum, bbox },
      { type: "regionCommitted" },
    );

  it("splits a Joined Table it covers and is never joined itself", () => {
    const state = draw(open(continued), 2, [60, 600, 500, 760]);
    const tables = tablesOf(state);
    expect(tables.map((t) => t.parts.map((p) => p.page))).toEqual([[1], [2]]);
    expect(tables.map((t) => t.manual !== null)).toEqual([false, true]);
    expect(tablesOf(joinOff(state)).map((t) => t.manual !== null)).toEqual([false, true]);
  });

  it("is not joined to the Table on the page before when joining turns on again", () => {
    const state = joinOn(joinOff(draw(open(continued), 2, [60, 600, 500, 760])));
    expect(tablesOf(state).map((t) => t.parts.length)).toEqual([1, 1]);
  });

  it("keeps the Hand-drawn Table selected while joining toggles", () => {
    const state = draw(open(continued), 2, [60, 600, 500, 760]);
    const hand = selectedTable(state)!;
    expect(hand.manual).not.toBeNull();
    expect(selectedTable(joinOff(state))!.manual).toBe(hand.manual);
  });
});
