// Seam A: Combine with Row above / below, through the workspace reducer and export.
import { describe, expect, it } from "vitest";
import {
  exportTable,
  initialWorkspace,
  reduce,
  selectedTable,
  tableSize,
  type PageText,
  type Table,
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
  cells.map((c, i) => (c ? at(c, XS[i]!, y, bold) : null)).filter((t) => t !== null);
const page = (num: number, items: TextItem[]): PageText => ({ num, w: 612, h: 792, items });

const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
const open = (pages: PageText[]) =>
  run(
    initialWorkspace,
    { type: "documentAdded", id: "d", name: "d.pdf", size: 1 },
    { type: "documentRead", id: "d", pages },
  );
const combine = (s: WorkspaceState, r: number, direction: "above" | "below") =>
  reduce(s, {
    type: "rowCombined",
    documentId: "d",
    tableId: selectedTable(s)!.id,
    row: r,
    direction,
  });
const toggle = (s: WorkspaceState, r: number) =>
  reduce(s, {
    type: "sectionHeaderToggled",
    documentId: "d",
    tableId: selectedTable(s)!.id,
    row: r,
  });

/** A plain Table: a Header Row and three Rows, the second split over two lines. */
const plain = () =>
  open([
    page(1, [
      ...row(710, ["Store", "Region", "Q1"], true),
      ...row(696, ["Portland", "West", "412.8"]),
      ...row(682, ["Austin", "South", "1,204"]),
      ...row(668, ["Boise", "", "77.0"]),
    ]),
  ]);

/** A Table with two Section Headers: West (row 1), and a lone 903.5 in the Q1 column (row 4). */
const sectioned = () =>
  open([
    page(1, [
      ...row(710, ["Store", "Region", "Q1"], true),
      ...row(696, ["West"]),
      ...row(682, ["Portland", "West", "412.8"]),
      ...row(668, ["Austin", "South", "1,204"]),
      ...row(654, ["", "", "903.5"]),
      ...row(640, ["Boise", "East", "77.0"]),
    ]),
  ]);

const grid = (s: WorkspaceState) => selectedTable(s)!.grid;

describe("Combine with Row below", () => {
  it("joins each column's text with a single space, upper Row first, in the upper Row's place", () => {
    const s = combine(plain(), 2, "below");
    expect(grid(s)).toEqual([
      ["Store", "Region", "Q1"],
      ["Portland", "West", "412.8"],
      ["Austin Boise", "South", "1,204 77.0"],
    ]);
  });

  it("adds no space beside an empty Cell", () => {
    expect(grid(combine(plain(), 2, "below"))[2]![1]).toBe("South");
  });

  it("is a correction: the Table is edited", () => {
    expect(selectedTable(plain())!.edited).toBe(false);
    expect(selectedTable(combine(plain(), 1, "below"))!.edited).toBe(true);
  });

  it("does nothing on the last Row or a Row that does not exist", () => {
    const s = plain();
    expect(combine(s, 3, "below")).toBe(s);
    expect(combine(s, 9, "below")).toBe(s);
  });
});

describe("Combine with Row above", () => {
  it("gives the same Row as combining the Row above with the Row below", () => {
    expect(grid(combine(plain(), 3, "above"))).toEqual(grid(combine(plain(), 2, "below")));
  });

  it("does nothing on the first Row", () => {
    const s = plain();
    expect(combine(s, 0, "above")).toBe(s);
  });

  it("keeps the Table selected", () => {
    const s = plain();
    expect(combine(s, 3, "above").selection).toEqual(s.selection);
  });
});

describe("Combine and Section Headers", () => {
  it("unmarks a Section Header combined into a Row, its text back in its own column", () => {
    const s = sectioned();
    expect(selectedTable(s)!.sections).toEqual([1, 4]);
    const t = selectedTable(combine(s, 5, "above"))!;
    expect(t.grid[4]).toEqual(["Boise", "East", "903.5 77.0"]);
    expect(t.sections).toEqual([1]);
    expect(t.sectionCells[4]).toBeUndefined();
  });

  it("unmarks a Section Header that takes the Row below into it", () => {
    const t = selectedTable(combine(sectioned(), 1, "below"))!;
    expect(t.grid[1]).toEqual(["West Portland", "West", "412.8"]);
    expect(t.sections).toEqual([3]);
  });

  it("moves later Section Headers and their Cells up by one Row", () => {
    const s = sectioned();
    const before = selectedTable(s)!.sectionCells[4];
    const t = selectedTable(combine(s, 2, "below"))!;
    expect(t.grid.map((r) => r[0])).toEqual(["Store", "West", "Portland Austin", "903.5", "Boise"]);
    expect(t.sections).toEqual([1, 3]);
    expect(t.sectionCells[3]).toEqual(before);
    // Unmarking the moved Section Header still gives its own Cells back.
    expect(selectedTable(toggle(combine(s, 2, "below"), 3))!.grid[3]).toEqual(["", "", "903.5"]);
    expect(tableSize(t)).toEqual({ rows: 2, cols: 3 });
  });

  it("leaves earlier Section Headers where they are", () => {
    const t = selectedTable(combine(sectioned(), 5, "above"))!;
    expect(t.sections).toEqual([1]);
    expect(t.grid[1]).toEqual(["West", "", ""]);
  });
});

describe("Combine into the Header Row", () => {
  const twoLineHeader = () =>
    open([
      page(1, [
        ...row(710, ["Store", "Region", "Amount"], true),
        ...row(696, ["", "", "(SGD)"], true),
        ...row(682, ["Portland", "West", "412.8"]),
        ...row(668, ["Austin", "South", "1,204"]),
      ]),
    ]);

  it("is allowed, and the combined heading is used by every export", () => {
    const s0 = twoLineHeader();
    expect(selectedTable(s0)!.header).toBe(true);
    // The lone "(SGD)" line reads as a Section Header; combining it into the Header Row unmarks it.
    expect(selectedTable(s0)!.sections).toEqual([1]);
    const t = selectedTable(combine(s0, 1, "above"))!;
    expect(t.grid[0]).toEqual(["Store", "Region", "Amount (SGD)"]);
    expect(t.header).toBe(true);
    expect(t.sections).toEqual([]);
    expect(exportTable(t, "csv")).toBe(
      'Store,Region,Amount (SGD)\nPortland,West,412.8\nAustin,South,"1,204"',
    );
    expect(JSON.parse(exportTable(t, "json"))).toEqual([
      { Store: "Portland", Region: "West", "Amount (SGD)": "412.8" },
      { Store: "Austin", Region: "South", "Amount (SGD)": "1,204" },
    ]);
    expect(exportTable(t, "md").split("\n")[0]).toBe("| Store | Region | Amount (SGD) |");
    expect(exportTable(t, "tsv").split("\n")[0]).toBe("Store\tRegion\tAmount (SGD)");
  });
});

describe("Combine across the Parts of a Joined Table", () => {
  const HEAD = ["Item", "Qty", "Price"];
  const joined = () =>
    open([
      page(1, [
        ...row(164, HEAD, true),
        ...row(150, ["Bolt", "4", "1.20"]),
        ...row(136, ["Long nut", "9", ""]),
      ]),
      page(2, [
        ...row(734, HEAD, true),
        ...row(720, ["washer", "", "0.40"]),
        ...row(706, ["Screw", "7", "0.10"]),
      ]),
    ]);

  it("mends a Row split by the page break", () => {
    const s0 = joined();
    const t0 = selectedTable(s0)!;
    expect(t0.parts.map((p) => p.page)).toEqual([1, 2]);
    const r = t0.grid.findIndex((cells) => cells.includes("Long nut"));
    const t = selectedTable(combine(s0, r, "below"))!;
    expect(t.grid.map((cells) => cells.join("|"))).toEqual([
      "Item|Qty|Price",
      "Bolt|4|1.20",
      "Long nut washer|9|0.40",
      "Screw|7|0.10",
    ]);
    expect(t.sections).toEqual([]);
    expect(t.parts).toEqual(t0.parts);
  });
});

describe("Combine and the edit warning", () => {
  it("makes re-detection wait for confirmation, which discards the Combine", () => {
    const combined = combine(plain(), 2, "below");
    const pending = reduce(combined, { type: "columnSpacingChanged", value: 1.5 });
    expect(pending.pendingChange).toMatchObject({ type: "columnSpacingChanged" });
    expect(grid(pending)).toEqual(grid(combined));
    const confirmed = reduce(pending, { type: "changeConfirmed" });
    expect(grid(confirmed)).toEqual(grid(plain()));
    expect(selectedTable(confirmed)!.edited).toBe(false);
  });

  it("does not re-detect by itself", () => {
    const s = combine(plain(), 2, "below");
    expect(s.pendingChange).toBeNull();
    expect(s.documents[0]!.tables.length).toBe(1);
  });
});

describe("exports after a Combine", () => {
  const t = () => selectedTable(combine(sectioned(), 2, "below"))!;

  it.each([
    [
      "csv",
      "column",
      'Section,Store,Region,Q1\nWest,Portland Austin,West South,"412.8 1,204"\n903.5,Boise,East,77.0',
    ],
    [
      "csv",
      "rows",
      'Store,Region,Q1\nWest,,\nPortland Austin,West South,"412.8 1,204"\n903.5,,\nBoise,East,77.0',
    ],
    [
      "tsv",
      "column",
      "Section\tStore\tRegion\tQ1\nWest\tPortland Austin\tWest South\t412.8 1,204\n903.5\tBoise\tEast\t77.0",
    ],
    [
      "tsv",
      "rows",
      "Store\tRegion\tQ1\nWest\t\t\nPortland Austin\tWest South\t412.8 1,204\n903.5\t\t\nBoise\tEast\t77.0",
    ],
  ] as const)("%s %s", (format, mode, expected) => {
    expect(exportTable(t(), format, mode)).toBe(expected);
  });

  it("md in both Section Modes", () => {
    expect(exportTable(t(), "md", "column")).toContain(
      "| West | Portland Austin | West South | 412.8 1,204 |",
    );
    expect(exportTable(t(), "md", "rows")).toContain(
      "| Portland Austin | West South | 412.8 1,204 |",
    );
    expect(exportTable(t(), "md", "rows")).toContain("| **903.5** | | |");
  });

  it("json in both Section Modes", () => {
    expect(JSON.parse(exportTable(t(), "json", "column"))).toEqual([
      { Section: "West", Store: "Portland Austin", Region: "West South", Q1: "412.8 1,204" },
      { Section: "903.5", Store: "Boise", Region: "East", Q1: "77.0" },
    ]);
    expect(JSON.parse(exportTable(t(), "json", "rows"))).toEqual([
      {
        section: "West",
        rows: [{ Store: "Portland Austin", Region: "West South", Q1: "412.8 1,204" }],
      },
      { section: "903.5", rows: [{ Store: "Boise", Region: "East", Q1: "77.0" }] },
    ]);
  });
});

describe("a combined Row remembers the Rows it came from", () => {
  const memory = (t: Table, r: number) => t.combined[r];

  it("keeps both Rows as they stood, Section Header marks included", () => {
    const s = sectioned();
    const before = selectedTable(s)!;
    const t = selectedTable(combine(s, 5, "above"))!;
    expect(memory(t, 4)).toEqual({
      upper: {
        cells: before.grid[4],
        section: true,
        sectionCells: before.sectionCells[4],
        combined: null,
      },
      lower: { cells: before.grid[5], section: false, sectionCells: null, combined: null },
    });
  });

  it("keeps one Combine at a time: an earlier Combine is kept inside the later one", () => {
    const once = combine(plain(), 2, "below");
    const first = memory(selectedTable(once)!, 2)!;
    const twice = selectedTable(combine(once, 2, "above"))!;
    expect(twice.grid[1]).toEqual(["Portland Austin Boise", "West South", "412.8 1,204 77.0"]);
    expect(memory(twice, 1)!.lower.combined).toEqual(first);
    expect(memory(twice, 1)!.upper.combined).toBeNull();
    expect(memory(twice, 2)).toBeUndefined();
  });

  it("moves with its Row when a Combine above it removes a Row", () => {
    const once = combine(sectioned(), 4, "below");
    const kept = memory(selectedTable(once)!, 4)!;
    const t = selectedTable(combine(once, 2, "below"))!;
    expect(memory(t, 3)).toEqual(kept);
    expect(memory(t, 4)).toBeUndefined();
  });
});
