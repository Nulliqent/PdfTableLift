/**
 * Table detection, ported from the prototype (prototype.html, "Table detection"): text items →
 * lines → cells (split by Column Spacing × line height) → multi-line Rows (`groupRows`, spec #22,
 * not in the prototype) → runs of multi-cell lines → Tables with column bands, wrapped cells and
 * Section Headers. Where no multi-line Row is found, the behaviour is the prototype's, unchanged.
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
  /**
   * For each Section Header row, the cells it would have as a data row: its text in the column it
   * sits in. Unmarking the Section Header puts them back.
   */
  sectionCells: Record<number, string[]>;
  cols: Band[];
  /** Every cell of the first row is bold. */
  firstBold: boolean;
  bbox: Bbox;
};

type Cell = { x0: number; x1: number; text: string; bold: boolean };
/**
 * One line of text, or (after `groupRows`) one Row made of several lines. A Row keeps the first
 * line's `y` and `h`; `bottom`/`bottomH` are those of its last line.
 */
type Line = {
  y: number;
  h: number;
  items: TextItem[];
  cells: Cell[];
  bottom?: number;
  bottomH?: number;
  /** The Row rhythm this line belongs to: lines of one rhythm share the object. */
  rhythm?: Rhythm;
  /**
   * A label alone in the first column that `groupRows` set apart between multi-line Rows (spec
   * #30): a Section Header, even at the top of a Region.
   */
  section?: boolean;
};
/** The vertical rhythm of a stretch of Rows: `gap` is the smallest gap between two Rows. */
type Rhythm = { gap: number };

/** How much wider than every gap inside a Row the gaps between Rows must be. */
const ROW_GAP_RATIO = 1.75;
/**
 * For a tight line (under 1.5 line heights below its Row) that continues several Cells at once, or
 * the first column: how much wider than its gap the gaps above its Row and below it must be. The
 * wrapped-cells fixture has 14 against 11; a dense table has one even spacing and never merges.
 */
const WRAP_GAP_RATIO = 1.2;

const bottomOf = (l: Line) => l.bottom ?? l.y;
const overlap = (a: Cell, b: Cell) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0;

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

/**
 * Groups lines into multi-line Rows by the vertical rhythm of the page (spec #22).
 *
 * An anchor is a line with two or more Cells. The one-Cell lines between two anchors are split at
 * the widest gap: those above it belong to the upper anchor's Row, those below to the lower one's.
 * Anchors linked this way form a chain, and a chain is regrouped only when its rhythm is clear:
 * every gap between two Rows (including anchor to anchor) is at least ROW_GAP_RATIO times every
 * gap inside a Row. Otherwise, and whenever a one-Cell line could be something else (a first-column
 * label, a bold label, a line spanning columns), the lines stay apart exactly as before. Lines
 * that are not regrouped are returned unchanged, so tables without multi-line Rows detect as they
 * always did. Left apart on purpose: a dense table (one even spacing), a Row whose lines wrap in
 * two Cells at once (two anchors), lines in the first column, and Rows at the edge of a chain
 * with no clear gap beyond them. The tight wraps among these (two Cells at once, the first
 * column) are joined later, in `buildTable`, by the gaps around the Row (WRAP_GAP_RATIO).
 * The exception (spec #30, #33) is multi-line text in the first column: lines a Row clearly owns
 * there (`firstColumnClaims`) join it like any other Wrapped Cell, and are never labels.
 */
