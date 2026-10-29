// Seam A: a Document the PDF Reader could not read.
import { describe, expect, it } from "vitest";
import {
  initialWorkspace,
  reduce,
  selectedTable,
  type PageText,
  type TextItem,
  type WorkspaceAction,
} from "../../src/engine";

const at = (str: string, x: number, y: number, bold = false): TextItem => ({
  str,
  x,
  y,
  w: str.length * 5,
  h: 9,
  bold,
});
const row = (y: number, cells: string[], bold = false) =>
  cells.map((c, i) => at(c, [72, 200, 320, 440][i]!, y, bold));
const stores: PageText = {
  num: 1,
  w: 612,
  h: 792,
  items: [
    ...row(710, ["Store", "Region", "Q1", "Q2"], true),
    ...row(696, ["Portland", "West", "412.8", "430.1"]),
    ...row(682, ["Austin", "South", "1,204", "1,180"]),
  ],
};

const add = (id: string): WorkspaceAction => ({
  type: "documentAdded",
  id,
  name: `${id}.pdf`,
  size: 1,
});
const run = (...actions: WorkspaceAction[]) => actions.reduce(reduce, initialWorkspace);

describe("documentFailed", () => {
  it("keeps the error on its Document and leaves the others alone", () => {
    const state = run(
      add("good"),
      add("bad"),
      { type: "documentRead", id: "good", pages: [stores] },
      { type: "documentFailed", id: "bad", error: "password-protected" },
    );

    const [good, bad] = state.documents;
    expect(bad).toMatchObject({ status: "error", error: "password-protected", tables: [] });
    expect(good!.status).toBe("ready");
    expect(good!.error).toBeNull();
    expect(selectedTable(state)?.id).toBe(good!.tables[0]!.id);
  });

  it("is ignored for a Document removed while it was loading", () => {
    const state = run(add("a"), { type: "documentRemoved", id: "a" });
    expect(reduce(state, { type: "documentFailed", id: "a", error: "not-pdf" })).toBe(state);
    expect(reduce(state, { type: "documentRead", id: "a", pages: [stores] })).toBe(state);
  });

  it("lets a failed Document be removed", () => {
    const state = run(add("a"), { type: "documentFailed", id: "a", error: "no-text-layer" });
    expect(reduce(state, { type: "documentRemoved", id: "a" }).documents).toEqual([]);
  });

  it("does not turn a read Document into an error", () => {
    const read = run(add("a"), { type: "documentRead", id: "a", pages: [stores] });
    expect(reduce(read, { type: "documentFailed", id: "a", error: "not-pdf" })).toBe(read);
  });
});
