// Seam A: multi-line Rows (spec #22), through the workspace reducer and export.
//
// These are the acceptance tests for #24 to #27, written before the engine supports them. Most
// run against the statement fixture (tests/fixtures/statement.pdf: invented merchants, dates and
// amounts), read through the PDF Reader; the edge cases use hand-written PageText.
//
// A pending test is an `it.skip` named after the ticket that turns it on. That ticket replaces
// `it.skip` with `it` and makes it pass without changing what it expects. Tests that already pass
// guard today's behaviour and must keep passing.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  exportTable,
  initialWorkspace,
  reduce,
  regionPreview,
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

// --- The statement fixture ---------------------------------------------------------------------

const HEADER = ["Posted Date", "Transaction Date", "Description", "Amount"];
/** One Row per entry, top to bottom. A Wrapped Cell's lines join with one space, mid-word too. */
const ENTRIES = [
  // Dates and amount centred between the 2nd and 3rd Description lines.
  ["04 MAR", "02 MAR", "BRIGHTWATER LANTERNFISH NOO DLES Card Payment NZD 42.80", "-24.15"],
  // Beside the 2nd line.
  ["05 MAR", "03 MAR", "PEBBLE & FERN STATIONERY Card Payment NZD 18.00", "-9.60"],
  // A single-line Row.
  ["06 MAR", "06 MAR", "ORCHARD LANE BAKERY", "-3.75"],
  // Beside the first line.
  ["08 MAR", "07 MAR", "RIVERSTONE CYCLE WORKS Card Payment NZD 98.00", "-56.40"],
  // Beside the last line.
  ["10 MAR", "10 MAR", "INTERNAL TRANSFER From Savings 0412 Standing order", "250.00"],
];
/** A Region around each entry alone (PDF points), in the order of ENTRIES. */
const ENTRY_BOXES: Bbox[] = [
  [60, 635, 580, 692],
  [60, 578, 580, 622],
  [60, 548, 580, 566],
  [60, 492, 580, 536],
  [60, 436, 580, 480],
];
/** Every entry, without the Header Row. */
const ROWS_BOX: Bbox = [60, 436, 580, 692];
/** The Header Row and every entry. */
const TABLE_BOX: Bbox = [60, 436, 580, 722];
/** The page heading ("Card account statement", spanning two columns), the Header Row and every entry. */
const TITLE_BOX: Bbox = [60, 436, 580, 770];
/** A part of the page with no text. */
const EMPTY_BOX: Bbox = [60, 100, 580, 300];

let statement: PageText[];
let wrappedCells: PageText[];

async function readFixture(name: string): Promise<PageText[]> {
  const bytes = new Uint8Array(readFileSync(join(root, "tests", "fixtures", `${name}.pdf`)));
  const pages = await readDocument(bytes);
  if (typeof pages === "string") throw new Error(`the PDF Reader returned ${pages}`);
  return pages;
}

beforeAll(async () => {
  statement = await readFixture("statement");
  wrappedCells = await readFixture("wrapped-cells");
});

// --- Helpers -----------------------------------------------------------------------------------

const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
const opened = (pages: PageText[]): WorkspaceState =>
  run(
    initialWorkspace,
    { type: "documentAdded", id: "d1", name: "s.pdf", size: 1 },
    { type: "documentRead", id: "d1", pages },
  );
const tablesOf = (state: WorkspaceState): Table[] => state.documents[0]!.tables;
const draw = (state: WorkspaceState, bbox: Bbox, page = 1) =>
  run(
    state,
    { type: "regionStarted", documentId: "d1", page },
    { type: "regionChanged", page, bbox },
  );
const committed = (pages: PageText[], bbox: Bbox) =>
  run(draw(opened(pages), bbox), { type: "regionCommitted" });

const at = (str: string, x: number, y: number, bold = false, align = "left"): TextItem => ({
  str,
  x: align === "right" ? x - str.length * 5 : x,
  y,
  w: str.length * 5,
  h: 9,
  bold,
});
const page = (items: TextItem[]): PageText => ({ num: 1, w: 612, h: 792, items });

// #27 adds the Single-Row setting to the reducer. Until then these go through casts; #27 removes
// them (and may rename the action, keeping what the tests expect).
const singleRowChanged = (value: boolean) =>
  ({ type: "regionSingleRowChanged", value }) as unknown as WorkspaceAction;
const singleRowOf = (x: unknown) => (x as { singleRow?: boolean } | null | undefined)?.singleRow;

// --- #24 Rows can span several lines -------------------------------------------------------------

