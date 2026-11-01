/**
 * Stacked Tables: the matching rule for Header Rows, how a Member is found among the Document's
 * current Tables, and the pure function that builds a Stacked Table from them. Nothing here is
 * stored: a Stacked Table's grid is rebuilt from its Members whenever it is shown or exported.
 */
import type { Bbox } from "./detection";
import { REMOVED_TABLE_OVERLAP, overlapRatio } from "./overlap";
import type { Document, Part, Table } from "./workspace";

/**
 * How a Member is recognised after re-detection, the way a Removed Table is: by the page and
 * bounding box of its first Part (a Joined Table's first Part), or by its Hand-drawn record id.
 * `parts` are where its Parts lay when it was ticked, so Parts later split off can be reported.
 */
export type MemberRef = { page: number; bbox: Bbox; manual: string | null; parts: Part[] };

/** Which way a Member moves in the Member order. */
export type MoveDirection = "up" | "down";

/** A Stacked Table of a Document, as actions, the selection and the UI name it. */
export type StackedTableRef = { documentId: string; stackedId: string };

/** A Stacked Table as saved on its Document: its ordered Members, never their grids. */
export type StackedTable = {
  /** Unique across the workspace. */
  id: string;
  /** Its own sequence per Document ("Stacked Table 1"); never renumbered. */
  n: number;
  members: MemberRef[];
  /**
   * The titles of the Header Row it was made with (renewed when its Members are saved): every
   * Member is matched against them. Only titles are kept, never the Members' grids.
   */
  header: string[];
  /** The Source switch: a leading column with each Row's page. Off by default. */
  source: boolean;
};

/**
 * The Tables being ticked in Select Tables, in tick order. In Edit Members, `stackedId` names the
 * Stacked Table whose Members they are; it is absent while making a new one.
 */
export type TablesInProgress = { documentId: string; ticked: MemberRef[]; stackedId?: string };

/** The matching rule's answer, with a short reason when it is no. */
export type HeaderMatch = { matches: true } | { matches: false; reason: string };

/** Why a Member's Rows are not in the Stacked Table: its Header Row stopped matching, or no current Table is it. */
export type LeftOut = "no-match" | "missing";

export type StackedMember = {
  ref: MemberRef;
  /** The Table that is this Member now, or null when none is. */
  table: Table | null;
  /** Null while its Rows are in. */
  leftOut: LeftOut | null;
  /** The matching rule's reason when it is left out for not matching, else null. */
  reason: string | null;
  /** Parts it had when ticked that are no longer in its Table (split off by page), in page order. */
  dropped: Part[];
};

/** A Stacked Table as built from its Members' current Tables. */
export type BuiltStackedTable = {
  record: StackedTable;
  /**
   * The Stacked Table as a read-only Table, for the preview and `exportTable`: the first matching
   * Member's Header Row, then each matching Member's Rows. Its `parts` are the Members' Parts in
   * Member order; it is never edited, so `combinedFrom` is empty.
   */
  table: Table;
  members: StackedMember[];
  /** For each grid row of `table`: the index into `members` and that Member's grid row it came from. */
  origin: { member: number; row: number }[];
  /**
   * While the Source switch is on, each grid row's Source Cell ("p2", the Row's own page), for
   * `exportTable` and the preview; null while it is off.
   */
  source: string[] | null;
};

const normalise = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const quoted = (s: string) => (s.trim() ? `'${s.trim()}'` : "an empty title");

/**
 * The matching rule: two Header Rows match when they have the same number of Cells and each pair is
 * equal after trimming, collapsing inner spaces and ignoring case. A Table without a Header Row never
 * matches. The reason names what differs in `table` compared with `first`.
 */
export function headerMatch(first: Table, table: Table): HeaderMatch {
  if (!table.header || !table.grid[0]) return { matches: false, reason: "No Header Row" };
  if (!first.header || !first.grid[0]) return { matches: false, reason: "No Header Row to match" };
  return titlesMatch(first.grid[0], table);
}

/** The matching rule against Header Row titles, such as those a Stacked Table saved. */
function titlesMatch(a: string[], table: Table): HeaderMatch {
  if (!table.header || !table.grid[0]) return { matches: false, reason: "No Header Row" };
  const b = table.grid[0];
  if (a.length !== b.length)
    return {
      matches: false,
      reason: `${b.length} column${b.length === 1 ? "" : "s"}, not ${a.length}`,
    };
  const i = a.findIndex((v, c) => normalise(v) !== normalise(b[c]!));
  if (i >= 0) return { matches: false, reason: `${quoted(b[i]!)} instead of ${quoted(a[i]!)}` };
  return { matches: true };
}

