/**
 * The workspace reducer: one pure `reduce(state, action)` holding the Documents, their Tables,
 * the selection and the settings. The UI drives it with a single useReducer.
 *
 * To add an action: add a member to WorkspaceAction and a case to `reduce`. TypeScript's
 * exhaustiveness check in the default branch flags any action left unhandled.
 */
import type { PageText } from "../shared/page-text";
import type { ReadError } from "../shared/read-error";
import { detectTables, regionTable, type Band, type Bbox, type FoundTable } from "./detection";
import { joinTables } from "./join";
import { HAND_DRAWN_OVERLAP, REMOVED_TABLE_OVERLAP, overlapRatio } from "./overlap";

export type { Band, Bbox } from "./detection";

/** The piece of a Table that lies on one page. A Detected Table has one Part until joining. */
export type Part = { page: number; bbox: Bbox };

export type Table = {
  /** Stable for a given detection; unique across the workspace. */
  id: string;
  /** 1-based position in the Document's Table list ("Table 2"). */
  n: number;
  /** The page of the first Part. */
  page: number;
  parts: Part[];
  /** "First row is header". On after detection. */
  header: boolean;
  /** Every cell of the first row is bold. */
  firstBold: boolean;
  grid: string[][];
  /** Grid row indexes of Section Headers. */
  sections: number[];
  /** Column bands, one per grid column. */
  cols: Band[];
  /** Repeated Header Rows dropped by joining. */
  repeats: number;
  /** The user split it from the Table before it, which Join Again would rejoin. */
  splitFrom: boolean;
  /** The user corrected a cell or the Header Row; re-detection would discard it. */
  edited: boolean;
  /** The id of the Region a Hand-drawn Table is built from ("Selected by hand"); null if Detected. */
  manual: string | null;
};

/** A Region the user drew on a page; it yields a Hand-drawn Table. */
export type Region = {
  id: string;
  page: number;
  bbox: Bbox;
  /** The Part of the Detected Table this Region was redrawn from; it stays hidden, wherever the Region moves. */
  replaces: Part | null;
  /** The other Parts of the Joined Table that Part belonged to; they stand on their own, never joined. */
  apart: Part[];
};

/** What a redraw carries over from the Table whose Region is being redrawn. */
export type Redraw = {
  /** The Region being redrawn if the Table was Hand-drawn, else null (a new Region is made). */
  regionId: string | null;
  replaces: Part | null;
  apart: Part[];
};

/**
 * The Region being selected: the page shown and the box dragged so far (null before any drag).
 * `redraw` is set when it was opened from a Table, else null.
 */
export type RegionInProgress = {
  documentId: string;
  page: number;
  bbox: Bbox | null;
  redraw: Redraw | null;
};

/** A Detected Table the user dismissed, recorded by page and bounding box so it survives re-detection. */
export type RemovedTable = {
  id: string;
  /** Removal order within the Document; makes `id` unique. */
  seq: number;
  /** Its number when removed ("Table 2"). */
  n: number;
  parts: Part[];
};

export type Document = {
  id: string;
  name: string;
  /** File size in bytes. */
  size: number;
  status: "loading" | "ready" | "error";
  /** Why the PDF Reader could not read it; set exactly when `status` is "error". */
  error: ReadError | null;
  /** The Example Document that greets first-time visitors. */
  example: boolean;
  pages: PageText[];
  tables: Table[];
  /** Removed Tables, hidden from `tables` until restored. */
  removed: RemovedTable[];
  /** Regions drawn by hand; each stands as a Hand-drawn Table. */
  regions: Region[];
  /** Pages whose first Part must not join the page before: the user split a Joined Table there. */
  noJoin: number[];
};

export type Settings = {
  /** 0.4–2.6, default 1.0. */
  columnSpacing: number;
  /** Join Tables that continue onto the next page. On by default. */
  join: boolean;
};

export type Selection = { documentId: string; tableId: string };

/**
 * An action that re-detects Tables and so would discard corrections. Without `discardEdits`, the
 * reducer refuses to run it while any Table is edited and parks it in `pendingChange` instead.
 */