describe("#24 Rows can span several lines", () => {
  it.skip("#24: each statement entry is one Row of a Detected Table that includes the Header Row", () => {
    const tables = tablesOf(opened(statement));

    expect(tables).toHaveLength(1);
    expect(tables[0]!.grid).toEqual([HEADER, ...ENTRIES]);
    expect(tables[0]!.header).toBe(true);
    expect(tables[0]!.firstBold).toBe(true);
    expect(tables[0]!.sections).toEqual([]);
  });

  it.skip("#24: dates and amount stay in their columns beside the first, a middle or the last line", () => {
    const grid = tablesOf(opened(statement))[0]!.grid.slice(1);

    expect(grid.map((r) => [r[0], r[1], r[3]])).toEqual(ENTRIES.map((r) => [r[0], r[1], r[3]]));
  });

  it.skip("#24: a Wrapped Cell joins its lines top to bottom with one space, grey lines included", () => {
    const grid = tablesOf(opened(statement))[0]!.grid;

    expect(grid.map((r) => r[2])).toEqual([HEADER[2], ...ENTRIES.map((r) => r[2])]);
  });

  it.skip("#24: every export shows each Wrapped Cell as one Cell, in both Section Modes", () => {
    const table = tablesOf(opened(statement))[0]!;
    const all = [HEADER, ...ENTRIES];
    const expected = {
      csv: all.map((r) => r.join(",")).join("\n"),
      tsv: all.map((r) => r.join("\t")).join("\n"),
      md: [
        `| ${HEADER.join(" | ")} |`,
        "| --- | --- | --- | ---: |",
        ...ENTRIES.map((r) => `| ${r.join(" | ")} |`),
      ].join("\n"),
      json: JSON.stringify(
        ENTRIES.map((r) => Object.fromEntries(HEADER.map((h, i) => [h, r[i]]))),
        null,
        2,
      ),
    };

    for (const mode of ["column", "rows"] as const)
      for (const format of ["csv", "tsv", "md", "json"] as const)
        expect(exportTable(table, format, mode), `${format}, ${mode}`).toBe(expected[format]);
  });

  // Passes today, and must keep passing: the "never merge" rule of the ambiguity policy. Rows sit
  // 11pt apart (lines 9pt tall), as close as the wrapped lines of the fixtures, some with a Cell
  // missing, and none may be merged.
  it("#24: a dense table keeps every Row apart", () => {
    const xs = [72, 150, 320, 440];
    const line = (y: number, cells: string[], bold = false) =>
      cells.flatMap((c, i) => (c ? [at(c, xs[i]!, y, bold)] : []));
    const dense = page([
      ...line(700, ["Code", "Item", "Qty", "Price"], true),
      ...line(689, ["A1", "Bolts", "10", "1.20"]),
      ...line(678, ["A2", "Nuts", "", "0.80"]),
      ...line(667, ["A3", "Washers", "5", "0.40"]),
      ...line(656, ["", "Screws", "8", "0.95"]),
      ...line(645, ["A5", "Rivets", "12", "2.10"]),
      ...line(634, ["A6", "Pins", "3", ""]),
    ]);
    const expected = [
      ["Code", "Item", "Qty", "Price"],
      ["A1", "Bolts", "10", "1.20"],
      ["A2", "Nuts", "", "0.80"],
      ["A3", "Washers", "5", "0.40"],
      ["", "Screws", "8", "0.95"],
      ["A5", "Rivets", "12", "2.10"],
      ["A6", "Pins", "3", ""],
    ];

    expect(tablesOf(opened([dense])).map((t) => t.grid)).toEqual([expected]);
    expect(selectedTable(committed([dense], [60, 625, 560, 712]))!.grid).toEqual(expected);
  });
});

// --- #25 Two Cells wrapping at once, and Section Headers ---------------------------------------

