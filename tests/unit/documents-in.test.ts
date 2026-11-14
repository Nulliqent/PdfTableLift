// Seam A: the Example Document and removing Documents.
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

const page = (items: TextItem[]): PageText => ({ num: 1, w: 612, h: 792, items });

const stores = page([
  ...row(710, ["Store", "Region", "Q1", "Q2"], true),
  ...row(696, ["Portland", "West", "412.8", "430.1"]),
  ...row(682, ["Austin", "South", "1,204", "1,180"]),
]);
const prose = page([at("Nothing tabular here", 72, 700)]);

const run = (...actions: WorkspaceAction[]): WorkspaceState =>
  actions.reduce(reduce, initialWorkspace);

const add = (id: string, example = false): WorkspaceAction => ({
  type: "documentAdded",
  id,
  name: `${id}.pdf`,
  size: 1,
  example,
});
const read = (id: string, p = stores): WorkspaceAction => ({
  type: "documentRead",
  id,
  pages: [p],
});

describe("the Example Document", () => {
  it("is listed and selected like any Document, flagged as the example", () => {
    const state = run(add("ex", true), read("ex"));

    expect(state.documents.map((d) => [d.id, d.example])).toEqual([["ex", true]]);
    expect(state.selection?.documentId).toBe("ex");
  });

  it("is removed when the user's first own Document is added", () => {
    const state = run(add("ex", true), read("ex"), add("d1"));

    expect(state.documents.map((d) => d.id)).toEqual(["d1"]);
    expect(state.selection).toBeNull();
  });

  it("hands the selection to the user's Document once it is read", () => {
    const state = run(add("ex", true), read("ex"), add("d1"), read("d1"));

    expect(state.selection?.documentId).toBe("d1");
    expect(selectedTable(state)?.grid[0]).toEqual(["Store", "Region", "Q1", "Q2"]);
  });

  it("leaves the user's Documents and selection alone when it arrives late", () => {
    const state = run(add("d1"), read("d1"), add("ex", true), read("ex"));

    expect(state.documents.map((d) => d.id)).toEqual(["d1", "ex"]);
    expect(state.selection?.documentId).toBe("d1");
  });
});

describe("removing a Document", () => {
  const three = () => run(add("a"), read("a"), add("b"), read("b", prose), add("c"), read("c"));

  it("moves the selection to the next Document with Tables", () => {
    const state = reduce(three(), { type: "documentRemoved", id: "a" });

    expect(state.documents.map((d) => d.id)).toEqual(["b", "c"]);
    expect(state.selection?.documentId).toBe("c");
  });

  it("keeps the selection when another Document is removed", () => {
    const state = reduce(three(), { type: "documentRemoved", id: "c" });

    expect(state.selection?.documentId).toBe("a");
  });

  it("clears the selection when no Document with Tables remains", () => {
    const state = reduce(run(add("a"), read("a")), { type: "documentRemoved", id: "a" });

    expect(state.documents).toEqual([]);
    expect(state.selection).toBeNull();
  });

  it("ignores a Document that is not listed", () => {
    const before = run(add("a"), read("a"));

    expect(reduce(before, { type: "documentRemoved", id: "nope" })).toBe(before);
  });

  it("discards a Document removed while it was still loading", () => {
    const state = run(add("a"), { type: "documentRemoved", id: "a" }, read("a"));

    expect(state.documents).toEqual([]);
  });
});
