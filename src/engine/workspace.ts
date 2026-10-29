/**
 * The workspace reducer: one pure `reduce(state, action)` holding the Documents, their Tables,
 * the selection and the settings. The UI drives it with a single useReducer.
 *
 * To add an action: add a member to WorkspaceAction and a case to `reduce`. TypeScript's
 * exhaustiveness check in the default branch flags any action left unhandled.
 */
import type { PageText } from "../shared/page-text";
import { detectTables, type Band, type Bbox } from "./detection";
import { REMOVED_TABLE_OVERLAP, overlapRatio } from "./overlap";

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
  /** The user corrected a cell or the Header Row; re-detection would discard it. */
  edited: boolean;
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
  status: "loading" | "ready";
  /** The Example Document that greets first-time visitors. */
  example: boolean;
  pages: PageText[];
  tables: Table[];
  /** Removed Tables, hidden from `tables` until restored. */
  removed: RemovedTable[];
};

export type Settings = {
  /** 0.4–2.6, default 1.0. */
  columnSpacing: number;
};

export type Selection = { documentId: string; tableId: string };

/**
 * An action that re-detects Tables and so would discard corrections. Without `discardEdits`, the
 * reducer refuses to run it while any Table is edited and parks it in `pendingChange` instead.
 */
export type DiscardingAction = { discardEdits?: boolean } & (
  | { type: "columnSpacingChanged"; value: number }
  /** The user removed a Detected Table; it is hidden through re-detection until restored. */
  | { type: "tableRemoved"; documentId: string; tableId: string }
  /** The user restored a Removed Table from the sidebar. */
  | { type: "tableRestored"; documentId: string; removedId: string }
);

export type WorkspaceState = {
  documents: Document[];
  selection: Selection | null;
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
  | { type: "tableSelected"; documentId: string; tableId: string }
  /** The user removed a Document. Selection moves to the next Document with Tables. */
  | { type: "documentRemoved"; id: string }
  /** The Column Spacing slider moved; every Document is re-detected. */
  | DiscardingAction
  /** The user confirmed the pending change: it runs with the edits discarded. */
  | { type: "changeConfirmed" }
  /** The user cancelled the pending change: nothing changes. */
  | { type: "changeCancelled" }
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
  | { type: "headerToggled"; documentId: string; tableId: string; header: boolean };

export const MIN_COLUMN_SPACING = 0.4;
export const MAX_COLUMN_SPACING = 2.6;

/** A stored or typed value as a valid Column Spacing (one decimal in range), else null. */
export function parseColumnSpacing(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < MIN_COLUMN_SPACING || value > MAX_COLUMN_SPACING) return null;
  return Math.round(value * 10) / 10;
}

export const DEFAULT_SETTINGS: Settings = { columnSpacing: 1 };

export const initialWorkspace: WorkspaceState = {
  documents: [],
  selection: null,
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
        example: action.example === true,
        pages: [],
        tables: [],
        removed: [],
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
      if (!doc) return state;
      const tables = detectDocument(doc, action.pages, state.settings);
      const read: Document = { ...doc, status: "ready", pages: action.pages, tables };
      const next = { ...state, documents: state.documents.map((d) => (d === doc ? read : d)) };
      // Keep what the user is looking at; otherwise show this Document's first Table.
      if (selectedTable(next)) return next;
      return {
        ...next,
        selection: tables[0] ? { documentId: doc.id, tableId: tables[0].id } : null,
      };
    }
    case "tableSelected": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      if (!doc?.tables.some((t) => t.id === action.tableId)) return state;
      return { ...state, selection: { documentId: action.documentId, tableId: action.tableId } };
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
    case "tableRemoved": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      const table = doc?.tables.find((t) => t.id === action.tableId);
      if (!doc || !table) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const n = Math.max(0, ...doc.removed.map((r) => r.seq)) + 1;
      const removed = [
        ...doc.removed,
        { id: `${doc.id}:removed:${n}`, seq: n, n: table.n, parts: table.parts },
      ];
      const next = { ...redetect(state, { ...doc, removed }), pendingChange: null };
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
    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}

/** Replaces a Document and re-detects its Tables (its Removed Tables already updated). */
function redetect(state: WorkspaceState, doc: Document): WorkspaceState {
  const tables = detectDocument(doc, doc.pages, state.settings);
  return {
    ...state,
    documents: state.documents.map((d) => (d.id === doc.id ? { ...doc, tables } : d)),
  };
}

/** The selection, re-pointed at the same Table (same page and box) after ids were renumbered. */
function sameTable(before: WorkspaceState, documents: Document[]): Selection | null {
  const sel = before.selection;
  const old = before.documents
    .find((d) => d.id === sel?.documentId)
    ?.tables.find((t) => t.id === sel?.tableId);
  const now = documents.find((d) => d.id === sel?.documentId);
  const table =
    old &&
    now?.tables.find(
      (t) => t.page === old.page && t.parts[0]!.bbox.every((v, i) => v === old.parts[0]!.bbox[i]),
    );
  return table && now ? { documentId: now.id, tableId: table.id } : null;
}

/** True when `action` would discard corrections the user has not agreed to lose. */
function needsConfirmation(state: WorkspaceState, action: DiscardingAction): boolean {
  // Removing or restoring re-detects one Document only; Column Spacing re-detects them all.
  const scope = "documentId" in action ? [action.documentId] : state.documents.map((d) => d.id);
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
  const position = old.tables.filter((t) => t.page === oldTable.page).indexOf(oldTable);
  const same = now.tables.filter((t) => t.page === oldTable.page)[position];
  const table = same ?? now.tables[0];
  return table ? { documentId: now.id, tableId: table.id } : null;
}

/** Detects every Table in a Document (minus its Removed Tables), ordered by page and then top to bottom. */
function detectDocument(doc: Document, pages: PageText[], settings: Settings): Table[] {
  const documentId = doc.id;
  const found: Table[] = [];
  for (const p of pages) {
    const hidden = (bbox: Bbox) =>
      doc.removed.some((r) =>
        r.parts.some(
          (rp) => rp.page === p.num && overlapRatio(rp.bbox, bbox) > REMOVED_TABLE_OVERLAP,
        ),
      );
    detectTables(p.items, settings.columnSpacing).forEach((t, i) => {
      if (hidden(t.bbox)) return;
      found.push({
        id: `${documentId}:${p.num}:${i}`,
        n: 0,
        page: p.num,
        parts: [{ page: p.num, bbox: t.bbox }],
        header: true,
        firstBold: t.firstBold,
        grid: t.grid,
        sections: t.sections,
        cols: t.cols,
        repeats: 0,
        edited: false,
      });
    });
  }
  return found
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