describe("#25 Two Cells wrapping at once, and Section Headers stay correct", () => {
  it.skip("#25: in the wrapped-cells fixture, F-103 is one Row", () => {
    const tables = tablesOf(opened(wrappedCells));

    expect(tables).toHaveLength(1);
    expect(tables[0]!.grid).toEqual([
      ["Ref", "Description", "Owner", "Cost"],
      [
        "F-101",
        "Replace lobby carpet tiles and reseal the entrance mat well",
        "Facilities",
        "1,240.00",
      ],
      ["F-102", "Repaint stairwell B", "Building services team", "860.50"],
      [
        "F-103",
        "Service rooftop HVAC units before the summer peak",
        "External contractor",
        "4,310.75",
      ],
      ["F-104", "Fix badge reader at loading dock", "Security", "295.00"],
    ]);
  });

  it.skip("#25: two right-aligned Cells wrapping at once stay one Row", () => {
    const left = (y: number, a: string, b: string) => [at(a, 72, y), at(b, 150, y)];
    const right = (y: number, c: string, d: string) => [
      at(c, 420, y, false, "right"),
      at(d, 520, y, false, "right"),
    ];
    const items = [
      at("Ref", 72, 710, true),
      at("Description", 150, 710, true),
      at("Owner", 420, 710, true, "right"),
      at("Cost", 520, 710, true, "right"),
      ...left(696, "F-201", "Replace boiler flue"),
      ...right(696, "External", "9,800.00"),
      ...right(685, "contractor", "incl. VAT"),
      ...left(671, "F-202", "Clean gutters"),
      ...right(671, "Facilities", "310.00"),
    ];

    expect(tablesOf(opened([page(items)]))[0]!.grid).toEqual([
      ["Ref", "Description", "Owner", "Cost"],
      ["F-201", "Replace boiler flue", "External contractor", "9,800.00 incl. VAT"],
      ["F-202", "Clean gutters", "Facilities", "310.00"],
    ]);
  });

  it.skip("#25: a Wrapped Cell's lone second line is never a Section Header, a real one still is", () => {
    const xs = [72, 200, 320, 440];
    const line = (y: number, cells: string[], bold = false) =>
      cells.map((c, i) => at(c, xs[i]!, y, bold));
    // "annex" wraps the first column 10pt below its line; "Retail" is a lone label 20pt from the
    // lines above and below it.
    const items = [
      ...line(700, ["Site", "Manager", "Units", "Cost"], true),
      ...line(680, ["North", "A. Rivera", "12", "410.0"]),
      at("annex", 72, 670),
      at("Retail", 72, 650, true),
      ...line(630, ["Harbour", "J. Chen", "8", "275.5"]),
      ...line(610, ["Quay", "M. Okafor", "15", "520.0"]),
    ];

    const table = tablesOf(opened([page(items)]))[0]!;
    expect(table.grid).toEqual([
      ["Site", "Manager", "Units", "Cost"],
      ["North annex", "A. Rivera", "12", "410.0"],
      ["Retail", "", "", ""],
      ["Harbour", "J. Chen", "8", "275.5"],
      ["Quay", "M. Okafor", "15", "520.0"],
    ]);
    expect(table.sections).toEqual([2]);
  });

  it.skip("#25: the statement's lone Description lines are never Section Headers", () => {
    expect(tablesOf(opened(statement)).map((t) => t.sections)).toEqual([[]]);
    expect(selectedTable(committed(statement, TABLE_BOX))!.sections).toEqual([]);
  });
});

// --- #26 Region columns from every line ----------------------------------------------------------

describe("#26 Region columns from every line", () => {
  it.skip("#26: a Region around one statement Row gives one Row with four columns", () => {
    ENTRY_BOXES.forEach((bbox, i) => {
      const table = selectedTable(committed(statement, bbox))!;
      expect(table.grid, `entry ${i + 1}`).toEqual([ENTRIES[i]]);
      expect(table.cols, `entry ${i + 1}`).toHaveLength(4);
    });
  });

  it.skip("#26: a Region around several statement Rows gives one Row per entry, with or without the Header Row", () => {
    expect(selectedTable(committed(statement, TABLE_BOX))!.grid).toEqual([HEADER, ...ENTRIES]);
    expect(selectedTable(committed(statement, ROWS_BOX))!.grid).toEqual(ENTRIES);
  });

  it.skip("#26: the live preview matches the saved Table", () => {
    expect(regionPreview(draw(opened(statement), ENTRY_BOXES[0]!))!.grid).toEqual([ENTRIES[0]]);
  });

  it.skip("#26: a title spanning columns inside a Region does not merge them", () => {
    const table = selectedTable(committed(statement, TITLE_BOX))!;

    expect(table.cols).toHaveLength(4);
    expect(table.grid.slice(-ENTRIES.length - 1)).toEqual([HEADER, ...ENTRIES]);
  });

  // Passes today, and must keep passing.
  it("#26: a Region with no text is still refused", () => {
    const empty = draw(opened(statement), EMPTY_BOX);

    expect(regionPreview(empty)).toBeNull();
    expect(run(empty, { type: "regionCommitted" })).toBe(empty);
  });
});

// --- #27 Single-Row Region switch ----------------------------------------------------------------

