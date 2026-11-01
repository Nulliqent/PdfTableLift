// Seam A: Section Headers beside multi-line Rows (spec #30), through the workspace reducer and
// export.
//
// These are the acceptance tests for #32 and #33, written before the engine supports them. Most run
// against the two fixtures of #31, read through the PDF Reader (invented merchants, dates and
// amounts; spacings in scripts/fixtures/make-fixtures.mjs):
// - tests/fixtures/statement-sections.pdf: Date, Description, Amount, with bold month labels alone
//   in the first column, one right under the Header Row and a month followed by a card label;
// - tests/fixtures/statement-first-column.pdf: Description first, then Date and Amount. Page 1 has
//   Section Headers, page 2 (a different Header Row, so a separate Table) has none.
// The edge cases use the hand-written page of the reproduction (spec #30).
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

// --- statement-sections.pdf ----------------------------------------------------------------------

const HEADER = ["Date", "Description", "Amount"];
const section = (label: string) => [label, "", ""];
const OCTOBER = [
  ["02 OCT", "HARBOUR COFFEE HOUSE Card Payment SGD 12.00", "-12.00"],
  ["03 OCT", "FOLIO BOOK STORE Card Payment SGD 8.50", "-8.50"],
];
const NOVEMBER = [
  ["01 NOV", "GREENLEAF GROCERY MART Card Payment SGD 30.00", "-30.00"],
  ["04 NOV", "TIDEWATER FERRY Card Payment SGD 6.20", "-6.20"],
];
const DECEMBER = [
  ["05 DEC", "MAPLE & MOSS FLORIST Card Payment SGD 24.90", "-24.90"],
  ["09 DEC", "COPPER KETTLE DINER Card Payment SGD 17.35", "-17.35"],
];
/** The whole Table, top to bottom: a Section Header right under the Header Row, and two in a row. */
const SECTIONS_GRID = [
  HEADER,
  section("OCTOBER"),
  ...OCTOBER,
  section("NOVEMBER"),
  section("CARD ENDING 0412"),
  ...NOVEMBER,
  section("DECEMBER"),
  ...DECEMBER,
];
const SECTIONS_ROWS = [1, 4, 5, 8];

/** Regions on statement-sections.pdf (PDF points). */
const BOX = {
  /** The Header Row and everything below it. */
  everything: [60, 295, 560, 722] as Bbox,
  /** OCTOBER and its two Rows. */
  oneGroup: [60, 575, 560, 700] as Bbox,
  /** From NOVEMBER (a Section Header, then another) to the end. */
  fromSection: [60, 295, 560, 568] as Bbox,
  /** The two November Rows only: no Section Header inside. */
  midGroup: [60, 430, 560, 528] as Bbox,
  /** From the second November Row, across DECEMBER, to the end. */
  midGroupAcross: [60, 295, 560, 472] as Bbox,
};

// --- statement-first-column.pdf ------------------------------------------------------------------

/** Page 1: Description first, with Section Headers. */
const FIRST_COLUMN_SECTIONS_GRID = [
  ["Description", "Date", "Amount"],
  section("OCTOBER"),
  ["HARBOUR COFFEE HOUSE Card Payment SGD 12.00", "02 OCT", "-12.00"],
  ["FOLIO BOOK STORE Card Payment SGD 8.50", "03 OCT", "-8.50"],
  section("NOVEMBER"),
  ["GREENLEAF GROCERY MART Card Payment SGD 30.00", "01 NOV", "-30.00"],
  ["TIDEWATER FERRY Card Payment SGD 6.20", "04 NOV", "-6.20"],
];
/** Page 2: Description first, no Section Headers. */
const FIRST_COLUMN_PLAIN_GRID = [
  ["Merchant", "Posted", "Value"],
  ["QUARRY HILL HARDWARE Card Payment SGD 41.80", "11 NOV", "-41.80"],
  ["SILVERFIN SUSHI BAR Card Payment SGD 27.60", "14 NOV", "-27.60"],
  ["LANTERN STREET LAUNDRY Card Payment SGD 9.00", "18 NOV", "-9.00"],
  ["BLUE HERON BIKE HIRE Card Payment SGD 15.50", "21 NOV", "-15.50"],
];
/** The Header Row and everything below it, on page 1 and on page 2. */
const FIRST_COLUMN_BOX: Record<1 | 2, Bbox> = {
  1: [60, 445, 560, 722],
  2: [60, 515, 560, 752],
};

