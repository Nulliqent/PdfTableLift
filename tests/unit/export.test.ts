import { describe, expect, it } from "vitest";
import { exportTable, type Table } from "../../src/engine";

const table = (grid: string[][], header = true): Table =>
  ({ grid, header, sections: [], parts: [] }) as unknown as Table;

const grid = [
  ["Item", "Qty", "Price"],
  ["Tea | green", "2", "$1,200.50"],
  ["Cup", "10", "(3.00)"],
];

describe("exportTable", () => {
  it("TSV replaces tabs and newlines inside cells so columns stay intact", () => {
    expect(exportTable(table([["a\tb", "c\nd"]]), "tsv")).toBe("a b\tc d");
  });

  it("Markdown right-aligns numeric columns and escapes pipes", () => {
    expect(exportTable(table(grid), "md")).toBe(
      "| Item | Qty | Price |\n| --- | ---: | ---: |\n| Tea \\| green | 2 | $1,200.50 |\n| Cup | 10 | (3.00) |",
    );
  });

  it("Markdown names columns when there is no header", () => {
    expect(exportTable(table([["a", "1"]], false), "md")).toBe(
      "| Column 1 | Column 2 |\n| --- | ---: |\n| a | 1 |",
    );
  });

  it("JSON keys objects by header names, with column_N for an empty one", () => {
    const rows = JSON.parse(
      exportTable(
        table([
          ["Name", ""],
          ["x", "y"],
        ]),
        "json",
      ),
    );
    expect(rows).toEqual([{ Name: "x", column_2: "y" }]);
  });

  it("JSON keeps every column when header names repeat, suffixing the later ones", () => {
    const rows = JSON.parse(
      exportTable(
        table([
          ["Name", "Name", "Name_2", "Name"],
          ["a", "b", "c", "d"],
        ]),
        "json",
      ),
    );
    expect(rows).toEqual([{ Name: "a", Name_2: "b", Name_2_2: "c", Name_3: "d" }]);
  });

  it("JSON keeps a real Section column apart from the injected one in As Column mode", () => {
    const t = {
      grid: [
        ["Section", "Qty"],
        ["East"],
        ["Tea", "2"],
      ],
      header: true,
      sections: [1],
      parts: [],
    } as unknown as Table;
    expect(JSON.parse(exportTable(t, "json", "column"))).toEqual([
      { Section: "East", Section_2: "Tea", Qty: "2" },
    ]);
  });

  it("JSON is an array of arrays when the first row is not a header", () => {
    expect(JSON.parse(exportTable(table([["x", "y"]], false), "json"))).toEqual([["x", "y"]]);
  });
});
