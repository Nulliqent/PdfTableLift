// Seam A: Hand-drawn Tables. Select a Region, preview it, save it, and see it replace Detected Tables.
import { describe, expect, it } from "vitest";
import {
  initialWorkspace,
  reduce,
  regionPreview,
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
const row = (y: number, cells: string[], bold = false, xs = [72, 200, 320, 440]) =>
  cells.map((c, i) => at(c, xs[i]!, y, bold));
const page = (num: number, items: TextItem[]): PageText => ({ num, w: 612, h: 792, items });

/** One detected Table of three rows, with prose below it. */
const stores = page(1, [
  ...row(710, ["Store", "Region", "Q1", "Q2"], true),
  ...row(696, ["Portland", "West", "412.8", "430.1"]),
  ...row(682, ["Austin", "South", "1,204", "1,180"]),
  at("Figures in thousands of dollars.", 72, 640),
]);

/** A page whose rows are single strings, so nothing is detected without a Region. */
const prose = page(2, [
  at("Apples 3", 72, 700),
  at("Pears 5", 72, 686),
  at("Plums 8", 72, 672),
  at("A note elsewhere", 400, 300),
]);

/** Columns close enough that a wider Column Spacing runs them together. */
const tightXs = [72, 107, 142, 177];
const tight = page(1, [
  ...row(710, ["Item", "Qty", "Cost", "Tax"], true, tightXs),
  ...row(696, ["Ant", "Bee", "Cat", "Dog"], false, tightXs),
  ...row(682, ["Eel", "Fox", "Gnu", "Hen"], false, tightXs),
]);

const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state);
const opened = (pages: PageText[]): WorkspaceState =>
  run(
    initialWorkspace,
    { type: "documentAdded", id: "d1", name: "r.pdf", size: 1 },
    { type: "documentRead", id: "d1", pages },
  );
const draw = (state: WorkspaceState, pageNum: number, bbox: Bbox) =>
  run(
    state,
    { type: "regionStarted", documentId: "d1", page: pageNum },
    { type: "regionChanged", page: pageNum, bbox },
  );

describe("selecting a Region", () => {
  it("starts on the page given, with nothing drawn yet", () => {
    const state = run(opened([stores, prose]), {
      type: "regionStarted",
      documentId: "d1",
      page: 2,
    });

    expect(state.region).toEqual({ documentId: "d1", page: 2, bbox: null });
    expect(regionPreview(state)).toBeNull();
  });

  it("previews the rows and columns inside the Region (US-29)", () => {
    const state = draw(opened([stores]), 1, [60, 670, 560, 730]);

    expect(regionPreview(state)!.grid).toEqual([
      ["Store", "Region", "Q1", "Q2"],
      ["Portland", "West", "412.8", "430.1"],
      ["Austin", "South", "1,204", "1,180"],
    ]);
  });

  it("uses only the text whose centre lies inside the Region", () => {
    const state = draw(opened([stores]), 1, [60, 690, 560, 730]);

    expect(regionPreview(state)!.grid.map((r) => r[0])).toEqual(["Store", "Portland"]);
  });

  it("allows a single column", () => {
    const state = draw(opened([prose]), 2, [60, 660, 200, 720]);

    expect(regionPreview(state)!.grid).toEqual([["Apples 3"], ["Pears 5"], ["Plums 8"]]);
  });

  it("previews nothing for a Region with no text (US-54)", () => {
    const state = draw(opened([stores]), 1, [60, 400, 560, 500]);

    expect(state.region!.bbox).not.toBeNull();
    expect(regionPreview(state)).toBeNull();
  });

  it("updates the preview when Column Spacing changes (US-30)", () => {
    const before = draw(opened([tight]), 1, [60, 670, 300, 730]);
    const merged = run(before, { type: "columnSpacingChanged", value: 2.6 });

    expect(regionPreview(before)!.grid[0]).toHaveLength(4);
    expect(regionPreview(merged)!.grid[0]).toHaveLength(1);
    expect(merged.region).toEqual(before.region);
  });

  it("moving to another page clears the drawn Region (US-28)", () => {
    const state = run(draw(opened([stores, prose]), 1, [60, 670, 560, 730]), {
      type: "regionChanged",
      page: 2,
      bbox: null,
    });

    expect(state.region).toEqual({ documentId: "d1", page: 2, bbox: null });
  });

  it("ignores a page the Document does not have", () => {
    const state = draw(opened([stores]), 1, [60, 670, 560, 730]);

    expect(run(state, { type: "regionChanged", page: 9, bbox: null })).toBe(state);
  });

  it("Select Whole Page makes a Region covering the page without dragging (US-33)", () => {
    const state = run(
      opened([stores, prose]),
      { type: "regionStarted", documentId: "d1", page: 2 },
      { type: "wholePageSelected" },
    );

    expect(state.region!.bbox).toEqual([18, 18, 612 - 18, 792 - 18]);
    expect(regionPreview(state)!.grid).toHaveLength(4);
  });

  it("Cancel leaves with no changes (US-36)", () => {
    const base = opened([stores, prose]);
    const state = run(draw(base, 2, [60, 660, 200, 720]), { type: "regionCancelled" });

    expect(state).toEqual(base);
  });

  it("choosing a Table leaves Region selection", () => {
    const base = opened([stores]);
    const table = base.documents[0]!.tables[0]!;
    const state = run(draw(base, 1, [60, 670, 560, 730]), {
      type: "tableSelected",
      documentId: "d1",
      tableId: table.id,
    });

    expect(state.region).toBeNull();
  });
});

