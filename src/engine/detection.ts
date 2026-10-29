/**
 * Table detection, ported from the prototype (prototype.html, "Table detection") with its
 * behaviour unchanged: text items → lines → cells (split by Column Spacing × line height) →
 * runs of multi-cell lines → Tables with column bands, wrapped cells and Section Headers.
 * Internal to the Engine: covered through the workspace reducer and the golden snapshots.
 */
import type { TextItem } from "../shared/page-text";

/** A box in PDF coordinates: [x0, y0, x1, y1], y up. */
export type Bbox = [number, number, number, number];
/** A column's horizontal extent: [x0, x1]. */
export type Band = [number, number];

/** What detection finds on one page, before it becomes a workspace Table. */
export type FoundTable = {
  grid: string[][];
  /** Grid row indexes of Section Headers. */
  sections: number[];
  cols: Band[];
  /** Every cell of the first row is bold. */
  firstBold: boolean;
  bbox: Bbox;
};

type Cell = { x0: number; x1: number; text: string; bold: boolean };
type Line = { y: number; h: number; items: TextItem[]; cells: Cell[] };

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
}

/** Groups items into lines (top to bottom) and each line's items into cells. */
export function linesFromItems(items: TextItem[], columnSpacing: number): Line[] {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const r = lines[lines.length - 1];
    if (r && Math.abs(r.y - it.y) <= Math.max(1.5, Math.min(r.h, it.h) * 0.45)) r.items.push(it);
    else lines.push({ y: it.y, h: it.h, items: [it], cells: [] });
  }
  for (const r of lines) {
    r.items.sort((a, b) => a.x - b.x);
    r.h = Math.max(...r.items.map((i) => i.h));
    const cells: Cell[] = [];
    let cur: Cell | null = null;
    for (const it of r.items) {
      if (cur) {
        const gap = it.x - cur.x1;
        if (gap < columnSpacing * r.h) {
          const sp = gap > r.h * 0.1 && !/\s$/.test(cur.text) && !/^\s/.test(it.str);
          cur.text += (sp ? " " : "") + it.str;
          cur.x1 = Math.max(cur.x1, it.x + it.w);
          continue;
        }
      }
      cur = { x0: it.x, x1: it.x + it.w, text: it.str, bold: true };
      cells.push(cur);
    }
    for (const it of r.items)
      for (const c of cells) if (it.x >= c.x0 - 0.5 && it.x < c.x1 && !it.bold) c.bold = false;
    cells.forEach((c) => (c.text = c.text.replace(/\s+/g, " ").trim()));
    r.cells = cells.filter((c) => c.text);
  }
  return lines.filter((r) => r.cells.length);
}

/** Finds every Table on a page: runs of two or more lines with two or more cells. */
export function detectTables(items: TextItem[], columnSpacing: number): FoundTable[] {
  const lines = linesFromItems(items, columnSpacing);
  const tables: FoundTable[] = [];
  let run: { rows: Line[]; gaps: number[] } | null = null;
  let pending: Line[] = [];
  const finish = () => {
    if (run && run.rows.filter((r) => r.cells.length >= 2).length >= 2) {
      const t = buildTable(run.rows);
      if (t) tables.push(t);
    }
    run = null;
    pending = [];
  };
  for (const r of lines) {
    // `run` is reassigned inside finish(); read it through a cast so TypeScript doesn't narrow it.
    const cur = run as { rows: Line[]; gaps: number[] } | null;
    const last = cur
      ? pending.length
        ? pending[pending.length - 1]!
        : cur.rows[cur.rows.length - 1]!
      : null;
    const gap = last ? last.y - r.y : Infinity;
    const limit = cur
      ? cur.gaps.length
        ? median(cur.gaps) * 1.75 + 1
        : Math.max(last!.h, r.h) * 3
      : 0;
    if (r.cells.length >= 2) {
      if (cur && gap <= limit) {
        const prevMulti = cur.rows[cur.rows.length - 1]!;
        if (!pending.length) cur.gaps.push(prevMulti.y - r.y);
        cur.rows.push(...pending, r);
        pending = [];
      } else {
        finish();
        run = { rows: [r], gaps: [] };
      }
    } else if (cur && gap <= limit && pending.length < 4) {
      pending.push(r);
    } else finish();
  }
  finish();
  return tables;
}

/**
 * Builds a grid from a run of lines. `manual` (a Region the user drew) allows one column.
 * Returns null when there are too few columns.
 */