export type DiscardingAction = { discardEdits?: boolean } & (
  | { type: "columnSpacingChanged"; value: number }
  /** The join switch moved; every Document is re-detected. */
  | { type: "joinChanged"; value: boolean }
  /** The user removed a Detected Table; it is hidden through re-detection until restored. */
  | { type: "tableRemoved"; documentId: string; tableId: string }
  /** The user restored a Removed Table from the sidebar. */
  | { type: "tableRestored"; documentId: string; removedId: string }
  /** The user split a Joined Table into its Parts; each page is kept from joining the one before. */
  | { type: "splitByPage"; documentId: string; tableId: string }
  /** The user undid a split: the Table rejoins the one before it. */
  | { type: "joinAgain"; documentId: string; tableId: string }
  /** Save the Region in progress as a Hand-drawn Table. Ignored while the Region holds no text. */
  | { type: "regionCommitted" }
);

export type WorkspaceState = {
  documents: Document[];
  selection: Selection | null;
  /** The Region in progress while the user is in Select Region, else null. */
  region: RegionInProgress | null;
  settings: Settings;
  /**
   * The change waiting for the user to confirm that edits may be discarded, or null. The UI shows
   * a confirmation while it is set and answers with `changeConfirmed` or `changeCancelled`.
   * To guard another action: add it to DiscardingAction and start its case with `guardEdits`.
   */
  pendingChange: DiscardingAction | null;
};

export type WorkspaceAction =
  /** A Document was chosen; it shows as loading while the PDF Reader reads it. */
  | { type: "documentAdded"; id: string; name: string; size: number; example?: boolean }
  /** The PDF Reader returned the Document's pages; its Tables are detected. */
  | { type: "documentRead"; id: string; pages: PageText[] }
  /** The PDF Reader could not read the Document; the error stays on it and nothing else changes. */
  | { type: "documentFailed"; id: string; error: ReadError }
  | { type: "tableSelected"; documentId: string; tableId: string }
  /** The user removed a Document. Selection moves to the next Document with Tables. */
  | { type: "documentRemoved"; id: string }
  /** The Column Spacing slider moved; every Document is re-detected. */
  | DiscardingAction
  /** The user confirmed the pending change: it runs with the edits discarded. */
  | { type: "changeConfirmed" }
  /** The user cancelled the pending change: nothing changes. */
  | { type: "changeCancelled" }
  /**
   * Select Region was entered for a Document, on the given page. With `tableId` it redraws that
   * Table's Region (the Part on `page` for a Joined Table), opening on its current bounds.
   */
  | { type: "regionStarted"; documentId: string; page: number; tableId?: string }
  /** The page was stepped, or the Region dragged (bbox in PDF points; null clears it). */
  | { type: "regionChanged"; page: number; bbox: Bbox | null }
  /** Select Whole Page: the Region covers the current page. */
  | { type: "wholePageSelected" }
  /** Escape or Cancel: leave Region selection with no changes. */
  | { type: "regionCancelled" }
  /** A cell was corrected (grid coordinates, Header Row included). */
  | {
      type: "cellEdited";
      documentId: string;
      tableId: string;
      row: number;
      col: number;
      value: string;
    }
  /** "First row is header" was switched. */
  | { type: "headerToggled"; documentId: string; tableId: string; header: boolean }
  /** A row number was clicked: the grid row becomes a Section Header, or a data row again. */
  | { type: "sectionHeaderToggled"; documentId: string; tableId: string; row: number };

/** Margin left around the page by Select Whole Page, in points. */
const WHOLE_PAGE_MARGIN = 18;

export const MIN_COLUMN_SPACING = 0.4;
export const MAX_COLUMN_SPACING = 2.6;

/** A stored or typed value as a valid Column Spacing (one decimal in range), else null. */
export function parseColumnSpacing(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < MIN_COLUMN_SPACING || value > MAX_COLUMN_SPACING) return null;
  return Math.round(value * 10) / 10;
}

export const DEFAULT_SETTINGS: Settings = { columnSpacing: 1, join: true };

export const initialWorkspace: WorkspaceState = {
  documents: [],
  selection: null,
  region: null,
  settings: DEFAULT_SETTINGS,
  pendingChange: null,
};

