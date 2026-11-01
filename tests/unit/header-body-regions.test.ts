// Seam A: a Header Region and Body Regions on one page (spec #39), through the workspace reducer
// and export.
//
// These are the acceptance tests for #42 to #45, written before the feature exists. Most run
// against tests/fixtures/parts-list-drawing.pdf (invented data; layout in
// scripts/fixtures/make-fixtures.mjs), read through the PDF Reader:
// - page 1: a framed band of two-line column titles (ITEM, PART NUMBER, DESCRIPTION, QTY,
//   MATERIAL SPEC) above the Rows, a stray line between, items 1 to 3, a note cutting through the
//   list, items 4 to 6, and a title block below;
// - page 2: items 5 down to 1 (numbered upward from the bottom), a note between item 3 and item 2,
//   then the same titles in a framed band below the Rows, next to the title block.
// The edge cases use small hand-written pages.
//
// A pending test is an `it.skip` named after the ticket that turns it on (`#42:` to `#45:`). That
// ticket replaces `it.skip` with `it` and makes it pass without changing what it expects.
//
// The actions below do not exist yet. Their names are provisional: the ticket that adds each one
// (#40 for the list of Regions, #42 for roles) may rename it, and then changes `act` and the
// helpers here, not the expectations. The edited Region is the one `regionChanged` moves.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  exportTable,
  initialWorkspace,
  reduce,
  selectedTable,
  type Bbox,
  type PageText,
  type Table,
  type TextItem,
  type WorkspaceAction,
  type WorkspaceState,
} from "../../src/engine";
import { root } from "./support/golden";
import { readDocument } from "./support/node-reader";

// --- parts-list-drawing.pdf -----------------------------------------------------------------------

const TITLES = ["ITEM", "PART NUMBER", "DESCRIPTION", "QTY", "MATERIAL SPEC"];
const ROWS_1_3 = [
  ["1", "BK-1001", "BASE PLATE", "1", "STEEL S235"],
  ["2", "BK-1002", "SUPPORT BRACKET", "2", "STEEL S235"],
  ["3", "BK-1003", "SPACER SLEEVE", "4", "ALUMINIUM"],
];
const ROWS_4_6 = [
  ["4", "FS-2010", "HEX BOLT M8X30", "8", "STAINLESS"],
  ["5", "FS-2011", "WASHER M8", "16", "STAINLESS"],
  ["6", "FS-2012", "LOCK NUT M8", "8", "STAINLESS"],
];
const PAGE2_ABOVE_NOTE = [
  ["5", "CV-3004", "COVER PANEL", "1", "ALUMINIUM"],
  ["4", "CV-3003", "HINGE PIN", "2", "STEEL S235"],
  ["3", "CV-3002", "GASKET", "1", "RUBBER"],
];
const PAGE2_BELOW_NOTE = [
  ["2", "CV-3001", "HANDLE GRIP", "2", "NYLON"],
  ["1", "CV-3000", "MOUNT FRAME", "1", "STEEL S235"],
];

/** Regions on the drawing (PDF points). The columns end at x 380; the title block starts at 410. */
const BOX = {
  /** Page 1: the framed band of titles. */
  titles1: [60, 682, 400, 716] as Bbox,
  /** Page 1: items 1 to 3, above the note. */
  rowsAboveNote1: [60, 606, 400, 648] as Bbox,
  /** Page 1: items 4 to 6, below the note. */
  rowsBelowNote1: [60, 522, 400, 560] as Bbox,
  /** Page 1: items 1 to 6 and the note between them. */
  rowsWithNote1: [60, 522, 400, 648] as Bbox,
  /** Page 2: the band of titles below the Rows, beside the title block. */
  titles2: [60, 550, 400, 574] as Bbox,
  /** Page 2: items 5 to 3, above the note. */
  rowsAboveNote2: [60, 664, 400, 706] as Bbox,
  /** Page 2: items 2 and 1, below the note. */
  rowsBelowNote2: [60, 596, 400, 625] as Bbox,
};
const NOTE = ["NOTE 1. DEBURR ALL EDGES AND", "BREAK SHARP CORNERS 0.5 MAX."];

let drawing: PageText[];