function groupRows(input: Line[]): Line[] {
  const lines = input.slice();
  const anchors = lines.flatMap((l, i) => (l.cells.length >= 2 ? [i] : []));
  if (anchors.length < 2) return input;
  /** The gap from line i down to line i + 1. */
  const pitch = (i: number) => lines[i]!.y - lines[i + 1]!.y;

  const claims = firstColumnClaims(lines, anchors);

  /** Can these one-Cell lines be the Wrapped Cell (part of) the anchor's Row? */
  const fits = (singles: number[], anchor: number) => {
    if (!singles.length) return true;
    const a = lines[anchor]!;
    const cs = singles.map((i) => lines[i]!.cells[0]!);
    const first = a.cells[0]!;
    const hit = (c: Cell) => a.cells.filter((ac) => overlap(ac, c));
    const own = hit(cs[0]!)[0];
    return cs.every(
      (c, k) =>
        // Not in (or left of) the first column, where Section Headers and labels live, unless
        // the line is one of this Row's own first-column lines (spec #30, #33).
        (c.x0 >= first.x1 || claims.get(singles[k]!) === anchor) &&
        // Inside one column, the same one as the other lines of the Wrapped Cell.
        hit(c).length <= 1 &&
        hit(c)[0] === own &&
        overlap(c, cs[0]!) &&
        // A bold line under plain text is a label, not a continuation.
        !(c.bold && !a.cells.some((ac) => ac.bold)),
    );
  };

  /**
   * Is line i a label alone in the first column of these anchors' Rows: one Cell that starts in
   * or left of their first Cell and touches none of their other Cells, and is not one of a Row's
   * own first-column lines (`claims`)? `fits` never lets such a line into a Row, so it can only be
   * a Section Header (spec #30).
   */
  const isLabel = (i: number, by: number[]) => {
    const l = lines[i]!;
    if (l.cells.length !== 1 || claims.has(i)) return false;
    const c = l.cells[0]!;
    return by.every((a) => {
      const [first, ...rest] = lines[a]!.cells;
      return c.x0 < first!.x1 && !rest.some((ac) => overlap(ac, c));
    });
  };
  /**
   * Is a label block set apart from the lines around it? A Section Header sits further from its
   * neighbours than a Row's lines sit from each other (`spacing`): by WRAP_GAP_RATIO when every
   * label is bold, the extra evidence the user's statements give, and by the full ROW_GAP_RATIO
   * when not. With no line spacing to compare against, there is no evidence.
   */
  const apart = (labels: number[], gaps: number[], spacing: number) => {
    const ratio = labels.every((i) => lines[i]!.cells[0]!.bold) ? WRAP_GAP_RATIO : ROW_GAP_RATIO;
    return spacing > 0 && gaps.every((g) => g >= ratio * spacing);
  };

  type Chain = {
    anchors: number[];
    joins: Map<number, number>;
    inside: number;
    between: number;
    labels: number[];
  };
  const chains: Chain[] = [];
  const start = (a: number): Chain => ({
    anchors: [a],
    joins: new Map(),
    inside: 0,
    between: Infinity,
    labels: [],
  });
  let chain = start(anchors[0]!);
  for (let k = 0; k + 1 < anchors.length; k++) {
    const a = anchors[k]!;
    const b = anchors[k + 1]!;
    if (b === a + 1) {
      chain.between = Math.min(chain.between, pitch(a));
      chain.anchors.push(b);
      continue;
    }
    // Section Headers between two Rows (spec #30): the labels are left out of the spacing, the
    // lines above them belong to the upper Row and those below to the lower one, provided the
    // labels sit apart from both. The gaps around a label measure nothing about the Rows, so they
    // count neither as a gap inside a Row nor as one between Rows.
    const labels: number[] = [];
    for (let i = a + 1; i < b; i++) if (isLabel(i, [a, b])) labels.push(i);
    if (labels.length) {
      const f = labels[0]!;
      const l = labels[labels.length - 1]!;
      const upper: number[] = [];
      const lower: number[] = [];
      for (let i = a + 1; i < f; i++) upper.push(i);
      for (let i = l + 1; i < b; i++) lower.push(i);
      const insides: number[] = [];
      for (let i = a; i < f - 1; i++) insides.push(pitch(i));
      for (let i = l + 1; i < b; i++) insides.push(pitch(i));
      const inside = Math.max(chain.inside, ...insides);
      if (
        l - f + 1 === labels.length &&
        apart(labels, [pitch(f - 1), pitch(l)], inside) &&
        fits(upper, a) &&
        fits(lower, b)
      ) {
        upper.forEach((i) => chain.joins.set(i, a));
        lower.forEach((i) => chain.joins.set(i, b));
        chain.inside = inside;
        chain.labels.push(...labels);
        chain.anchors.push(b);
        continue;
      }
    }
    const ps: number[] = [];
    for (let i = a; i < b; i++) ps.push(pitch(i));
    const split = ps.indexOf(Math.max(...ps));
    const others = Math.max(...ps.filter((_, i) => i !== split));
    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = a + 1; i < b; i++) (i <= a + split ? upper : lower).push(i);
    if (ps[split]! < ROW_GAP_RATIO * others || !fits(upper, a) || !fits(lower, b)) {
      // Spec #30 (#33): when every line between the two anchors is a first-column line claimed by
      // one of their Rows, the Rows' own shape says where the split is. The gap there must only
      // be clearly wider than the lines' spacing (WRAP_GAP_RATIO, as for a first-column wrap), but
      // it is not a gap between Rows the chain's rhythm can be measured by.
      let u = a + 1;
      while (u < b && claims.get(u) === a) u++;
      let v = b - 1;
      while (v > a && claims.get(v) === b) v--;
      if (u === v + 1 && b - a > 1) {
        const at = u - 1 - a;
        const inside = Math.max(chain.inside, ...ps.filter((_, i) => i !== at));
        if (inside > 0 && ps[at]! >= WRAP_GAP_RATIO * inside) {
          for (let i = a + 1; i < u; i++) chain.joins.set(i, a);
          for (let i = u; i < b; i++) chain.joins.set(i, b);
          chain.inside = inside;
          chain.anchors.push(b);
          continue;
        }
      }
      chains.push(chain);
      chain = start(b);
      continue;
    }
    upper.forEach((i) => chain.joins.set(i, a));
    lower.forEach((i) => chain.joins.set(i, b));
    chain.inside = Math.max(chain.inside, others);
    chain.between = Math.min(chain.between, ps[split]!);
    chain.anchors.push(b);
  }
  chains.push(chain);

  const joined = new Map<number, number>();
  for (const c of chains) {
    // A chain held together only by Section Headers has no gap between Rows to go by.
    if (!c.joins.size || c.between === Infinity || c.between < ROW_GAP_RATIO * c.inside) continue;
    // One-Cell lines above the first anchor and below the last one join them when they keep the
    // chain's rhythm and a clear gap (or the end of the page) follows.
    const edge = (anchor: number, step: 1 | -1) => {
      const taken: number[] = [];
      let i = anchor + step;
      const gap = (j: number) => (step === 1 ? pitch(j - 1) : pitch(j));
      while (
        i >= 0 &&
        i < lines.length &&
        lines[i]!.cells.length === 1 &&
        !joined.has(i) &&
        gap(i) <= c.inside
      ) {
        taken.push(i);
        i += step;
      }
      const inPage = i >= 0 && i < lines.length;
      const beyond = inPage ? gap(i) : Infinity;
      // Section Headers beyond them (one, or several in a row) may sit closer than a gap between
      // Rows (spec #30).
      const labels: number[] = [];
      for (let j = i; j >= 0 && j < lines.length && isLabel(j, [anchor]); j += step) labels.push(j);
      const label = labels.length > 0 && apart(labels, [beyond], c.inside);
      if (taken.length && (beyond >= ROW_GAP_RATIO * c.inside || label) && fits(taken, anchor)) {
        taken.forEach((j) => c.joins.set(j, anchor));
        if (label) c.labels.push(...labels);
      }
    };
    edge(c.anchors[0]!, -1);
    edge(c.anchors[c.anchors.length - 1]!, 1);
    const rhythm: Rhythm = { gap: c.between };
    for (const a of c.anchors) lines[a] = { ...lines[a]!, rhythm };
    for (const i of c.labels) lines[i] = { ...lines[i]!, section: true };
    c.joins.forEach((a, i) => joined.set(i, a));
  }
  if (!joined.size) return input;

  const members = new Map<number, number[]>();
  joined.forEach((a, i) => members.set(a, [...(members.get(a) ?? []), i]));
  const out: Line[] = [];
  lines.forEach((l, i) => {
    if (joined.has(i)) return;
    const more = members.get(i);
    out.push(
      more
        ? mergeRow(
            l,
            more.map((j) => lines[j]!),
          )
        : l,
    );
  });
  return out;
}