export function reduce(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "documentAdded": {
      const doc: Document = {
        id: action.id,
        name: action.name,
        size: action.size,
        status: "loading",
        error: null,
        example: action.example === true,
        pages: [],
        tables: [],
        removed: [],
        regions: [],
        noJoin: [],
      };
      // The Example Document steps aside when the user's first own Document opens.
      const kept = action.example ? state.documents : state.documents.filter((d) => !d.example);
      const next = { ...state, documents: [...kept, doc] };
      return selectedDocument(next) ? next : { ...next, selection: null };
    }
    case "documentRemoved": {
      if (!state.documents.some((d) => d.id === action.id)) return state;
      const next = { ...state, documents: state.documents.filter((d) => d.id !== action.id) };
      if (selectedTable(next)) return next;
      const following = next.documents.find((d) => d.tables.length);
      return {
        ...next,
        selection: following
          ? { documentId: following.id, tableId: following.tables[0]!.id }
          : null,
      };
    }
    case "documentRead": {
      const doc = state.documents.find((d) => d.id === action.id);
      // Ignored for a Document removed while it was loading.
      if (!doc) return state;
      const tables = detectDocument(doc, action.pages, state.settings);
      const read: Document = { ...doc, status: "ready", pages: action.pages, tables };
      const next = { ...state, documents: state.documents.map((d) => (d === doc ? read : d)) };
      // Keep what the user is looking at; otherwise show this Document's first Table. The Example
      // Document opens on its first Table with Section Headers, which shows them off.
      if (selectedTable(next)) return next;
      const shown = (doc.example && tables.find((t) => t.sections.some((r) => r > 0))) || tables[0];
      return {
        ...next,
        selection: shown ? { documentId: doc.id, tableId: shown.id } : null,
      };
    }
    case "documentFailed": {
      const doc = state.documents.find((d) => d.id === action.id);
      if (doc?.status !== "loading") return state;
      const failed: Document = { ...doc, status: "error", error: action.error };
      return { ...state, documents: state.documents.map((d) => (d === doc ? failed : d)) };
    }
    case "tableSelected": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      if (!doc?.tables.some((t) => t.id === action.tableId)) return state;
      return {
        ...state,
        region: null,
        selection: { documentId: action.documentId, tableId: action.tableId },
      };
    }
    case "columnSpacingChanged": {
      const columnSpacing = parseColumnSpacing(action.value);
      if (columnSpacing === null || columnSpacing === state.settings.columnSpacing) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const settings = { ...state.settings, columnSpacing };
      const documents = state.documents.map((d) =>
        d.status === "ready" ? { ...d, tables: detectDocument(d, d.pages, settings) } : d,
      );
      return {
        ...state,
        settings,
        documents,
        selection: keepSelection(state, documents),
        pendingChange: null,
      };
    }
    case "joinChanged": {
      if (typeof action.value !== "boolean" || action.value === state.settings.join) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const settings = { ...state.settings, join: action.value };
      const documents = state.documents.map((d) =>
        d.status === "ready" ? { ...d, tables: detectDocument(d, d.pages, settings) } : d,
      );
      return {
        ...state,
        settings,
        documents,
        selection: keepSelection(state, documents),
        pendingChange: null,
      };
    }
    case "tableRemoved": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      const table = doc?.tables.find((t) => t.id === action.tableId);
      if (!doc || !table) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const n = Math.max(0, ...doc.removed.map((r) => r.seq)) + 1;
      // A Hand-drawn Table is deleted with its Region; a Detected Table is recorded as removed.
      const gone: Document = table.manual
        ? { ...doc, regions: doc.regions.filter((r) => r.id !== table.manual) }
        : {
            ...doc,
            removed: [
              ...doc.removed,
              { id: `${doc.id}:removed:${n}`, seq: n, n: table.n, parts: table.parts },
            ],
          };
      const next = { ...redetect(state, gone), pendingChange: null };
      // Move to the neighbour that took the removed Table's place, else the previous one.
      const was = state.selection?.documentId === doc.id && state.selection.tableId === table.id;
      if (!was) return { ...next, selection: sameTable(state, next.documents) };
      const tables = next.documents.find((d) => d.id === doc.id)!.tables;
      const neighbour = tables[Math.min(doc.tables.indexOf(table), tables.length - 1)];
      if (neighbour) return { ...next, selection: { documentId: doc.id, tableId: neighbour.id } };
      const other = next.documents.find((d) => d.tables.length);
      return {
        ...next,
        selection: other ? { documentId: other.id, tableId: other.tables[0]!.id } : null,
      };
    }
    case "tableRestored": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      if (!doc?.removed.some((r) => r.id === action.removedId)) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const removed = doc.removed.filter((r) => r.id !== action.removedId);
      const next = { ...redetect(state, { ...doc, removed }), pendingChange: null };
      const kept = sameTable(state, next.documents);
      if (kept) return { ...next, selection: kept };
      const first = next.documents.find((d) => d.id === doc.id)!.tables[0];
      return { ...next, selection: first ? { documentId: doc.id, tableId: first.id } : null };
    }
    case "splitByPage": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      const table = doc?.tables.find((t) => t.id === action.tableId);
      if (!doc || !table || table.parts.length < 2) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const noJoin = [...new Set([...doc.noJoin, ...table.parts.slice(1).map((p) => p.page)])];
      return changeJoins(state, { ...doc, noJoin });
    }
    case "joinAgain": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      const table = doc?.tables.find((t) => t.id === action.tableId);
      if (!doc || !table?.splitFrom) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const noJoin = doc.noJoin.filter((n) => n !== table.page);
      return changeJoins(state, { ...doc, noJoin });
    }
    case "regionCommitted": {
      const doc = state.documents.find((d) => d.id === state.region?.documentId);
      const region = state.region;
      if (!doc || !region?.bbox || !regionPreview(state)) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const id = `r${Math.max(0, ...doc.regions.map((r) => Number(r.id.slice(1)))) + 1}`;
      const { redraw } = region;
      // Redrawing a Hand-drawn Table moves its own Region; anything else adds one.
      const own = redraw?.regionId ?? null;
      const regions = own
        ? doc.regions.map((r) =>
            r.id === own ? { ...r, page: region.page, bbox: region.bbox! } : r,
          )
        : [
            ...doc.regions,
            {
              id,
              page: region.page,
              bbox: region.bbox,
              replaces: redraw?.replaces ?? null,
              apart: redraw?.apart ?? [],
            },
          ];
      const next = redetect({ ...state, region: null, pendingChange: null }, { ...doc, regions });
      const created = next.documents
        .find((d) => d.id === doc.id)!
        .tables.find((t) => t.manual === (own ?? id));
      return created ? { ...next, selection: { documentId: doc.id, tableId: created.id } } : next;
    }
    case "regionStarted": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      if (doc?.status !== "ready" || !pageOf(doc, action.page)) return state;
      if (action.tableId === undefined) {
        return {
          ...state,
          region: { documentId: doc.id, page: action.page, bbox: null, redraw: null },
        };
      }
      const table = doc.tables.find((t) => t.id === action.tableId);
      if (!table) return state;
      const part = table.parts.find((p) => p.page === action.page) ?? table.parts[0]!;
      const own = table.manual ? doc.regions.find((r) => r.id === table.manual) : undefined;
      const redraw: Redraw = own
        ? { regionId: own.id, replaces: own.replaces, apart: own.apart }
        : { regionId: null, replaces: part, apart: table.parts.filter((p) => p !== part) };
      const bbox = own?.bbox ?? part.bbox;
      return { ...state, region: { documentId: doc.id, page: part.page, bbox, redraw } };
    }
    case "regionChanged": {
      const doc = regionDocument(state);
      if (!state.region || !doc || !pageOf(doc, action.page)) return state;
      return { ...state, region: { ...state.region, page: action.page, bbox: action.bbox } };
    }
    case "wholePageSelected": {
      const doc = regionDocument(state);
      const p = doc && pageOf(doc, state.region!.page);
      if (!p) return state;
      const m = WHOLE_PAGE_MARGIN;
      return { ...state, region: { ...state.region!, bbox: [m, m, p.w - m, p.h - m] } };
    }
    case "regionCancelled":
      return state.region ? { ...state, region: null } : state;
    case "changeConfirmed": {
      if (!state.pendingChange) return state;
      return reduce(
        { ...state, pendingChange: null },
        { ...state.pendingChange, discardEdits: true },
      );
    }
    case "changeCancelled":
      return state.pendingChange ? { ...state, pendingChange: null } : state;
    case "cellEdited": {
      const value = action.value.replace(/\s+/g, " ").trim();
      return updateTable(state, action.documentId, action.tableId, (t) => {
        if (
          t.grid[action.row]?.[action.col] === undefined ||
          t.grid[action.row]![action.col] === value
        ) {
          return t;
        }
        const grid = t.grid.map((r, i) => (i === action.row ? r.with(action.col, value) : r));
        return { ...t, grid, edited: true };
      });
    }
    case "headerToggled":
      return updateTable(state, action.documentId, action.tableId, (t) =>
        t.header === action.header ? t : { ...t, header: action.header, edited: true },
      );
    case "sectionHeaderToggled":
      return updateTable(state, action.documentId, action.tableId, (t) =>
        toggleSectionHeader(t, action.row),
      );
    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}