beforeAll(async () => {
  const bytes = new Uint8Array(
    readFileSync(join(root, "tests", "fixtures", "parts-list-drawing.pdf")),
  );
  const pages = await readDocument(bytes);
  if (typeof pages === "string") throw new Error(`the PDF Reader returned ${pages}`);
  drawing = pages;
});

// --- Helpers -------------------------------------------------------------------------------------

type Role = "header" | "body";
/** One Region to draw: its bounds and role. */
type Drawn = { bbox: Bbox; role?: Role; singleRow?: boolean };

/** Actions of the feature, which the reducer does not know yet. */
const act = (action: Record<string, unknown>) => action as unknown as WorkspaceAction;

const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
const opened = (input: PageText | PageText[]): WorkspaceState =>
  run(
    initialWorkspace,
    { type: "documentAdded", id: "d1", name: "d.pdf", size: 1 },
    { type: "documentRead", id: "d1", pages: [input].flat() },
  );
const tablesOf = (state: WorkspaceState): Table[] => state.documents[0]!.tables;

/** Select Region on `page`, with each Region added in order. The first is the one Select Region starts with. */
function drawAll(state: WorkspaceState, page: number, regions: Drawn[]): WorkspaceState {
  let s = run(state, { type: "regionStarted", documentId: "d1", page });
  regions.forEach((r, index) => {
    if (index > 0) s = run(s, act({ type: "regionAdded" }));
    s = run(s, { type: "regionChanged", page, bbox: r.bbox });
    if (r.role === "header") s = run(s, act({ type: "regionRoleChanged", index, role: "header" }));
    if (r.singleRow) s = run(s, act({ type: "regionSingleRowChanged", index, value: true }));
  });
  return s;
}
const saved = (pages: PageText | PageText[], page: number, regions: Drawn[]) =>
  run(drawAll(opened(pages), page, regions), { type: "regionCommitted" });
const tableOf = (pages: PageText | PageText[], page: number, regions: Drawn[]) =>
  selectedTable(saved(pages, page, regions))!;

const header = (bbox: Bbox): Drawn => ({ bbox, role: "header" });
const body = (bbox: Bbox, singleRow = false): Drawn => ({ bbox, role: "body", singleRow });

/** Hand-written text: y is the baseline, widths are 5 points a character. */
const t = (str: string, x: number, y: number, bold = false): TextItem => ({
  str,
  x,
  y,
  w: str.length * 5,
  h: 9,
  bold,
});
const line = (y: number, cells: string[], xs = [72, 200, 320]) =>
  cells.map((c, i) => t(c, xs[i]!, y));
const page1 = (items: TextItem[]): PageText => ({ num: 1, w: 612, h: 792, items });

/** Today's Rows for three columns, for the hand-written cases. */
const BODY = page1([
  ...line(600, ["Bolt", "4", "1.20"]),
  ...line(586, ["Nut", "9", "0.40"]),
  ...line(572, ["Pin", "7", "0.10"]),
]);
const BODY_BOX: Bbox = [60, 560, 560, 612];

// --- #42: a Header Region ------------------------------------------------------------------------