/**
 * The first-column lines each anchor's Row is made of, by line index (spec #30, #33): when the
 * first column holds multi-line text, a Row's other lines sit alone in that column, where a
 * Section Header would. Walking up and down from an anchor, a line is the Row's own when it is one
 * Cell inside the anchor's first Cell and none of its others, with the same weight (a bold line
 * beside plain text is a label), and sits within the Row's line spacing: closer than
 * WRAP_GAP_RATIO times the anchor's nearest such line. A Row is claimed only with two or more such
 * lines, so its spacing is measured on the Row itself; a lone line next to a one-line Row is no
 * evidence, and stays apart (the #24 "Travel" label). A line two anchors claim makes both Rows
 * unclear, and neither claims anything.
 */
function firstColumnClaims(lines: Line[], anchors: number[]): Map<number, number> {
  const claims = new Map<number, number>();
  const unclear = new Set<number>();
  for (const a of anchors) {
    const [first, ...rest] = lines[a]!.cells;
    const candidate = (i: number) => {
      const l = lines[i];
      if (!l || l.cells.length !== 1) return false;
      const c = l.cells[0]!;
      return overlap(c, first!) && !rest.some((ac) => overlap(ac, c)) && c.bold === first!.bold;
    };
    /** The gap from line i to the next one in the direction of `step`. */
    const gap = (i: number, step: 1 | -1) => Math.abs(lines[i]!.y - lines[i + step]!.y);
    const near = [-1, 1].flatMap((s) => (candidate(a + s) ? [gap(a, s as 1 | -1)] : []));
    if (!near.length) continue;
    const spacing = Math.min(...near);
    const own: number[] = [];
    for (const step of [-1, 1] as const)
      for (
        let i = a + step;
        candidate(i) && gap(i - step, step) < WRAP_GAP_RATIO * spacing;
        i += step
      )
        own.push(i);
    if (own.length < 2) continue;
    for (const i of own) {
      if (claims.has(i)) unclear.add(claims.get(i)!).add(a);
      claims.set(i, a);
    }
  }
  for (const [i, a] of claims) if (unclear.has(a)) claims.delete(i);
  return claims;
}