describe("saving a Region", () => {
  it("creates a Hand-drawn Table from the Region and selects it (US-27)", () => {
    const state = run(draw(opened([stores, prose]), 2, [60, 660, 200, 720]), {
      type: "regionCommitted",
    });

    const table = selectedTable(state)!;
    expect(state.region).toBeNull();
    expect(table.manual).not.toBeNull();
    expect(table.page).toBe(2);
    expect(table.parts).toEqual([{ page: 2, bbox: [60, 660, 200, 720] }]);
    expect(table.grid).toEqual([["Apples 3"], ["Pears 5"], ["Plums 8"]]);
    expect(state.documents[0]!.tables.map((t) => t.n)).toEqual([1, 2]);
  });

  it("cannot save an empty Region, or one not yet drawn (US-54)", () => {
    const none = run(opened([stores]), { type: "regionStarted", documentId: "d1", page: 1 });
    const empty = draw(opened([stores]), 1, [60, 400, 560, 500]);

    expect(run(none, { type: "regionCommitted" })).toBe(none);
    expect(run(empty, { type: "regionCommitted" })).toBe(empty);
  });

  it("replaces a Detected Table it overlaps by more than 30% (US-32)", () => {
    const base = opened([stores]);
    expect(base.documents[0]!.tables).toHaveLength(1);

    const state = run(draw(base, 1, [60, 690, 560, 730]), { type: "regionCommitted" });

    const tables = state.documents[0]!.tables;
    expect(tables).toHaveLength(1);
    expect(tables[0]!.manual).not.toBeNull();
    expect(tables[0]!.grid).toHaveLength(2);
  });

  it("keeps a Detected Table it barely touches", () => {
    const base = opened([stores]);

    const state = run(draw(base, 1, [60, 630, 560, 679]), { type: "regionCommitted" });

    const tables = state.documents[0]!.tables;
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.manual === null)).toEqual([true, false]);
  });

  it("survives Column Spacing changes, rebuilt from its Region, and stays selected", () => {
    const state = run(draw(opened([stores, prose]), 2, [60, 660, 560, 720]), {
      type: "regionCommitted",
    });
    const before = selectedTable(state)!;

    const next = run(state, { type: "columnSpacingChanged", value: 0.4 });

    const after = selectedTable(next)!;
    expect(after.manual).toBe(before.manual);
    expect(after.parts).toEqual(before.parts);
  });

  it("is rebuilt with the new Column Spacing", () => {
    const state = run(draw(opened([tight]), 1, [60, 670, 300, 730]), { type: "regionCommitted" });
    const wide = run(state, { type: "columnSpacingChanged", value: 2.6 });

    expect(selectedTable(state)!.grid[0]).toHaveLength(4);
    expect(selectedTable(wide)!.grid[0]).toHaveLength(1);
  });

  it("can be saved on a Document with no Detected Tables", () => {
    const state = run(draw(opened([prose]), 2, [60, 660, 200, 720]), { type: "regionCommitted" });

    expect(state.documents[0]!.tables).toHaveLength(1);
    expect(selectedTable(state)!.n).toBe(1);
  });
});

describe("Hand-drawn Tables and the other actions", () => {
  it("removing a Hand-drawn Table deletes its Region instead of recording a Removed Table", () => {
    const saved = run(draw(opened([stores, prose]), 2, [60, 660, 200, 720]), {
      type: "regionCommitted",
    });
    const table = selectedTable(saved)!;

    const state = run(saved, { type: "tableRemoved", documentId: "d1", tableId: table.id });

    const doc = state.documents[0]!;
    expect(doc.regions).toEqual([]);
    expect(doc.removed).toEqual([]);
    expect(doc.tables.map((t) => t.manual)).toEqual([null]);
  });

  it("asks before saving a Region would discard corrections, and saves once confirmed", () => {
    const base = opened([stores, prose]);
    const edited = run(base, {
      type: "cellEdited",
      documentId: "d1",
      tableId: base.documents[0]!.tables[0]!.id,
      row: 1,
      col: 0,
      value: "Fixed",
    });
    const drawn = draw(edited, 2, [60, 660, 200, 720]);

    const asked = run(drawn, { type: "regionCommitted" });
    expect(asked.pendingChange).toEqual({ type: "regionCommitted" });
    expect(asked.documents[0]!.regions).toEqual([]);

    const done = run(asked, { type: "changeConfirmed" });
    expect(done.documents[0]!.regions).toHaveLength(1);
    expect(selectedTable(done)!.manual).not.toBeNull();
  });
});