describe("a Header Region over the column titles", () => {
  it("#42: gives one Table with every title in its column, two-line titles in one Cell", () => {
    const table = tableOf(drawing, 1, [header(BOX.titles1), body(BOX.rowsAboveNote1)]);

    expect(table.manual).not.toBeNull();
    expect(table.grid).toEqual([TITLES, ...ROWS_1_3]);
    expect(table.header).toBe(true);
    expect(
      tablesOf(saved(drawing, 1, [header(BOX.titles1), body(BOX.rowsAboveNote1)])),
    ).toContainEqual(table);
  });

  it("#42: works with the titles below the Rows, next to the title block (page 2)", () => {
    const table = tableOf(drawing, 2, [body(BOX.rowsAboveNote2), header(BOX.titles2)]);

    expect(table.grid).toEqual([TITLES, ...PAGE2_ABOVE_NOTE]);
  });

  it("#42: keeps the Rows in page order, top to bottom, even though the items are numbered upward", () => {
    const table = tableOf(drawing, 2, [header(BOX.titles2), body(BOX.rowsAboveNote2)]);

    expect(table.grid.slice(1).map((r) => r[0])).toEqual(["5", "4", "3"]);
  });

  it("#42: puts a title that overlaps no column into the nearest column", () => {
    const stray = t("COST", 520, 640); // clear of every body column, nearest to the third
    const pages = [page1([stray, ...BODY.items])];
    const table = tableOf(pages, 1, [header([500, 632, 560, 652]), body(BODY_BOX)]);

    expect(table.grid[0]).toEqual(["", "", "COST"]);
  });

  it("#42: lets two titles over one column share its Cell", () => {
    const pages = [page1([t("UNIT", 320, 640), t("PRICE", 350, 640), ...BODY.items])];
    const table = tableOf(pages, 1, [header([300, 632, 420, 652]), body(BODY_BOX)]);

    expect(table.grid[0]).toEqual(["", "", "UNIT PRICE"]);
  });

  it("#42: gives text inside both a Header Region and a Body Region to the Header Row only", () => {
    const pages = [page1([t("Part", 72, 640, true), t("Qty", 200, 640, true), ...BODY.items])];
    // Both boxes take in the title line at y 640.
    const table = tableOf(pages, 1, [header([60, 630, 560, 652]), body([60, 560, 560, 652])]);

    expect(table.grid).toEqual([
      ["Part", "Qty", ""],
      ["Bolt", "4", "1.20"],
      ["Nut", "9", "0.40"],
      ["Pin", "7", "0.10"],
    ]);
  });

  it("#42: has only one Header Region: marking a second turns the first back to Body", () => {
    const state = drawAll(opened(drawing), 1, [
      header(BOX.titles1),
      body(BOX.rowsAboveNote1),
      body(BOX.rowsBelowNote1),
    ]);
    const second = run(state, act({ type: "regionRoleChanged", index: 2, role: "header" }));
    const roles = (second.region as unknown as { regions: { role: Role }[] }).regions.map(
      (r) => r.role,
    );

    expect(roles).toEqual(["body", "body", "header"]);
  });

  it("#42: cannot be saved while the Header Region holds no text", () => {
    const state = drawAll(opened(drawing), 1, [
      header([60, 440, 400, 470]), // blank part of the page
      body(BOX.rowsAboveNote1),
    ]);
    const after = run(state, { type: "regionCommitted" });

    expect(tablesOf(after).every((x) => x.manual === null)).toBe(true);
    expect(after.region).not.toBeNull(); // still in Select Region
  });

  it("#42: cannot be saved while no Body Region holds text, or with a Header Region alone", () => {
    for (const regions of [
      [header(BOX.titles1), body([60, 440, 400, 470])],
      [header(BOX.titles1)],
    ]) {
      const after = run(drawAll(opened(drawing), 1, regions), { type: "regionCommitted" });
      expect(tablesOf(after).every((x) => x.manual === null)).toBe(true);
      expect(after.region).not.toBeNull();
    }
  });

  it("#42: hides 'First row is header' on a Table with a Header Region, and leaves it as today without one", () => {
    const withHeader = tableOf(drawing, 1, [header(BOX.titles1), body(BOX.rowsAboveNote1)]);
    const alone = tableOf(drawing, 1, [body(BOX.rowsAboveNote1)]);

    // With a Header Region the Header Row is always the Header Region's text.
    expect(withHeader.header).toBe(true);
    expect(withHeader.grid[0]).toEqual(TITLES);
    // Without one, today's rule applies to the Body Rows: the first line is data, not titles.
    expect(alone.grid[0]).toEqual(ROWS_1_3[0]);
    // ...and 'First row is header' stays a setting of the Table, as today (headerToggled).
    expect(alone.manual).not.toBeNull();
  });

  it("#42: Select Whole Page sets the edited Region to the page, and Cancel discards every Region", () => {
    const state = drawAll(opened(drawing), 1, [header(BOX.titles1), body(BOX.rowsAboveNote1)]);
    const whole = run(state, { type: "wholePageSelected" });
    const regions = (whole.region as unknown as { regions: { bbox: Bbox }[] }).regions;

    expect(regions[1]!.bbox[2] - regions[1]!.bbox[0]).toBeGreaterThan(500);
    expect(regions[0]!.bbox).toEqual(BOX.titles1);
    expect(run(whole, { type: "regionCancelled" }).region).toBeNull();
    expect(tablesOf(run(whole, { type: "regionCancelled" })).every((x) => x.manual === null)).toBe(
      true,
    );
  });

  it("#42: rebuilds the Table from every Region when Column Spacing changes", () => {
    const state = saved(drawing, 1, [header(BOX.titles1), body(BOX.rowsAboveNote1)]);
    const wider = reduce(state, { type: "columnSpacingChanged", value: 2.6 });
    const table = selectedTable(wider)!;

    expect(table.manual).not.toBeNull();
    expect(table.grid[0]!.join(" ")).toBe(TITLES.join(" ")); // every title is still there
    expect(table.grid.length).toBe(4);
  });

  it("#42: asks before saving over corrected Cells, as a single Region does", () => {
    const first = saved(drawing, 1, [body(BOX.rowsAboveNote1)]);
    const edited = reduce(first, {
      type: "cellEdited",
      documentId: "d1",
      tableId: selectedTable(first)!.id,
      row: 1,
      col: 2,
      value: "Corrected",
    });
    const asked = run(drawAll(edited, 1, [header(BOX.titles1), body(BOX.rowsAboveNote1)]), {
      type: "regionCommitted",
    });

    expect(asked.pendingChange?.type).toBe("regionCommitted");
    const done = reduce(asked, { type: "changeConfirmed" });
    expect(selectedTable(done)!.grid[0]).toEqual(TITLES);
  });

  it("#42: copies the Header Row from the Header Region in CSV, TSV and Markdown", () => {
    const table = tableOf(drawing, 1, [header(BOX.titles1), body(BOX.rowsAboveNote1)]);

    expect(exportTable(table, "csv").split("\n")[0]).toBe(
      "ITEM,PART NUMBER,DESCRIPTION,QTY,MATERIAL SPEC",
    );
    expect(exportTable(table, "tsv").split("\n")[0]).toBe(
      "ITEM\tPART NUMBER\tDESCRIPTION\tQTY\tMATERIAL SPEC",
    );
    expect(exportTable(table, "md").split("\n")[0]).toContain("| ITEM | PART NUMBER |");
  });
});