let sections: PageText[];
let firstColumn: PageText[];

async function readFixture(name: string): Promise<PageText[]> {
  const bytes = new Uint8Array(readFileSync(join(root, "tests", "fixtures", `${name}.pdf`)));
  const pages = await readDocument(bytes);
  if (typeof pages === "string") throw new Error(`the PDF Reader returned ${pages}`);
  return pages;
}

beforeAll(async () => {
  sections = await readFixture("statement-sections");
  firstColumn = await readFixture("statement-first-column");
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
const committed = (pages: PageText[], bbox: Bbox, page = 1) =>
  selectedTable(run(draw(opened(pages), bbox, page), { type: "regionCommitted" }))!;

/** The reproduction's page (repro-30): y grows upward, py is the top-down position. */
const t = (str: string, x: number, py: number, w: number, h = 10, bold = false): TextItem => ({
  str,
  x,
  y: 800 - py,
  w,
  h,
  bold,
});
/** A Row: a 3-line Description 13 apart, with the date and amount beside its 2nd line. */
const entry = (py: number, d: string, a: string, desc: string[], xs = { desc: 140, date: 40 }) => [
  ...desc.map((s, i) => t(s, xs.desc, py + i * 13, s.length * 5)),
  t(d, xs.date, py + 13, 30),
  t(a, 410, py + 13, 30),
];
/** A Section Header: bold, alone in the first column. */
const sec = (py: number, s: string) => t(s, 40, py, s.length * 6, 10, true);
const page = (items: TextItem[]): PageText => ({ num: 1, w: 612, h: 792, items });

// --- #32 The Row after a Section Header keeps its first line --------------------------------------

describe("#32 Section Headers beside multi-line Rows", () => {
  it("#32: in the Section Header fixture, every Row keeps its first line and every label is a Section Header", () => {
    const tables = tablesOf(opened(sections));

    expect(tables).toHaveLength(1);
    expect(tables[0]!.grid).toEqual(SECTIONS_GRID);
    expect(tables[0]!.sections).toEqual(SECTIONS_ROWS);
    expect(tables[0]!.header).toBe(true);
  });

  it("#32: two Section Headers in a row are both recognised", () => {
    const table = tablesOf(opened(sections))[0]!;

    expect(table.grid.slice(4, 7)).toEqual([
      section("NOVEMBER"),
      section("CARD ENDING 0412"),
      NOVEMBER[0],
    ]);
    expect(table.sections).toContain(4);
    expect(table.sections).toContain(5);
  });

  it("#32: a Section Header right under the Header Row, before the first Row, is recognised", () => {
    const table = tablesOf(opened(sections))[0]!;

    expect(table.grid.slice(0, 3)).toEqual([HEADER, section("OCTOBER"), OCTOBER[0]]);
    expect(table.sections[0]).toBe(1);
  });

  // The reproduction itself (repro-30): the Rows right after OCTOBER and NOVEMBER lost their first
  // line, which became a Section Header of its own.
  it("#32: a non-bold line within a Row's line spacing of the Row below joins it, right after a Section Header", () => {
    const header = [
      t("Date", 40, 100, 30, 10, true),
      t("Description", 140, 100, 60, 10, true),
      t("Amount", 400, 100, 40, 10, true),
    ];
    const repro = page([
      ...header,
      sec(125, "OCTOBER"),
      ...entry(145, "02 OCT", "-12.00", ["COFFEE HOUSE", "Card Payment", "SGD 12.00"]),
      ...entry(200, "03 OCT", "-8.50", ["BOOK STORE", "Card Payment", "SGD 8.50"]),
      sec(255, "NOVEMBER"),
      ...entry(275, "01 NOV", "-30.00", ["GROCERY MART", "Card Payment", "SGD 30.00"]),
    ]);
    const expected = [
      ["Date", "Description", "Amount"],
      ["OCTOBER", "", ""],
      ["02 OCT", "COFFEE HOUSE Card Payment SGD 12.00", "-12.00"],
      ["03 OCT", "BOOK STORE Card Payment SGD 8.50", "-8.50"],
      ["NOVEMBER", "", ""],
      ["01 NOV", "GROCERY MART Card Payment SGD 30.00", "-30.00"],
    ];

    const detected = tablesOf(opened([repro]));
    expect(detected.map((x) => x.grid)).toEqual([expected]);
    expect(detected[0]!.sections).toEqual([1, 4]);
    const region = committed([repro], [0, 480, 600, 710]);
    expect(region.grid).toEqual(expected);
    expect(region.sections).toEqual([1, 4]);
  });

  it("#32: a bold line set further from the Row below than that Row's own lines is a Section Header", () => {
    const repro = page([
      t("Date", 40, 100, 30, 10, true),
      t("Description", 140, 100, 60, 10, true),
      t("Amount", 400, 100, 40, 10, true),
      ...entry(125, "02 OCT", "-12.00", ["COFFEE HOUSE", "Card Payment", "SGD 12.00"]),
      ...entry(180, "03 OCT", "-8.50", ["BOOK STORE", "Card Payment", "SGD 8.50"]),
      sec(235, "TRAVEL"),
      ...entry(255, "05 OCT", "-41.00", ["RAIL PASS", "Card Payment", "SGD 41.00"]),
    ]);

    const table = tablesOf(opened([repro]))[0]!;
    expect(table.grid).toEqual([
      ["Date", "Description", "Amount"],
      ["02 OCT", "COFFEE HOUSE Card Payment SGD 12.00", "-12.00"],
      ["03 OCT", "BOOK STORE Card Payment SGD 8.50", "-8.50"],
      ["TRAVEL", "", ""],
      ["05 OCT", "RAIL PASS Card Payment SGD 41.00", "-41.00"],
    ]);
    expect(table.sections).toEqual([3]);
  });

  // The ambiguity policy: a plain label only a little further from the Row below than that Row's
  // own lines (20 against 13) could be either, so the lines stay apart exactly as before #32.
  it("#32: a non-bold label barely set apart from the Row below leaves the lines as they were", () => {
    const plain = (py: number, s: string) => t(s, 40, py, s.length * 6);
    const repro = page([
      t("Date", 40, 100, 30, 10, true),
      t("Description", 140, 100, 60, 10, true),
      t("Amount", 400, 100, 40, 10, true),
      plain(125, "OCTOBER"),
      ...entry(145, "02 OCT", "-12.00", ["COFFEE HOUSE", "Card Payment", "SGD 12.00"]),
      ...entry(200, "03 OCT", "-8.50", ["BOOK STORE", "Card Payment", "SGD 8.50"]),
      plain(255, "NOVEMBER"),
      ...entry(275, "01 NOV", "-30.00", ["GROCERY MART", "Card Payment", "SGD 30.00"]),
    ]);

    const table = tablesOf(opened([repro]))[0]!;
    expect(table.grid).toEqual([
      ["Date", "Description", "Amount"],
      ["OCTOBER", "", ""],
      ["COFFEE HOUSE", "", ""],
      ["02 OCT", "Card Payment SGD 12.00", "-12.00"],
      ["03 OCT", "BOOK STORE Card Payment SGD 8.50", "-8.50"],
      ["NOVEMBER", "", ""],
      ["GROCERY MART", "", ""],
      ["01 NOV", "Card Payment", "-30.00"],
    ]);
    expect(table.sections).toEqual([1, 2, 5, 6]);
  });

  it("#32: a Region over everything gives the Detected Table's Rows and Section Headers", () => {
    const table = committed(sections, BOX.everything);

    expect(table.grid).toEqual(SECTIONS_GRID);
    expect(table.sections).toEqual(SECTIONS_ROWS);
    expect(table.header).toBe(true);
  });

  it("#32: the live preview of a Region over everything matches the saved Table", () => {
    expect(regionPreview(draw(opened(sections), BOX.everything))!.grid).toEqual(SECTIONS_GRID);
  });

  // A Region drawn from a label downward: its first Row is a Section Header, not a Header Row, so
  // "First row is header" starts off and the label heads the Rows below it in every export.
  it("#32: a Region over one group starts with its Section Header", () => {
    const table = committed(sections, BOX.oneGroup);

    expect(table.grid).toEqual([section("OCTOBER"), ...OCTOBER]);
    expect(table.sections).toEqual([0]);
    expect(table.header).toBe(false);
    expect(exportTable(table, "csv", "column")).toBe(
      OCTOBER.map((r) => ["OCTOBER", ...r].join(",")).join("\n"),
    );
  });

  it("#32: a Region starting at a Section Header recognises it, and the one right after it", () => {
    const table = committed(sections, BOX.fromSection);

    expect(table.grid).toEqual([
      section("NOVEMBER"),
      section("CARD ENDING 0412"),
      ...NOVEMBER,
      section("DECEMBER"),
      ...DECEMBER,
    ]);
    expect(table.sections).toEqual([0, 1, 4]);
    expect(table.header).toBe(false);
  });

  // Passes today, and must keep passing (spec #30, story 9).
  it("#32: a Region starting mid-group, with no Section Header inside, gives correct Rows", () => {
    const table = committed(sections, BOX.midGroup);

    expect(table.grid).toEqual(NOVEMBER);
    expect(table.sections).toEqual([]);
  });

  // Whether its first Row is taken as a Header Row is today's rule for Regions and is not asserted.
  it("#32: a Region starting mid-group and crossing a Section Header keeps every Row whole", () => {
    const table = committed(sections, BOX.midGroupAcross);

    expect(table.grid).toEqual([NOVEMBER[1], section("DECEMBER"), ...DECEMBER]);
    expect(table.sections).toEqual([1]);
  });

  // As Column: each Row carries the Section Header nearest above it, so the two November Rows sit
  // under the card label (today's export rule for two Section Headers in a row).
  it("#32: As Column puts each Row under the right Section Header, in every format", () => {
    const table = tablesOf(opened(sections))[0]!;
    const head = ["Section", ...HEADER];
    const body = [
      ...OCTOBER.map((r) => ["OCTOBER", ...r]),
      ...NOVEMBER.map((r) => ["CARD ENDING 0412", ...r]),
      ...DECEMBER.map((r) => ["DECEMBER", ...r]),
    ];
    const expected = {
      csv: [head, ...body].map((r) => r.join(",")).join("\n"),
      tsv: [head, ...body].map((r) => r.join("\t")).join("\n"),
      md: [
        `| ${head.join(" | ")} |`,
        "| --- | --- | --- | ---: |",
        ...body.map((r) => `| ${r.join(" | ")} |`),
      ].join("\n"),
      json: JSON.stringify(
        body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))),
        null,
        2,
      ),
    };

    for (const format of ["csv", "tsv", "md", "json"] as const)
      expect(exportTable(table, format, "column"), format).toBe(expected[format]);
  });

  it("#32: As Rows shows each Section Header once, above its Rows, in every format", () => {
    const table = tablesOf(opened(sections))[0]!;
    const obj = (r: string[]) => Object.fromEntries(HEADER.map((h, i) => [h, r[i]]));
    const expected = {
      csv: SECTIONS_GRID.map((r) => r.join(",")).join("\n"),
      tsv: SECTIONS_GRID.map((r) => r.join("\t")).join("\n"),
      md: [
        `| ${HEADER.join(" | ")} |`,
        "| --- | --- | ---: |",
        ...SECTIONS_GRID.slice(1).map((r, i) =>
          SECTIONS_ROWS.includes(i + 1) ? `| **${r[0]}** | | |` : `| ${r.join(" | ")} |`,
        ),
      ].join("\n"),
      json: JSON.stringify(
        [
          { section: "OCTOBER", rows: OCTOBER.map(obj) },
          { section: "NOVEMBER", rows: [] },
          { section: "CARD ENDING 0412", rows: NOVEMBER.map(obj) },
          { section: "DECEMBER", rows: DECEMBER.map(obj) },
        ],
        null,
        2,
      ),
    };

    for (const format of ["csv", "tsv", "md", "json"] as const)
      expect(exportTable(table, format, "rows"), format).toBe(expected[format]);
  });
});