/**
 * Marks a row as a Section Header (its text gathered into the first cell) or turns it back into a
 * data row. Counts as a correction. The Header Row and rows outside the grid are left alone.
 */
function toggleSectionHeader(t: Table, row: number): Table {
  if (!t.grid[row] || (t.header && row === 0)) return t;
  if (t.sections.includes(row)) {
    return { ...t, sections: t.sections.filter((r) => r !== row), edited: true };
  }
  const label = t.grid[row].filter(Boolean).join(" ");
  const grid = t.grid.map((cells, r) =>
    r === row ? cells.map((_, c) => (c ? "" : label)) : cells,
  );
  return { ...t, grid, sections: [...t.sections, row].sort((a, b) => a - b), edited: true };
}

/** Replaces a Document and re-detects its Tables (its Removed Tables already updated). */
function redetect(state: WorkspaceState, doc: Document): WorkspaceState {
  const tables = detectDocument(doc, doc.pages, state.settings);
  return {
    ...state,
    documents: state.documents.map((d) => (d.id === doc.id ? { ...doc, tables } : d)),
  };
}

/**
 * Re-detects a Document whose split pages changed. The selection stays on the Table that kept its
 * first Part: the first Part's Table after a split, the Joined Table after Join Again.
 */
function changeJoins(state: WorkspaceState, doc: Document): WorkspaceState {
  const next = { ...redetect(state, doc), pendingChange: null };
  return { ...next, selection: keepSelection(state, next.documents) };
}

