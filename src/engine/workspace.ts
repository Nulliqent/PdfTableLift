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

export type WorkspaceState = {
  documents: Document[];
  selection: Selection | null;
  settings: Settings;
};

export type WorkspaceAction =
  /** A Document was chosen; it shows as loading while the PDF Reader reads it. */
  | { type: "documentAdded"; id: string; name: string; size: number }
  /** The PDF Reader returned the Document's pages; its Tables are detected. */
  | { type: "documentRead"; id: string; pages: PageText[] }
  | { type: "tableSelected"; documentId: string; tableId: string }
  /** The Column Spacing slider moved; every Document is re-detected. */
  | { type: "columnSpacingChanged"; value: number }
  /** The user removed a Detected Table; it is hidden through re-detection until restored. */
  | { type: "tableRemoved"; documentId: string; tableId: string }
  /** The user restored a Removed Table from the sidebar. */
  | { type: "tableRestored"; documentId: string; removedId: string };

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
};

export function reduce(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "documentAdded": {
      const doc: Document = {
        id: action.id,
        name: action.name,
        size: action.size,
        status: "loading",
        pages: [],
        tables: [],
        removed: [],
      };
      return { ...state, documents: [...state.documents, doc] };
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
      const settings = { ...state.settings, columnSpacing };
      const documents = state.documents.map((d) =>
        d.status === "ready" ? { ...d, tables: detectDocument(d, d.pages, settings) } : d,
      );
      return { ...state, settings, documents, selection: keepSelection(state, documents) };
    }
    case "tableRemoved": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      const table = doc?.tables.find((t) => t.id === action.tableId);
      if (!doc || !table) return state;
      const n = Math.max(0, ...doc.removed.map((r) => r.seq)) + 1;
      const removed = [
        ...doc.removed,
        { id: `${doc.id}:removed:${n}`, seq: n, n: table.n, parts: table.parts },
      ];
      const next = redetect(state, { ...doc, removed });
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
      const removed = doc.removed.filter((r) => r.id !== action.removedId);
      const next = redetect(state, { ...doc, removed });
      const kept = sameTable(state, next.documents);
      if (kept) return { ...next, selection: kept };
      const first = next.documents.find((d) => d.id === doc.id)!.tables[0];
      return { ...next, selection: first ? { documentId: doc.id, tableId: first.id } : null };
    }
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
