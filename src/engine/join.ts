/**
 * Joining, ported from the prototype ("Joining tables across pages"): a Detected Table that
 * continues on the next page is stitched onto the one before it, the repeated Header Row dropped.
 * Internal to the Engine: covered through the workspace reducer and the golden snapshots.
 */
import type { Band } from "./detection";
import type { PageText } from "../shared/page-text";
import type { Table } from "./workspace";

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9%$€£]+/g, "");

/** Lines of text with a baseline strictly between `lo` and `hi`. */
function linesBetween(page: PageText, lo: number, hi: number): number {
  const ys: number[] = [];
  for (const it of page.items)
    if (it.y > lo && it.y < hi && !ys.some((y) => Math.abs(y - it.y) < it.h * 0.5)) ys.push(it.y);
  return ys.length;
}

/** Maps each column of the continuation onto a column of the first Part, left to right. */
function mapColumns(first: Band[], next: Band[]): number[] | null {
  const map: number[] = [];
  let from = 0;
  for (const [x0, x1] of next) {
    let found = -1;
    for (let i = from; i < first.length; i++) {
      const [y0, y1] = first[i]!;
      if (
        Math.min(x1, y1) - Math.max(x0, y0) > 0 ||
        Math.abs(x0 - y0) < 12 ||
        Math.abs(x1 - y1) < 12
      ) {
        found = i;
        break;
      }
    }
    if (found < 0) return null;
    map.push(found);
    from = found + 1;
  }
  return map;
}

/** How `next` continues `table`, or null when it does not. */
function continuation(
  pages: PageText[],
  table: Table,
  next: Table,
): { map: number[]; repeated: boolean } | null {
  const last = table.parts[table.parts.length - 1]!;
  if (next.page !== last.page + 1) return null;
  if (next.cols.length < 2 || next.cols.length < Math.ceil(table.cols.length / 2)) return null;
  const map = mapColumns(table.cols, next.cols);
  if (!map) return null;
  const head = table.grid[0]!;
  const opening = next.grid[0]!;
  const same = map.filter(
    (ai, bi) => normalise(opening[bi]!) && normalise(opening[bi]!) === normalise(head[ai]!),
  );
  const repeated = same.length >= Math.max(2, Math.ceil(head.filter(Boolean).length * 0.8));
  // The next Part opens with a header of its own, so it is a different table.
  if (!repeated && table.firstBold && next.firstBold) return null;
  const before = pages.find((p) => p.num === last.page);
  const after = pages.find((p) => p.num === next.page);
  if (!before || !after) return null;
  // Body text follows the first Part on its page, or precedes the next Part on its.
  if (linesBetween(before, before.h * 0.06, last.bbox[1]) > 2) return null;
  if (linesBetween(after, next.parts[0]!.bbox[3], after.h * 0.94) > 2) return null;
  return { map, repeated };
}

/**
 * Joins Detected Tables (in page order) that continue onto the next page. The Joined Table keeps
 * the first Part's id, number and page, and gains a Part per page; a repeated Header Row is
 * dropped and counted in `repeats`; Section Headers keep their rows, so a section crossing the
 * page break covers the rows after it.
 */
export function joinTables(
  pages: PageText[],
  tables: Table[],
  /** Ids of Tables that stand on their own: never joined to the Table before or after. */
  apart: ReadonlySet<string> = new Set(),
): Table[] {
  const out: Table[] = [];
  for (const next of tables) {
    const table = out[out.length - 1];
    const stands = apart.has(next.id) || (table !== undefined && apart.has(table.id));
    const join = table && !stands && continuation(pages, table, next);
    if (!table || !join) {
      out.push(next);
      continue;
    }
    const skip = join.repeated ? 1 : 0;
    const offset = table.grid.length - skip;
    const width = table.grid[0]!.length;
    const rows = next.grid.slice(skip).map((row) => {
      const cells: string[] = Array(width).fill("");
      row.forEach((v, i) => {
        const c = join.map[i]!;
        cells[c] = cells[c] ? `${cells[c]} ${v}` : v;
      });
      return cells;
    });
    out[out.length - 1] = {
      ...table,
      grid: [...table.grid, ...rows],
      sections: [
        ...table.sections,
        ...next.sections.filter((s) => s >= skip).map((s) => s + offset),
      ],
      parts: [...table.parts, ...next.parts],
      repeats: table.repeats + skip,
    };
  }
  return out;
}