/** The Member reference of a Table as it stands. */
export const memberRef = (table: Table): MemberRef => ({
  page: table.parts[0]!.page,
  bbox: table.parts[0]!.bbox,
  manual: table.manual,
  parts: table.parts,
});

/**
 * The record with these Members. Its saved Header Row is renewed only when the first Member is a
 * different Table than before: then from the first of them that is a Table with a Header Row now.
 * Stacking (from an empty record) and saving Members in Edit Members both use it.
 */
export function withMembers(
  doc: Document,
  record: StackedTable,
  members: MemberRef[],
): StackedTable {
  const tables = tickedTables(doc, members);
  if (record.members.length > 0 && tables[0] === tickedTables(doc, record.members)[0])
    return { ...record, members };
  const first = tables.find((t) => t.header && t.grid[0]);
  return { ...record, members, header: first ? [...first.grid[0]!] : record.header };
}

/** Whether one of the Table's Parts lies on the Part's page over its box, as `findMember` judges. */
export const coversPart = (table: Table, part: Part) =>
  table.parts.some(
    (p) => p.page === part.page && overlapRatio(p.bbox, part.bbox) > REMOVED_TABLE_OVERLAP,
  );

/**
 * The Table of the Document that is this Member now, or null. A Hand-drawn Member is its record's
 * Table. Any other is the Detected Table whose first Part lies on the same page over the same box
 * (more than REMOVED_TABLE_OVERLAP), so it survives re-detection with another Column Spacing, and a
 * Joined Member split by page stays its first Part.
 */
export function findMember(doc: Document, ref: MemberRef): Table | null {
  if (ref.manual !== null) return doc.tables.find((t) => t.manual === ref.manual) ?? null;
  let best: Table | null = null;
  let bestOverlap = REMOVED_TABLE_OVERLAP;
  for (const t of doc.tables) {
    const first = t.parts[0]!;
    if (t.manual !== null || first.page !== ref.page) continue;
    const overlap = overlapRatio(first.bbox, ref.bbox);
    if (overlap > bestOverlap) [best, bestOverlap] = [t, overlap];
  }
  return best;
}

/** The ticked Tables as they stand, in tick order (a ref no current Table is, is skipped). */
export const tickedTables = (doc: Document, ticked: MemberRef[]): Table[] =>
  ticked.flatMap((r) => findMember(doc, r) ?? []);

/**
 * Whether a Table can be ticked, and why not. In Select Tables, before the first tick only the
 * Header Row is judged; after it, the matching rule against the first ticked Table. In Edit
 * Members, the matching rule against the Header Row the Stacked Table saved. A ticked Table always
 * can be (unticked).
 */
export function tickMatch(doc: Document, stacking: TablesInProgress, table: Table): HeaderMatch {
  const tables = tickedTables(doc, stacking.ticked);
  if (tables.some((t) => t.id === table.id)) return { matches: true };
  const record = doc.stacked.find((s) => s.id === stacking.stackedId);
  if (record) return titlesMatch(record.header, table);
  const first = tables[0];
  if (first) return headerMatch(first, table);
  return table.header && table.grid[0]
    ? { matches: true }
    : { matches: false, reason: "No Header Row" };
}

/**
 * Builds a Stacked Table from the Document's current Tables. Every Member is judged by the matching
 * rule against the Header Row saved with the record, so a Member edited afterwards is left out on
 * its own and comes back once it matches again. The Header Row shown is the first matching Member's,
 * as written there (the saved titles while none matches); each matching Member adds its Rows minus
 * its Header Row. Section Headers keep their Cells, with their row indexes shifted.
 */
export function buildStackedTable(doc: Document, record: StackedTable): BuiltStackedTable {
  const members: StackedMember[] = record.members.map((ref) => {
    const table = findMember(doc, ref);
    if (!table) return { ref, table, leftOut: "missing", reason: null, dropped: [] };
    const dropped = ref.parts.filter((p) => !coversPart(table, p));
    const match = titlesMatch(record.header, table);
    return match.matches
      ? { ref, table, leftOut: null, reason: null, dropped }
      : { ref, table, leftOut: "no-match", reason: match.reason, dropped };
  });
  const headIndex = members.findIndex((m) => m.leftOut === null);
  const head = members[headIndex]?.table ?? null;
  const grid: string[][] = [head ? head.grid[0]! : record.header];
  const origin: BuiltStackedTable["origin"] = head ? [{ member: headIndex, row: 0 }] : [];
  const sections: number[] = [];
  const sectionCells: Record<number, string[]> = {};
  const parts: Part[] = [];
  members.forEach((m, i) => {
    const t = m.table;
    if (!t || m.leftOut) return;
    parts.push(...t.parts);
    const offset = grid.length - 1;
    for (const s of t.sections) {
      if (s === 0) continue;
      sections.push(s + offset);
      if (t.sectionCells[s]) sectionCells[s + offset] = t.sectionCells[s];
    }
    t.grid.slice(1).forEach((row, r) => {
      grid.push(row);
      origin.push({ member: i, row: r + 1 });
    });
  });
  const rowPages = head
    ? origin.map((o) => members[o.member]!.table!.rowPages[o.row]!)
    : [record.members[0]?.page ?? 1];
  const table: Table = {
    id: record.id,
    n: record.n,
    page: parts[0]?.page ?? record.members[0]?.page ?? 1,
    parts,
    header: true,
    firstBold: false,
    grid,
    rowPages,
    sections,
    sectionCells,
    combinedFrom: {},
    cols: head?.cols ?? [],
    repeats: 0,
    splitFrom: false,
    edited: false,
    manual: null,
  };
  const source = record.source ? rowPages.map((p) => `p${p}`) : null;
  return { record, table, members, origin, source };
}