export function buildTable(rows: Line[], manual = false): FoundTable | null {
  const multi = rows.filter((r) => r.cells.length >= 2);
  const maxC = multi.length ? Math.max(...multi.map((r) => r.cells.length)) : 1;
  const basis = multi.filter((r) => r.cells.length >= Math.max(2, Math.ceil(maxC * 0.6)));
  const iv = basis
    .flatMap((r) => r.cells.map((c): Band => [c.x0, c.x1]))
    .sort((a, b) => a[0] - b[0]);
  const bands: Band[] = [];
  for (const [a, b] of iv) {
    const cur = bands[bands.length - 1];
    if (cur && a < cur[1] - 0.5) cur[1] = Math.max(cur[1], b);
    else bands.push([a, b]);
  }
  if (!bands.length && manual) {
    const all = rows.flatMap((r) => r.cells);
    bands.push([Math.min(...all.map((c) => c.x0)), Math.max(...all.map((c) => c.x1))]);
  }
  if (bands.length < (manual ? 1 : 2)) return null;
  const pick = (c: Cell) => {
    let best = -1;
    let bestO = 0;
    bands.forEach(([a, b], i) => {
      const o = Math.min(b, c.x1) - Math.max(a, c.x0);
      if (o > bestO) {
        bestO = o;
        best = i;
      }
    });
    if (best < 0) {
      const m = (c.x0 + c.x1) / 2;
      let d = Infinity;
      bands.forEach(([a, b], i) => {
        const dd = Math.abs((a + b) / 2 - m);
        if (dd < d) {
          d = dd;
          best = i;
        }
      });
    }
    return best;
  };
  const grid: string[][] = [];
  const ends: number[][] = [];
  const bolds: boolean[][] = [];
  const sections = new Set<number>();
  let prev: Line | null = null;
  for (const r of rows) {
    if (r.cells.length === 1 && prev) {
      const c = r.cells[0]!;
      const b = pick(c);
      const gi = grid.length - 1;
      const g = grid[gi];
      const spans = bands.filter(([a, z]) => Math.min(z, c.x1) - Math.max(a, c.x0) > 1).length;
      const tight = prev.y - r.y < r.h * 1.5;
      const bandW = bands[b]![1] - bands[b]![0];
      const filledToEdge = g && g[b] && ends[gi]![b]! >= bands[b]![1] - Math.max(6, bandW * 0.18);
      const boldShift = c.bold && !bolds[gi]![b];
      // A wrapped cell: tight line spacing, stays inside one column, and continues text in that
      // column. In the first column it must also follow text that ran to the column's edge,
      // since section labels live there.
      if (
        tight &&
        spans <= 1 &&
        g &&
        g[b] &&
        (b > 0 || filledToEdge) &&
        !boldShift &&
        !sections.has(gi)
      ) {
        g[b] += " " + c.text;
        ends[gi]![b] = Math.max(ends[gi]![b]!, c.x1);
        prev = r;
        continue;
      }
    }
    if (r.cells.length === 1 && grid.length && bands.length > 1) {
      // A lone label inside the table body is a Section Header.
      const g: string[] = Array(bands.length).fill("");
      g[0] = r.cells[0]!.text;
      sections.add(grid.length);
      grid.push(g);
      ends.push(Array(bands.length).fill(0));
      bolds.push(Array(bands.length).fill(r.cells[0]!.bold));
      prev = r;
      continue;
    }
    const g: string[] = Array(bands.length).fill("");
    const e: number[] = Array(bands.length).fill(0);
    const bo: boolean[] = Array(bands.length).fill(false);
    for (const c of r.cells) {
      const b = pick(c);
      g[b] = g[b] ? g[b] + " " + c.text : c.text;
      e[b] = Math.max(e[b]!, c.x1);
      bo[b] = c.bold;
    }
    grid.push(g);
    ends.push(e);
    bolds.push(bo);
    prev = r;
  }
  // Drop columns that only ever hold Section Header text.
  const keep = bands.map((_, i) => i === 0 || grid.some((g, ri) => !sections.has(ri) && g[i]));
  const clean = grid.map((g) => g.filter((_, i) => keep[i]));
  const first = rows[0]!;
  const lastR = rows[rows.length - 1]!;
  return {
    grid: clean,
    sections: [...sections],
    cols: bands.filter((_, i) => keep[i]),
    firstBold: first.cells.every((c) => c.bold),
    bbox: [
      Math.min(...bands.map((b) => b[0])) - 4,
      lastR.y - lastR.h * 0.35,
      Math.max(...bands.map((b) => b[1])) + 4,
      first.y + first.h * 1.05,
    ],
  };
}
