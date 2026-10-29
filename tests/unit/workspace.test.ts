// Seam A: the workspace reducer plus export. Dispatch actions, assert on Tables and export text.
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

/** A text item at a baseline y; 9 pt text, about 5 pt per character. */
const at = (str: string, x: number, y: number, bold = false): TextItem => ({
  str,
  x,
  y,
  w: str.length * 5,
  h: 9,
  bold,
});

/** A row of cells, one per column x position. */
const row = (y: number, cells: string[], bold = false, xs = [72, 200, 320, 440]) =>
  cells.map((c, i) => at(c, xs[i]!, y, bold));

const page = (num: number, items: TextItem[]): PageText => ({ num, w: 612, h: 792, items });

const stores = page(1, [
  at("Quarterly results", 72, 740, true),
  ...row(710, ["Store", "Region", "Q1", "Q2"], true),
  ...row(696, ["Portland", "West", "412.8", "430.1"]),
  ...row(682, ["Austin", "South", "1,204", "1,180"]),
  at("Figures in thousands of dollars.", 72, 640),
]);

const run = (...actions: WorkspaceAction[]) => actions.reduce(reduce, initialWorkspace);

const opened = (pages: PageText[], id = "d1"): WorkspaceState =>
  run(
    { type: "documentAdded", id, name: "results.pdf", size: 2048 },
    { type: "documentRead", id, pages },
  );

describe("opening a Document", () => {
  it("lists a Document as loading until it has been read", () => {
    const state = run({ type: "documentAdded", id: "d1", name: "results.pdf", size: 2048 });

    expect(state.documents).toEqual([
      expect.objectContaining({ id: "d1", name: "results.pdf", status: "loading", tables: [] }),
    ]);
    expect(selectedTable(state)).toBeNull();
  });

  it("detects the Tables once it is read, leaving out the title and footnote", () => {
    const state = opened([stores]);

    const [doc] = state.documents;
    expect(doc!.status).toBe("ready");
    expect(doc!.tables).toHaveLength(1);
    expect(doc!.tables[0]!.grid).toEqual([
      ["Store", "Region", "Q1", "Q2"],
      ["Portland", "West", "412.8", "430.1"],
      ["Austin", "South", "1,204", "1,180"],
    ]);
  });

  it("selects the first Table and reports its page and size (US-37)", () => {
    const state = opened([stores]);

    const table = selectedTable(state)!;
    expect(table.n).toBe(1);
    expect(table.parts.map((p) => p.page)).toEqual([1]);
    expect(tableSize(table)).toEqual({ rows: 2, cols: 4 });
  });

  it("keeps two tables on one page apart, numbered top to bottom (US-16)", () => {
    const twoTables = page(1, [
      ...row(710, ["Store", "Region"], true),
      ...row(696, ["Portland", "West"]),
      ...row(682, ["Austin", "South"]),
      at("Staffing changed in the second half of the year, as described below.", 72, 600),
      ...row(520, ["Team", "Lead", "Size"], true),
      ...row(506, ["Ops", "Kim", "4"]),
      ...row(492, ["Sales", "Lee", "7"]),
    ]);

    const tables = opened([twoTables]).documents[0]!.tables;

    expect(tables.map((t) => [t.n, t.grid[0]])).toEqual([
      [1, ["Store", "Region"]],
      [2, ["Team", "Lead", "Size"]],
    ]);
  });

  it("finds no Tables on a page of prose", () => {
    const prose = page(1, [at("Just a paragraph.", 72, 700), at("And another.", 72, 686)]);

    const state = opened([prose]);

    expect(state.documents[0]!.tables).toEqual([]);
    expect(selectedTable(state)).toBeNull();
  });

  it("keeps the current selection when another Document is read", () => {
    const first = opened([stores]);
    const before = selectedTable(first);

    const actions: WorkspaceAction[] = [
      { type: "documentAdded", id: "d2", name: "other.pdf", size: 10 },
      { type: "documentRead", id: "d2", pages: [stores] },
    ];
    const state = actions.reduce(reduce, first);

    expect(selectedTable(state)).toBe(before);
  });
});

describe("selecting a Table", () => {
  it("shows the Table the user picked", () => {
    const twoPages = [stores, { ...stores, num: 2 }];
    // Joining off, so the two identical pages stay two Tables.
    const state = reduce(opened(twoPages), { type: "joinChanged", value: false });
    const second = state.documents[0]!.tables[1]!;

    const next = reduce(state, { type: "tableSelected", documentId: "d1", tableId: second.id });

    expect(selectedTable(next)).toBe(second);
  });

  it("ignores a Table that no longer exists", () => {
    const state = opened([stores]);

    const next = reduce(state, { type: "tableSelected", documentId: "d1", tableId: "gone" });

    expect(next).toBe(state);
  });
});

describe("exporting CSV", () => {
  it("writes one line per row, quoting cells with commas or quotes", () => {
    const quoted = page(1, [
      ...row(710, ["Item", "Note"], true),
      ...row(696, ["Bolt", 'Size "M6"']),
      ...row(682, ["Nut", "1,000 pack"]),
    ]);

    const table = selectedTable(opened([quoted]))!;

    expect(exportTable(table, "csv")).toBe('Item,Note\nBolt,"Size ""M6"""\nNut,"1,000 pack"');
  });
});