/** The number the next Stacked Table of the Document gets: one past the highest standing. */
export const nextStackedNumber = (doc: Document): number =>
  Math.max(0, ...doc.stacked.map((s) => s.n)) + 1;

/** A new Stacked Table of the Document with these Tables as its Members, in order. */
export function newStackedTable(doc: Document, tables: Table[]): StackedTable {
  const n = nextStackedNumber(doc);
  return withMembers(
    doc,
    { id: `${doc.id}:stacked:${n}`, n, members: [], header: [], source: false },
    tables.map(memberRef),
  );
}

/**
 * Ticking or unticking a Table: the Tables in progress after it, how many Tables are ticked then,
 * and how many of the Document's Tables can't be ticked then. Null when nothing changes: the Table
 * is already as asked, or it fails the matching rule. Unticking removes only that Table's ref:
 * every other ref stays as it was, so a missing Member and a Member's split-off Parts are kept.
 */
export function tickOutcome(
  doc: Document,
  stacking: TablesInProgress,
  table: Table,
  ticked: boolean,
): { stacking: TablesInProgress; count: number; unmatched: number } | null {
  const isTicked = tickedTables(doc, stacking.ticked).some((t) => t.id === table.id);
  if (isTicked === ticked) return null;
  if (ticked && !tickMatch(doc, stacking, table).matches) return null;
  const next = {
    ...stacking,
    ticked: ticked
      ? [...stacking.ticked, memberRef(table)]
      : stacking.ticked.filter((r) => findMember(doc, r) !== table),
  };
  return {
    stacking: next,
    count: tickedTables(doc, next.ticked).length,
    unmatched: doc.tables.filter((t) => !tickMatch(doc, next, t).matches).length,
  };
}

/**
 * Moving a ticked Table one place up or down: the Tables in progress after it, and where it then
 * stands (from 1) among the ticked Tables that are found, of how many. A Member no current Table
 * is has no checkbox, so a move steps over it and it is not counted. Null at either end.
 */
export function memberMove(
  doc: Document,
  stacking: TablesInProgress,
  tableId: string,
  direction: MoveDirection,
): { stacking: TablesInProgress; position: number; count: number } | null {
  const found = stacking.ticked.map((r) => findMember(doc, r));
  const i = found.findIndex((t) => t?.id === tableId);
  if (i < 0) return null;
  const step = direction === "up" ? -1 : 1;
  let j = i + step;
  while (j >= 0 && j < found.length && !found[j]) j += step;
  if (j < 0 || j >= found.length) return null;
  const ticked = [...stacking.ticked];
  [ticked[i], ticked[j]] = [ticked[j]!, ticked[i]!];
  const position = found.slice(0, j + 1).filter(Boolean).length;
  return { stacking: { ...stacking, ticked }, position, count: found.filter(Boolean).length };
}

/**
 * Drops a Table the user removed from every Stacked Table it is a Member of, for good: restoring
 * it does not bring it back. That includes a Member that had become a later Part of it. A Stacked
 * Table left with one Member still stands; one left with none is gone.
 */
export function withoutMember(doc: Document, table: Table): Document {
  const isTable = (ref: MemberRef) =>
    findMember(doc, ref) === table ||
    (ref.manual === null && table.manual === null && coversPart(table, ref));
  if (!doc.stacked.some((s) => s.members.some(isTable))) return doc;
  const stacked = doc.stacked
    .map((s) => ({ ...s, members: s.members.filter((ref) => !isTable(ref)) }))
    .filter((s) => s.members.length > 0);
  return { ...doc, stacked };
}

/** The Document with that Stacked Table replaced by the changed one. */
export const withStacked = (
  doc: Document,
  record: StackedTable,
  changed: StackedTable,
): Document => ({ ...doc, stacked: doc.stacked.map((s) => (s === record ? changed : s)) });