/** One Row from an anchor line and the one-Cell lines of its Wrapped Cell, top to bottom. */
function mergeRow(anchor: Line, singles: Line[]): Line {
  const all = [anchor, ...singles].sort((p, q) => q.y - p.y);
  const parts = singles.map((l) => ({ y: l.y, cell: l.cells[0]! }));
  const own = anchor.cells.find((ac) => parts.some((p) => overlap(ac, p.cell)));
  if (own) parts.push({ y: anchor.y, cell: own });
  parts.sort((p, q) => q.y - p.y);
  const wrapped: Cell = {
    x0: Math.min(...parts.map((p) => p.cell.x0)),
    x1: Math.max(...parts.map((p) => p.cell.x1)),
    text: parts.map((p) => p.cell.text).join(" "),
    bold: parts.every((p) => p.cell.bold),
  };
  const top = all[0]!;
  const last = all[all.length - 1]!;
  return {
    y: top.y,
    h: top.h,
    items: all.flatMap((l) => l.items),
    cells: [...anchor.cells.filter((c) => c !== own), wrapped].sort((p, q) => p.x0 - q.x0),
    bottom: last.y,
    bottomH: last.h,
    rhythm: anchor.rhythm,
  };
}

/**
 * The widest gap allowed between the first two lines of a run. Lines of one Row rhythm may sit as
 * far apart as that rhythm's Rows do.
 */
function firstGapLimit(last: Line, r: Line): number {
  const limit = Math.max(last.h, r.h) * 3;
  return last.rhythm && last.rhythm === r.rhythm
    ? Math.max(limit, last.rhythm.gap * 1.75 + 1)
    : limit;
}