// --- #43: several Body Regions -------------------------------------------------------------------

describe("several Body Regions down the page", () => {
  const either = [
    [
      "above the note first",
      [header(BOX.titles1), body(BOX.rowsAboveNote1), body(BOX.rowsBelowNote1)],
    ],
    [
      "below the note first",
      [header(BOX.titles1), body(BOX.rowsBelowNote1), body(BOX.rowsAboveNote1)],
    ],
  ] as const;

  it.skip("#43: leaves the note out, with every Row complete under one set of columns", () => {
    const table = tableOf(drawing, 1, [
      header(BOX.titles1),
      body(BOX.rowsAboveNote1),
      body(BOX.rowsBelowNote1),
    ]);

    expect(table.grid).toEqual([TITLES, ...ROWS_1_3, ...ROWS_4_6]);
    expect(table.cols).toHaveLength(5);
    expect(table.grid.flat().some((c) => NOTE.some((n) => c.includes(n.slice(0, 8))))).toBe(false);
  });

  it.skip("#43: gives the same Table whichever Region was drawn first, in page order", () => {
    const [above, below] = either.map(([, regions]) => tableOf(drawing, 1, [...regions]).grid);

    expect(below).toEqual(above);
    expect(above!.slice(1).map((r) => r[0])).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it.skip("#43: keeps top to bottom on page 2 too, where the items are numbered upward", () => {
    const table = tableOf(drawing, 2, [
      body(BOX.rowsBelowNote2),
      header(BOX.titles2),
      body(BOX.rowsAboveNote2),
    ]);

    expect(table.grid).toEqual([TITLES, ...PAGE2_ABOVE_NOTE, ...PAGE2_BELOW_NOTE]);
  });

  it.skip("#43: never lets a Row span two Body Regions, even when the gap between them is small", () => {
    // A two-line Row, cut between its lines by the boundary of two Regions: two Rows, as today.
    const wrapped = page1([
      ...line(600, ["Bracket", "2", "1.50"]),
      t("heavy duty", 72, 590),
      ...line(560, ["Washer", "9", "0.40"]),
    ]);
    const table = tableOf(wrapped, 1, [body([60, 595, 560, 612]), body([60, 550, 560, 593])]);

    expect(table.grid.map((r) => r[0])).toEqual(["Bracket", "heavy duty", "Washer"]);
  });

  it.skip("#43: counts text where two Body Regions overlap once", () => {
    const table = tableOf([BODY], 1, [body([60, 580, 560, 612]), body([60, 560, 560, 595])]);

    expect(table.grid).toEqual([
      ["Bolt", "4", "1.20"],
      ["Nut", "9", "0.40"],
      ["Pin", "7", "0.10"],
    ]);
  });

  it.skip("#43: ignores an empty Body Region next to one with text, and still saves", () => {
    const table = tableOf(drawing, 1, [
      header(BOX.titles1),
      body(BOX.rowsAboveNote1),
      body([60, 440, 400, 470]),
    ]);

    expect(table.grid).toEqual([TITLES, ...ROWS_1_3]);
  });

  it.skip("#43: finds Section Headers inside Body Regions as today", () => {
    const grouped = page1([
      t("WEST", 72, 640, true),
      ...line(626, ["Bolt", "4", "1.20"]),
      ...line(612, ["Nut", "9", "0.40"]),
      t("EAST", 72, 560, true),
      ...line(546, ["Pin", "7", "0.10"]),
      ...line(532, ["Cap", "2", "0.90"]),
    ]);
    const table = tableOf(grouped, 1, [body([60, 605, 560, 650]), body([60, 525, 560, 570])]);

    expect(table.sections).toEqual([0, 3]);
  });
});

// --- #44: Single-Row Body Regions ----------------------------------------------------------------

describe("a Single-Row switch on each Body Region", () => {
  /** One awkward Row over four lines, beside ordinary Rows. */
  const awkward = page1([
    ...line(640, ["Frame", "1", "10.00"]),
    t("welded, painted", 72, 630),
    t("and tagged", 72, 620),
    ...line(580, ["Bolt", "4", "1.20"]),
    ...line(566, ["Nut", "9", "0.40"]),
  ]);

  it.skip("#44: gives one Row for the Single-Row Region and normal Rows for the rest", () => {
    const table = tableOf(awkward, 1, [body([60, 612, 560, 652], true), body([60, 558, 560, 592])]);

    expect(table.grid).toEqual([
      ["Frame welded, painted and tagged", "1", "10.00"],
      ["Bolt", "4", "1.20"],
      ["Nut", "9", "0.40"],
    ]);
  });

  it.skip("#44: has the switch only on a Body Region, and restores it when a box returns to Body", () => {
    const state = drawAll(opened(awkward), 1, [body([60, 612, 560, 652], true)]);
    const asHeader = run(state, act({ type: "regionRoleChanged", index: 0, role: "header" }));
    const back = run(asHeader, act({ type: "regionRoleChanged", index: 0, role: "body" }));
    const singleRow = (s: WorkspaceState) =>
      (s.region as unknown as { regions: { singleRow?: boolean }[] }).regions[0]!.singleRow;

    expect(singleRow(asHeader) ?? false).toBe(false);
    expect(singleRow(back)).toBe(true);
  });

  it.skip("#44: with one Body Region, is today's Single-Row Region, with 'First row is header' off for a one-Row Table", () => {
    const table = tableOf(awkward, 1, [body([60, 612, 560, 652], true)]);

    expect(table.grid).toEqual([["Frame welded, painted and tagged", "1", "10.00"]]);
    expect(table.header).toBe(false);
  });
});

// --- #45: redraw and delete ----------------------------------------------------------------------

describe("redrawing and deleting a Table with several Regions", () => {
  const three = [header(BOX.titles1), body(BOX.rowsAboveNote1), body(BOX.rowsBelowNote1)];

  it.skip("#45: hides every Detected Table that a Region covers", () => {
    const state = saved(drawing, 1, three);
    const detected = tablesOf(state).filter((x) => x.manual === null);

    // Only the title block can still be detected; nothing over the titles or the Rows.
    for (const x of detected)
      for (const p of x.parts) expect(p.bbox[0] > 400 || p.bbox[3] < 520).toBe(true);
  });

  it.skip("#45: reopens every Region with its role when the Table is redrawn", () => {
    const state = saved(drawing, 1, three);
    const reopened = reduce(state, {
      type: "regionStarted",
      documentId: "d1",
      page: 1,
      tableId: selectedTable(state)!.id,
    });
    const regions = (reopened.region as unknown as { regions: { role: Role; bbox: Bbox }[] })
      .regions;

    expect(regions.map((r) => r.role)).toEqual(["header", "body", "body"]);
    expect(regions.map((r) => r.bbox)).toEqual([
      BOX.titles1,
      BOX.rowsAboveNote1,
      BOX.rowsBelowNote1,
    ]);
  });

  it.skip("#45: updates the same Table when one Region is changed and saved", () => {
    const state = saved(drawing, 1, three);
    const before = selectedTable(state)!;
    const redrawn = run(
      reduce(state, { type: "regionStarted", documentId: "d1", page: 1, tableId: before.id }),
      act({ type: "regionPicked", index: 2 }),
      { type: "regionChanged", page: 1, bbox: [60, 522, 400, 548] }, // items 5 and 6 only
      { type: "regionCommitted" },
    );
    const after = selectedTable(redrawn)!;

    expect(after.n).toBe(before.n);
    expect(after.manual).not.toBeNull();
    expect(after.grid.slice(-2).map((r) => r[0])).toEqual(["5", "6"]);
  });

  it.skip("#45: replaces a redrawn Detected Table with one Hand-drawn Table when a Header Region is added", () => {
    const detected = opened([
      page1([
        ...line(700, ["Bolt", "4", "1.20"]),
        ...line(686, ["Nut", "9", "0.40"]),
        ...line(672, ["Pin", "7", "0.10"]),
        t("PRICE", 320, 740, true),
      ]),
    ]);
    const before = tablesOf(detected);
    const state = run(
      reduce(detected, {
        type: "regionStarted",
        documentId: "d1",
        page: 1,
        tableId: before[0]!.id,
      }),
      act({ type: "regionAdded" }),
      { type: "regionChanged", page: 1, bbox: [300, 730, 400, 752] },
      act({ type: "regionRoleChanged", index: 1, role: "header" }),
      { type: "regionCommitted" },
    );

    expect(tablesOf(state)).toHaveLength(1);
    expect(tablesOf(state)[0]!.manual).not.toBeNull();
    expect(tablesOf(state)[0]!.grid[0]![2]).toBe("PRICE");
  });

  it.skip("#45: deleting the Table removes all its Regions, and a replaced Part becomes a Removed Table that can be restored", () => {
    const state = saved(drawing, 1, three);
    const tableId = selectedTable(state)!.id;
    const gone = reduce(state, { type: "tableRemoved", documentId: "d1", tableId });

    expect(tablesOf(gone).every((x) => x.manual === null)).toBe(true);
    const restored = reduce(gone, {
      type: "tableRestored",
      documentId: "d1",
      removedId: gone.documents[0]!.removed[0]!.id,
    });
    expect(tablesOf(restored).some((x) => x.manual === null && x.page === 1)).toBe(true);
  });

  it.skip("#45: asks before a redraw discards corrected Cells, and Cancel keeps the Table", () => {
    const state = saved(drawing, 1, three);
    const edited = reduce(state, {
      type: "cellEdited",
      documentId: "d1",
      tableId: selectedTable(state)!.id,
      row: 1,
      col: 2,
      value: "Corrected",
    });
    const asked = run(
      reduce(edited, {
        type: "regionStarted",
        documentId: "d1",
        page: 1,
        tableId: selectedTable(edited)!.id,
      }),
      { type: "regionCommitted" },
    );

    expect(asked.pendingChange?.type).toBe("regionCommitted");
    const cancelled = reduce(asked, { type: "changeCancelled" });
    expect(selectedTable(cancelled)!.grid[1]![2]).toBe("Corrected");
  });
});
