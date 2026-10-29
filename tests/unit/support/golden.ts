// Loads the golden snapshots recorded from the prototype on pdf.js 3.11 (tests/golden/README.md).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PageText } from "../../../src/engine";

export const root = join(import.meta.dirname, "..", "..", "..");
const snapshotDir = join(root, "tests", "golden", "snapshots");

type Exports = Record<"csv" | "tsv" | "md" | "json", string>;

export type GoldenTable = {
  n: number;
  pages: number[];
  parts: { page: number; bbox: [number, number, number, number] }[];
  header: boolean;
  firstBold: boolean;
  grid: string[][];
  sections: number[];
  cols: [number, number][];
  repeats: number;
  /** The export texts by Section Mode, or (large fixtures) `exportDigests` instead. */
  exports?: { column: Exports; rows: Exports };
  /** Lowercase hex SHA-256 of each UTF-8 export text. */
  exportDigests?: { column: Exports; rows: Exports };
};

export type GoldenRun = { columnSpacing: number; joining: boolean; tables: GoldenTable[] };

export type Golden = {
  /** File name without extension, e.g. "section-headers". */
  name: string;
  fixture: string;
  status: "ready" | "error";
  error: string;
  pages: PageText[];
  runs: GoldenRun[];
};

export function loadGoldens(): Golden[] {
  return readdirSync(snapshotDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({
      name: f.replace(/\.json$/, ""),
      ...JSON.parse(readFileSync(join(snapshotDir, f), "utf8")),
    }));
}

export const fixtureBytes = (golden: Golden) =>
  new Uint8Array(readFileSync(join(root, golden.fixture)));
