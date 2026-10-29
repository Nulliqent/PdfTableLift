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

  it("JSON is an array of arrays when the first row is not a header", () => {
    expect(JSON.parse(exportTable(table([["x", "y"]], false), "json"))).toEqual([["x", "y"]]);
  });
});