// --- #33 Multi-line text in the first column ------------------------------------------------------

describe("#33 Multi-line text in the first column", () => {
  it("#33: without Section Headers, every Row keeps all its lines and there are no Section Headers", () => {
    const table = tablesOf(opened(firstColumn)).find((x) => x.parts[0]!.page === 2)!;

    expect(table.grid).toEqual(FIRST_COLUMN_PLAIN_GRID);
    expect(table.sections).toEqual([]);
  });

  it("#33: with Section Headers, the bold labels are Section Headers and every Row keeps its first line", () => {
    const table = tablesOf(opened(firstColumn)).find((x) => x.parts[0]!.page === 1)!;

    expect(table.grid).toEqual(FIRST_COLUMN_SECTIONS_GRID);
    expect(table.sections).toEqual([1, 4]);
  });

  // Passes today, and must keep passing: page 2's Header Row differs, so it is never joined.
  it("#33: the two pages stay two Tables, one per page", () => {
    const tables = tablesOf(opened(firstColumn));

    expect(tables.map((x) => x.parts.map((p) => p.page))).toEqual([[1], [2]]);
  });

  it("#33: a Region over each page gives the same Rows and Section Headers", () => {
    const withSections = committed(firstColumn, FIRST_COLUMN_BOX[1], 1);
    expect(withSections.grid).toEqual(FIRST_COLUMN_SECTIONS_GRID);
    expect(withSections.sections).toEqual([1, 4]);

    const plain = committed(firstColumn, FIRST_COLUMN_BOX[2], 2);
    expect(plain.grid).toEqual(FIRST_COLUMN_PLAIN_GRID);
    expect(plain.sections).toEqual([]);
  });

  // The reproduction's first-column variant (repro-30): every Row's first line became a Section
  // Header, with no real Section Headers on the page.
  it("#33: a first-column Wrapped Cell whose lines are spaced like a Row's lines stays one Cell", () => {
    const xs = { desc: 40, date: 250 };
    const repro = page([
      t("Description", 40, 100, 60, 10, true),
      t("Date", 250, 100, 30, 10, true),
      t("Amount", 400, 100, 40, 10, true),
      ...entry(125, "02 OCT", "-12.00", ["COFFEE HOUSE", "Card Payment", "SGD 12.00"], xs),
      ...entry(180, "03 OCT", "-8.50", ["BOOK STORE", "Card Payment", "SGD 8.50"], xs),
      ...entry(235, "01 NOV", "-30.00", ["GROCERY MART", "Card Payment", "SGD 30.00"], xs),
    ]);
    const expected = [
      ["Description", "Date", "Amount"],
      ["COFFEE HOUSE Card Payment SGD 12.00", "02 OCT", "-12.00"],
      ["BOOK STORE Card Payment SGD 8.50", "03 OCT", "-8.50"],
      ["GROCERY MART Card Payment SGD 30.00", "01 NOV", "-30.00"],
    ];

    const detected = tablesOf(opened([repro]));
    expect(detected.map((x) => x.grid)).toEqual([expected]);
    expect(detected[0]!.sections).toEqual([]);
    const region = committed([repro], [0, 500, 600, 710]);
    expect(region.grid).toEqual(expected);
    expect(region.sections).toEqual([]);
  });

  /** The reproduction's first-column page, with these labels between its Rows. */
  const firstColumnPage = (label: (py: number, s: string) => TextItem) => {
    const xs = { desc: 40, date: 250 };
    return page([
      t("Description", 40, 100, 60, 10, true),
      t("Date", 250, 100, 30, 10, true),
      t("Amount", 400, 100, 40, 10, true),
      label(125, "OCTOBER"),
      ...entry(145, "02 OCT", "-12.00", ["COFFEE HOUSE", "Card Payment", "SGD 12.00"], xs),
      ...entry(200, "03 OCT", "-8.50", ["BOOK STORE", "Card Payment", "SGD 8.50"], xs),
      label(255, "NOVEMBER"),
      ...entry(275, "01 NOV", "-30.00", ["GROCERY MART", "Card Payment", "SGD 30.00"], xs),
    ]);
  };

  it("#33: bold first-column labels between first-column Rows are Section Headers, as a Region too", () => {
    const repro = firstColumnPage(sec);
    const expected = [
      ["Description", "Date", "Amount"],
      ["OCTOBER", "", ""],
      ["COFFEE HOUSE Card Payment SGD 12.00", "02 OCT", "-12.00"],
      ["BOOK STORE Card Payment SGD 8.50", "03 OCT", "-8.50"],
      ["NOVEMBER", "", ""],
      ["GROCERY MART Card Payment SGD 30.00", "01 NOV", "-30.00"],
    ];

    const detected = tablesOf(opened([repro]));
    expect(detected.map((x) => x.grid)).toEqual([expected]);
    expect(detected[0]!.sections).toEqual([1, 4]);
    const region = committed([repro], [0, 480, 600, 710]);
    expect(region.grid).toEqual(expected);
    expect(region.sections).toEqual([1, 4]);
  });

  // The ambiguity policy, and #32's fallback: a plain label 20pt above a Row whose lines are 13pt
  // apart is neither clearly a Section Header nor clearly a Row's line. The label path gives up and
  // the old path still refuses first-column lines, so the labels and the Rows beside them come out
  // as they did before #33. Only the Row between two Rows, with no label in the way, is grouped:
  // the same output as #32's guard with the Description second.
  it("#33: a plain first-column label barely set apart from first-column Rows leaves the lines beside it as they were", () => {
    const plain = (py: number, s: string) => t(s, 40, py, s.length * 6);

    const table = tablesOf(opened([firstColumnPage(plain)]))[0]!;
    expect(table.grid).toEqual([
      ["Description", "Date", "Amount"],
      ["OCTOBER", "", ""],
      ["COFFEE HOUSE", "", ""],
      ["Card Payment SGD 12.00", "02 OCT", "-12.00"],
      ["BOOK STORE Card Payment SGD 8.50", "03 OCT", "-8.50"],
      ["NOVEMBER", "", ""],
      ["GROCERY MART", "", ""],
      ["Card Payment", "01 NOV", "-30.00"],
    ]);
    expect(table.sections).toEqual([1, 2, 5, 6]);
  });

  // The dense-table guard in the first column: with every line 13pt apart, a first-column line is
  // as close to the Row below as to its own, so groupRows folds nothing and the result is the one
  // the engine gave before #33 (these first-column wraps come from buildTable, as since #25).
  it("#33: first-column lines evenly spaced between Rows stay apart", () => {
    const xs = [72, 250, 400];
    const line = (py: number, cells: string[]) =>
      cells.flatMap((c, i) => (c ? [t(c, xs[i]!, py, c.length * 5)] : []));
    const dense = page([
      ...line(100, ["Item", "Qty", "Price"]),
      ...line(113, ["steel"]),
      ...line(126, ["Bolts", "10", "1.20"]),
      ...line(139, ["zinc"]),
      ...line(152, ["M6"]),
      ...line(165, ["Nuts", "4", "0.80"]),
      ...line(178, ["brass"]),
      ...line(191, ["M4"]),
      ...line(204, ["Pins", "3", "0.40"]),
      ...line(217, ["steel"]),
    ]);

    const table = tablesOf(opened([dense]))[0]!;
    expect(table.grid).toEqual([
      ["Item steel", "Qty", "Price"],
      ["Bolts zinc M6", "10", "1.20"],
      ["Nuts brass M4", "4", "0.80"],
      ["Pins", "3", "0.40"],
    ]);
  });

  it("#33: As Column and As Rows put each first-column Row under its Section Header", () => {
    const table = tablesOf(opened(firstColumn)).find((x) => x.parts[0]!.page === 1)!;
    const [head, , oct1, oct2, , nov1, nov2] = FIRST_COLUMN_SECTIONS_GRID as [
      string[],
      ...string[][],
    ];

    expect(exportTable(table, "csv", "column")).toBe(
      [
        ["Section", ...head],
        ["OCTOBER", ...oct1!],
        ["OCTOBER", ...oct2!],
        ["NOVEMBER", ...nov1!],
        ["NOVEMBER", ...nov2!],
      ]
        .map((r) => r.join(","))
        .join("\n"),
    );
    expect(exportTable(table, "csv", "rows")).toBe(
      FIRST_COLUMN_SECTIONS_GRID.map((r) => r.join(",")).join("\n"),
    );
  });
});
