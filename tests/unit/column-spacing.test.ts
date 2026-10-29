// Seam A: Column Spacing re-detection through the workspace reducer.
import { performance } from "node:perf_hooks";
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
import { fixtureBytes, loadGoldens } from "./support/golden";
import { readDocument } from "./support/node-reader";

const at = (str: string, x: number, y: number): TextItem => ({
  str,
  x,
  y,
  w: str.length * 5,
  h: 9,
  bold: false,
});

/** A page of rows; each row is [cell x, text] pairs. */
const rows = (top: number, cells: [number, string][][]) =>
  cells.flatMap((r, i) => r.map(([x, s]) => at(s, x, top - i * 14)));

/** Two columns far apart, the first of which is two words 10 pt apart (1.1 × the line height). */
const wideGap = (top: number) =>
  rows(
    top,
    ["a", "b", "c"].map((k) => [
      [72, `New${k}`],
      [72 + 20 + 10, "York"],
      [300, "1"],
      [400, "2"],
    ]),
  );
/** Two words 10 pt apart per row: a Table at spacing 1, plain text once they merge. */
const twoWords = (top: number) =>
  rows(
    top,
    ["a", "b", "c"].map((k) => [
      [72, `New${k}`],
      [102, "York"],
    ]),
  );
/** A plain two-column table that detects at any spacing. */
const plain = (top: number) =>
  rows(top, [
    [
      [72, "Name"],
      [300, "Qty"],
    ],
    [
      [72, "Bolt"],
      [300, "4"],
    ],
    [
      [72, "Nut"],
      [300, "9"],
    ],
  ]);

const page = (num: number, items: TextItem[]): PageText => ({ num, w: 612, h: 792, items });
const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
const open = (pages: PageText[]) =>
  run(
    initialWorkspace,
    { type: "documentAdded", id: "d", name: "d.pdf", size: 1 },
    { type: "documentRead", id: "d", pages },
  );

describe("columnSpacingChanged", () => {
  it("re-detects every Document at the new Column Spacing", () => {
    const pages = [page(1, wideGap(700))];
    const state = run(
      open(pages),
      { type: "documentAdded", id: "e", name: "e.pdf", size: 1 },
      { type: "documentRead", id: "e", pages },
    );
    const split = state.documents[0]!.tables[0]!.grid[0]!.length;

    const merged = reduce(state, { type: "columnSpacingChanged", value: 1.3 });

    expect(merged.settings.columnSpacing).toBe(1.3);
    for (const doc of merged.documents) expect(doc.tables[0]!.grid[0]!.length).toBe(split - 1);
  });

  it("keeps the selected Table by page and position among that page's Tables", () => {
    const state = run(open([page(1, plain(700)), page(2, [...plain(700), ...plain(400)])]), {
      type: "tableSelected",
      documentId: "d",
      tableId: "d:2:1",
    });
    expect(selectedTable(state)?.page).toBe(2);

    const moved = reduce(state, { type: "columnSpacingChanged", value: 2 });

    expect(selectedTable(moved)).toMatchObject({ page: 2, id: "d:2:1" });
  });

  it("falls back to the first Table when the selected one is gone", () => {
    const state = run(open([page(1, plain(700)), page(2, twoWords(700))]), {
      type: "tableSelected",
      documentId: "d",
      tableId: "d:2:0",
    });
    expect(selectedTable(state)?.page).toBe(2);

    const moved = reduce(state, { type: "columnSpacingChanged", value: 2.6 });

    expect(selectedTable(moved)).toMatchObject({ page: 1 });
  });

  it("ignores values outside 0.4–2.6 and leaves the selection alone with nothing open", () => {
    const state = open([page(1, plain(700))]);

    expect(reduce(state, { type: "columnSpacingChanged", value: 3 })).toBe(state);
    expect(reduce(state, { type: "columnSpacingChanged", value: Number.NaN })).toBe(state);
    expect(reduce(initialWorkspace, { type: "columnSpacingChanged", value: 0.5 }).selection).toBe(
      null,
    );
  });
});

describe("benchmark", () => {
  it("re-detects the 200-page fixture in under 100 ms", async () => {
    const golden = loadGoldens().find((g) => g.name === "perf-200-pages")!;
    const pages = await readDocument(fixtureBytes(golden));
    if (typeof pages === "string") throw new Error(pages);
    const state = open(pages);

    reduce(state, { type: "columnSpacingChanged", value: 0.5 }); // warm up
    const runs: number[] = [];
    for (const value of [1.5, 0.8, 2.2, 1.2, 0.6]) {
      const t0 = performance.now();
      reduce(state, { type: "columnSpacingChanged", value });
      runs.push(performance.now() - t0);
    }
    console.info(`re-detect 200 pages (ms): ${runs.map((r) => r.toFixed(1)).join(", ")}`);

    expect(Math.min(...runs)).toBeLessThan(100);
  });
});