describe("#27 Single-Row Region switch", () => {
  /** Entries 1 and 2: two Rows, unless the Region is a Single-Row Region. */
  const TWO_ENTRIES: Bbox = [60, 578, 580, 692];
  const AS_ONE_ROW = [
    "04 MAR 05 MAR",
    "02 MAR 03 MAR",
    `${ENTRIES[0]![2]} ${ENTRIES[1]![2]}`,
    "-24.15 -9.60",
  ];
  const singleRow = (bbox: Bbox) => run(draw(opened(statement), bbox), singleRowChanged(true));

  it.skip("#27: the switch is off by default", () => {
    const state = run(opened(statement), { type: "regionStarted", documentId: "d1", page: 1 });

    expect(singleRowOf(state.region)).toBe(false);
  });

  it.skip("#27: flipping the switch updates the preview at once", () => {
    const drawn = draw(opened(statement), TWO_ENTRIES);
    const on = run(drawn, singleRowChanged(true));
    const off = run(on, singleRowChanged(false));

    expect(regionPreview(drawn)!.grid).toEqual(ENTRIES.slice(0, 2));
    expect(regionPreview(on)!.grid).toEqual([AS_ONE_ROW]);
    expect(regionPreview(off)!.grid).toEqual(ENTRIES.slice(0, 2));
  });

  it.skip("#27: Column Spacing still decides the columns of a Single-Row Region", () => {
    const xs = [72, 107, 142, 177];
    const tight = page([
      ...["Ant", "Bee", "Cat", "Dog"].map((c, i) => at(c, xs[i]!, 700)),
      ...["Eel", "Fox", "Gnu", "Hen"].map((c, i) => at(c, xs[i]!, 689)),
    ]);
    const on = run(draw(opened([tight]), [60, 680, 300, 712]), singleRowChanged(true));
    const wide = run(on, { type: "columnSpacingChanged", value: 2.6 });

    expect(regionPreview(on)!.grid).toEqual([["Ant Eel", "Bee Fox", "Cat Gnu", "Dog Hen"]]);
    expect(regionPreview(wide)!.grid).toHaveLength(1);
    expect(regionPreview(wide)!.grid[0]).toHaveLength(1);
  });

  it.skip("#27: everything inside becomes one Row, with no Section Headers", () => {
    const preview = regionPreview(singleRow(TITLE_BOX))!;

    expect(preview.grid).toHaveLength(1);
    expect(preview.grid[0]).toHaveLength(4);
    expect(preview.sections).toEqual([]);
  });

  it.skip("#27: a Single-Row Region's Table starts with First row is header off, and the user can turn it on", () => {
    const state = run(singleRow(TWO_ENTRIES), { type: "regionCommitted" });
    const table = selectedTable(state)!;

    expect(table.grid).toEqual([AS_ONE_ROW]);
    expect(table.header).toBe(false);
    expect(singleRowOf(state.documents[0]!.regions[0])).toBe(true);

    const on = run(state, {
      type: "headerToggled",
      documentId: "d1",
      tableId: table.id,
      header: true,
    });
    expect(selectedTable(on)!.header).toBe(true);
  });

  it.skip("#27: other Hand-drawn Tables keep First row is header on", () => {
    expect(selectedTable(committed(statement, TWO_ENTRIES))!.header).toBe(true);
  });

  it.skip("#27: the setting survives Column Spacing changes, the join switch and a redraw", () => {
    const saved = run(singleRow(TWO_ENTRIES), { type: "regionCommitted" });
    const respaced = run(saved, { type: "columnSpacingChanged", value: 0.5 });
    const rejoined = run(respaced, { type: "joinChanged", value: false });
    expect(selectedTable(respaced)!.grid).toEqual([AS_ONE_ROW]);
    expect(selectedTable(rejoined)!.grid).toEqual([AS_ONE_ROW]);

    const redrawing = run(rejoined, {
      type: "regionStarted",
      documentId: "d1",
      page: 1,
      tableId: selectedTable(rejoined)!.id,
    });
    expect(singleRowOf(redrawing.region)).toBe(true);

    const redrawn = run(
      redrawing,
      { type: "regionChanged", page: 1, bbox: ENTRY_BOXES[0]! },
      { type: "regionCommitted" },
    );
    expect(selectedTable(redrawn)!.grid).toEqual([ENTRIES[0]]);
    expect(singleRowOf(redrawn.documents[0]!.regions[0])).toBe(true);
  });

  it.skip("#27: a Single-Row Region with no text is still refused", () => {
    const empty = singleRow(EMPTY_BOX);

    expect(regionPreview(empty)).toBeNull();
    expect(run(empty, { type: "regionCommitted" })).toBe(empty);
  });

  it.skip("#27: saving a Single-Row Region goes through the edit warning", () => {
    const saved = committed(statement, ENTRY_BOXES[2]!);
    const edited = run(saved, {
      type: "cellEdited",
      documentId: "d1",
      tableId: selectedTable(saved)!.id,
      row: 0,
      col: 0,
      value: "07 MAR",
    });
    const drawn = run(draw(edited, TWO_ENTRIES), singleRowChanged(true));

    const asked = run(drawn, { type: "regionCommitted" });
    expect(asked.pendingChange).toEqual({ type: "regionCommitted" });

    const done = run(asked, { type: "changeConfirmed" });
    expect(selectedTable(done)!.grid).toEqual([AS_ONE_ROW]);
  });
});