/** Finds every Table on a page: runs of two or more lines with two or more cells. */
export function detectTables(items: TextItem[], columnSpacing: number): FoundTable[] {
  const lines = groupRows(linesFromItems(items, columnSpacing));
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
    const gap = last ? bottomOf(last) - r.y : Infinity;
    const limit = cur
      ? cur.gaps.length
        ? median(cur.gaps) * 1.75 + 1
        : firstGapLimit(last!, r)
      : 0;
    if (r.cells.length >= 2) {
      if (cur && gap <= limit) {
        const prevMulti = cur.rows[cur.rows.length - 1]!;
        if (!pending.length) cur.gaps.push(bottomOf(prevMulti) - r.y);
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
 * `oneRow` (a Single-Row Region) puts every line in one Row. Returns null when there are too few
 * columns.
 */
export function buildTable(rows: Line[], manual = false, oneRow = false): FoundTable | null {
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
  if (manual) addEveryLine(bands, rows, basis);
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
  if (oneRow) return singleRowTable(rows, bands, pick);
  const grid: string[][] = [];
  const ends: number[][] = [];
  const bolds: boolean[][] = [];
  const sections = new Set<number>();
  /** By grid row: the Cell of a Section Header line, in the column it sits in. */
  const asData = new Map<number, string[]>();
  /** The gap from the line above rows[i] down to it; Infinity at either end of the run. */
  const gapAbove = (i: number) =>
    i > 0 && i < rows.length ? bottomOf(rows[i - 1]!) - rows[i]!.y : Infinity;
  let prev: Line | null = null;
  /** Index in `rows` of the first line of the last grid Row. */
  let top = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const li = grid.length - 1;
    const lastRow = grid[li];
    if (prev && lastRow && !sections.has(li) && !r.section) {
      const p = bottomOf(prev) - r.y;
      const tight = p < r.h * 1.5;
      const parts = r.cells.map((c) => ({ c, b: pick(c) }));
      // Every Cell stays inside one column, a different one each, and continues text there.
      const continues = parts.every(
        ({ c, b }) =>
          bands.filter(([a, z]) => Math.min(z, c.x1) - Math.max(a, c.x0) > 1).length <= 1 &&
          lastRow[b] &&
          !(c.bold && !bolds[li]![b]) &&
          parts.filter((q) => q.b === b).length === 1,
      );
      // The prototype's wrapped cell: one Cell. In the first column it must also follow text that
      // ran to the column's edge, since section labels live there.
      const b0 = parts[0]!.b;
      const bandW = bands[b0]![1] - bands[b0]![0];
      const filledToEdge = ends[li]![b0]! >= bands[b0]![1] - Math.max(6, bandW * 0.18);
      const prototypeWrap = parts.length === 1 && (b0 > 0 || filledToEdge);
      // Spec #22: several Cells wrapping at once, or a first-column wrap, when the line sits
      // clearly closer to its Row than the Row does to the lines around it. With no line on
      // either side there is no evidence, so the lines stay apart.
      const above = gapAbove(top);
      const below = gapAbove(i + 1);
      const clearWrap =
        (above < Infinity || below < Infinity) &&
        above >= WRAP_GAP_RATIO * p &&
        below >= WRAP_GAP_RATIO * p;
      if (tight && continues && (prototypeWrap || clearWrap)) {
        for (const { c, b } of parts) {
          lastRow[b] += " " + c.text;
          ends[li]![b] = Math.max(ends[li]![b]!, c.x1);
        }
        prev = r;
        continue;
      }
    }
    top = i;
    if (r.cells.length === 1 && (grid.length || r.section) && bands.length > 1) {
      // A lone label inside the table body is a Section Header, and so is one `groupRows` set
      // apart between multi-line Rows, even at the top of a Region (spec #30).
      const g: string[] = Array(bands.length).fill("");
      g[0] = r.cells[0]!.text;
      const data: string[] = Array(bands.length).fill("");
      data[pick(r.cells[0]!)] = r.cells[0]!.text;
      asData.set(grid.length, data);
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
  const sectionCells: Record<number, string[]> = {};
  for (const [ri, data] of asData) {
    const kept = data.filter((_, i) => keep[i]);
    // A label whose column held nothing else has no column to go back to: it stays in the first.
    sectionCells[ri] = kept.some(Boolean) ? kept : clean[ri]!;
  }
  const first = rows[0]!;
  const lastR = rows[rows.length - 1]!;
  return {
    grid: clean,
    sections: [...sections],
    sectionCells,
    cols: bands.filter((_, i) => keep[i]),
    firstBold: first.cells.every((c) => c.bold),
    bbox: [
      Math.min(...bands.map((b) => b[0])) - 4,
      bottomOf(lastR) - (lastR.bottomH ?? lastR.h) * 0.35,
      Math.max(...bands.map((b) => b[1])) + 4,
      first.y + first.h * 1.05,
    ],
  };
}

/**
 * The Table of a Single-Row Region: every Cell of every line in one Row, with no Section Headers.
 * Each Cell goes to its column by position, and a column's Cells join with a space, top to bottom.
 */
function singleRowTable(lines: Line[], bands: Band[], pick: (c: Cell) => number): FoundTable {
  const row: string[] = Array(bands.length).fill("");
  for (const c of lines.flatMap((l) => l.cells)) {
    const b = pick(c);
    row[b] = row[b] ? `${row[b]} ${c.text}` : c.text;
  }
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  return {
    grid: [row],
    sections: [],
    sectionCells: {},
    cols: bands,
    firstBold: lines.every((l) => l.cells.every((c) => c.bold)),
    bbox: [
      Math.min(...bands.map((b) => b[0])) - 4,
      bottomOf(last) - (last.bottomH ?? last.h) * 0.35,
      Math.max(...bands.map((b) => b[1])) + 4,
      first.y + first.h * 1.05,
    ],
  };
}

/**
 * Columns for a Region (spec #22): a Region is the user saying where the table is, so every line
 * inside it counts, not only the lines holding most of the columns. The Cells of the other lines
 * are added narrowest first; a Cell that would join two columns (a title or caption spanning
 * them) is left out, and so are Cells inside a column already found.
 */
function addEveryLine(bands: Band[], rows: Line[], basis: Line[]): void {
  const rest = rows
    .filter((r) => !basis.includes(r))
    .flatMap((r) => r.cells)
    .sort((p, q) => p.x1 - p.x0 - (q.x1 - q.x0) || p.x0 - q.x0);
  for (const c of rest) {
    const hit = bands.filter(([a, b]) => Math.min(b, c.x1) - Math.max(a, c.x0) > 0.5);
    if (hit.length > 1) continue;
    const band = hit[0];
    if (band) {
      band[0] = Math.min(band[0], c.x0);
      band[1] = Math.max(band[1], c.x1);
    } else bands.push([c.x0, c.x1]);
  }
  bands.sort((p, q) => p[0] - q[0]);
}

/**
 * The Rows inside a Region. A Region says where the table is, not where its Rows are, so the
 * evidence for Rows is the page's rhythm: the lines of the Region's columns, over the whole page
 * height, are grouped as a Detected Table's would be, and every Row lying wholly inside the Region
 * is kept. A Region around one Row of a longer table therefore gets that Row whole, while a lone
 * Row with no rhythm around it keeps its lines apart (the ambiguity policy). The Region's own lines
 * grouped alone are used instead when they give fewer Rows, so a Region never groups less than it
 * did before.
 */
function regionRows(items: TextItem[], inside: TextItem[], region: Bbox, cs: number): Line[] {
  const own = groupRows(linesFromItems(inside, cs));
  const [x0, , x1] = region;
  const isIn = new Set(inside);
  const column = items.filter((it) => it.x + it.w / 2 >= x0 && it.x + it.w / 2 <= x1);
  const rows: Line[] = [];
  for (const r of groupRows(linesFromItems(column, cs))) {
    const n = r.items.filter((it) => isIn.has(it)).length;
    if (n === r.items.length) rows.push(r);
    else if (n)
      rows.push(
        ...linesFromItems(
          r.items.filter((it) => isIn.has(it)),
          cs,
        ),
      );
  }
  rows.sort((p, q) => q.y - p.y);
  return rows.length < own.length ? rows : own;
}

/**
 * Builds a Hand-drawn Table from the text items whose centre lies inside a Region (PDF
 * coordinates), allowing a single column. Returns null when the Region holds no text.
 * The Table's bbox is the Region itself. A Single-Row Region (`singleRow`) makes everything inside
 * it one Row, whatever its line spacing.
 */
export function regionTable(
  items: TextItem[],
  region: Bbox,
  columnSpacing: number,
  singleRow = false,
): FoundTable | null {
  const [x0, y0, x1, y1] = region;
  const inside = items.filter((it) => {
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h * 0.35;
    return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
  });
  if (!inside.length) return null;
  const rows = singleRow
    ? linesFromItems(inside, columnSpacing)
    : regionRows(items, inside, region, columnSpacing);
  const table = rows.length ? buildTable(rows, true, singleRow) : null;
  return table && { ...table, bbox: region };
}