/** The selection, re-pointed at the same Table (same page and box) after ids were renumbered. */
function sameTable(before: WorkspaceState, documents: Document[]): Selection | null {
  const sel = before.selection;
  const old = before.documents
    .find((d) => d.id === sel?.documentId)
    ?.tables.find((t) => t.id === sel?.tableId);
  const now = documents.find((d) => d.id === sel?.documentId);
  const table = old && now?.tables.find((t) => hasPart(t, old.parts[0]!));
  return table && now ? { documentId: now.id, tableId: table.id } : null;
}

/** Whether the Table has a Part on the same page and in the same box (Joined Tables included). */
const hasPart = (table: Table, part: Part) =>
  table.parts.some((p) => p.page === part.page && p.bbox.every((v, i) => v === part.bbox[i]));

/** True when `action` would discard corrections the user has not agreed to lose. */
function needsConfirmation(state: WorkspaceState, action: DiscardingAction): boolean {
  // Removing, restoring or saving a Region re-detects one Document only; Column Spacing re-detects them all.
  const scope =
    action.type === "regionCommitted"
      ? [state.region?.documentId]
      : "documentId" in action
        ? [action.documentId]
        : state.documents.map((d) => d.id);
  return (
    !action.discardEdits &&
    state.documents.some((d) => scope.includes(d.id) && d.tables.some((t) => t.edited))
  );
}

function updateTable(
  state: WorkspaceState,
  documentId: string,
  tableId: string,
  change: (table: Table) => Table,
): WorkspaceState {
  const doc = state.documents.find((d) => d.id === documentId);
  const table = doc?.tables.find((t) => t.id === tableId);
  if (!doc || !table) return state;
  const next = change(table);
  if (next === table) return state;
  const tables = doc.tables.map((t) => (t === table ? next : t));
  return {
    ...state,
    documents: state.documents.map((d) => (d === doc ? { ...doc, tables } : d)),
  };
}

/**
 * After re-detection, keeps the selection by page and position among that page's Tables; if
 * that Table is gone, falls back to the Document's first Table.
 */
function keepSelection(before: WorkspaceState, documents: Document[]): Selection | null {
  const sel = before.selection;
  if (!sel) return null;
  const old = before.documents.find((d) => d.id === sel.documentId);
  const now = documents.find((d) => d.id === sel.documentId);
  const oldTable = old?.tables.find((t) => t.id === sel.tableId);
  if (!old || !now || !oldTable) return null;
  if (oldTable.manual) {
    const same = now.tables.find((t) => t.manual === oldTable.manual);
    if (same) return { documentId: now.id, tableId: same.id };
  }
  // A Table that kept its first Part, which includes a Table joined to or split from its neighbour.
  const kept = now.tables.find((t) => hasPart(t, oldTable.parts[0]!));
  if (kept) return { documentId: now.id, tableId: kept.id };
  const position = old.tables.filter((t) => t.page === oldTable.page).indexOf(oldTable);
  const same = now.tables.filter((t) => t.page === oldTable.page)[position];
  const table =
    same ?? now.tables.find((t) => t.parts.some((p) => p.page === oldTable.page)) ?? now.tables[0];
  return table ? { documentId: now.id, tableId: table.id } : null;
}

/** Detects every Table in a Document (minus its Removed Tables), ordered by page and then top to bottom. */
function detectDocument(doc: Document, pages: PageText[], settings: Settings): Table[] {
  const documentId = doc.id;
  const detected: Table[] = [];
  const apart = new Set<string>();
  const handDrawn: Table[] = [];
  const table = (id: string, page: number, t: FoundTable, manual: string | null): Table => ({
    id,
    n: 0,
    page,
    parts: [{ page, bbox: t.bbox }],
    header: true,
    firstBold: t.firstBold,
    grid: t.grid,
    sections: t.sections,
    cols: t.cols,
    repeats: 0,
    splitFrom: false,
    edited: false,
    manual,
  });
  for (const p of pages) {
    const hidden = (bbox: Bbox) =>
      doc.removed.some((r) =>
        r.parts.some(
          (rp) => rp.page === p.num && overlapRatio(rp.bbox, bbox) > REMOVED_TABLE_OVERLAP,
        ),
      );
    // A Hand-drawn Table takes over the Detected Tables its Region covers.
    const covering = doc.regions.filter((r) => r.page === p.num);
    // A redrawn Region keeps hiding the Table it replaced, wherever it now lies.
    const replaced = (bbox: Bbox) =>
      doc.regions.some(
        (r) =>
          r.replaces?.page === p.num && overlapRatio(r.replaces.bbox, bbox) > REMOVED_TABLE_OVERLAP,
      );
    // The Parts left behind by a redraw are not joined to anything.
    const standalone = (bbox: Bbox) =>
      doc.regions.some((r) =>
        r.apart.some(
          (ap) => ap.page === p.num && overlapRatio(ap.bbox, bbox) > REMOVED_TABLE_OVERLAP,
        ),
      );
    detectTables(p.items, settings.columnSpacing).forEach((t, i) => {
      if (hidden(t.bbox) || replaced(t.bbox)) return;
      if (covering.some((r) => overlapRatio(r.bbox, t.bbox) > HAND_DRAWN_OVERLAP)) return;
      const id = `${documentId}:${p.num}:${i}`;
      if (standalone(t.bbox)) apart.add(id);
      detected.push(table(id, p.num, t, null));
    });
    for (const r of covering) {
      const t = regionTable(p.items, r.bbox, settings.columnSpacing);
      if (t) handDrawn.push(table(`${documentId}:region:${r.id}`, p.num, t, r.id));
    }
  }
  // Removed Tables and Hand-drawn Regions took their Tables out per page above, so a Joined Table
  // never spans them. A Hand-drawn Table is added after joining and is never joined.
  const joined = settings.join ? joinTables(pages, detected, apart, doc.noJoin) : detected;
  return [...joined, ...handDrawn]
    .sort((a, b) => a.page - b.page || b.parts[0]!.bbox[3] - a.parts[0]!.bbox[3])
    .map((t, i) => ({ ...t, n: i + 1 }));
}

/** The selected Table, or null. */
export function selectedTable(state: WorkspaceState): Table | null {
  const sel = state.selection;
  if (!sel) return null;
  const doc = state.documents.find((d) => d.id === sel.documentId);
  return doc?.tables.find((t) => t.id === sel.tableId) ?? null;
}

/** The Document holding the selected Table, or null. */
export function selectedDocument(state: WorkspaceState): Document | null {
  const sel = state.selection;
  return (sel && state.documents.find((d) => d.id === sel.documentId)) ?? null;
}

/** Data rows (excluding the Header Row and Section Headers) and columns, as the sidebar shows. */
export function tableSize(table: Table): { rows: number; cols: number } {
  const secs = table.sections.filter((r) => !(table.header && r === 0)).length;
  return {
    rows: table.grid.length - (table.header ? 1 : 0) - secs,
    cols: table.grid[0]?.length ?? 0,
  };
}

const pageOf = (doc: Document, num: number): PageText | undefined =>
  doc.pages.find((p) => p.num === num);

const regionDocument = (state: WorkspaceState): Document | undefined =>
  state.documents.find((d) => d.id === state.region?.documentId);

/**
 * The Table the Region in progress would make with the current Column Spacing, or null while
 * nothing is drawn or the Region holds no text (so it cannot be saved).
 */
export function regionPreview(state: WorkspaceState): FoundTable | null {
  const { region } = state;
  const doc = regionDocument(state);
  const page = doc && region && pageOf(doc, region.page);
  if (!region?.bbox || !page) return null;
  return regionTable(page.items, region.bbox, state.settings.columnSpacing);
}
