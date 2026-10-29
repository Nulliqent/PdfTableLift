/**
 * The workspace reducer: one pure `reduce(state, action)` holding the Documents, their Tables,
 * the selection and the settings. The UI drives it with a single useReducer.
 *
 * To add an action: add a member to WorkspaceAction and a case to `reduce`. TypeScript's
 * exhaustiveness check in the default branch flags any action left unhandled.
 */
import type { PageText } from "../shared/page-text";
import { detectTables, regionTable, type Band, type Bbox, type FoundTable } from "./detection";
import { overlapShare } from "./overlap";

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
  /** Set on a Hand-drawn Table: the id of the Region it is built from. */
  region?: string;
};

/** A Region the user drew on a page; it yields a Hand-drawn Table. */
export type Region = { id: string; page: number; bbox: Bbox };

/** The Region being selected: the page shown and the box dragged so far (null before any drag). */
export type RegionInProgress = { documentId: string; page: number; bbox: Bbox | null };

export type Document = {
  id: string;
  name: string;
  /** File size in bytes. */
  size: number;
  status: "loading" | "ready";
  pages: PageText[];
  tables: Table[];
  /** Regions drawn by hand; each stands as a Hand-drawn Table. */
  regions: Region[];
};

export type Settings = {
  /** 0.4–2.6, default 1.0. */
  columnSpacing: number;
};

export type Selection = { documentId: string; tableId: string };

export type WorkspaceState = {
  documents: Document[];
  selection: Selection | null;
  /** The Region in progress while the user is in Select Region, else null. */
  region: RegionInProgress | null;
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
  /** Select Region was entered for a Document, on the given page. */
  | { type: "regionStarted"; documentId: string; page: number }
  /** The page was stepped, or the Region dragged (bbox in PDF points; null clears it). */
  | { type: "regionChanged"; page: number; bbox: Bbox | null }
  /** Select Whole Page: the Region covers the current page. */
  | { type: "wholePageSelected" }
  /** Save: the Region becomes a Hand-drawn Table. Ignored while the Region holds no text. */
  | { type: "regionCommitted" }
  /** Escape or Cancel: leave Region selection with no changes. */
  | { type: "regionCancelled" };

/** Margin left around the page by Select Whole Page, in points. */
const WHOLE_PAGE_MARGIN = 18;
/** A Hand-drawn Table takes over a Detected Table overlapping it by more than this share. */
const HAND_DRAWN_OVERLAP = 0.3;

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
  region: null,
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
        regions: [],
      };
      return { ...state, documents: [...state.documents, doc] };
    }
    case "documentRead": {
      const doc = state.documents.find((d) => d.id === action.id);
      if (!doc) return state;
      const tables = detectDocument(doc.id, action.pages, state.settings, doc.regions);
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
      return {
        ...state,
        region: null,
        selection: { documentId: action.documentId, tableId: action.tableId },
      };
    }
    case "columnSpacingChanged": {
      const columnSpacing = parseColumnSpacing(action.value);
      if (columnSpacing === null || columnSpacing === state.settings.columnSpacing) return state;
      const settings = { ...state.settings, columnSpacing };
      const documents = state.documents.map((d) =>
        d.status === "ready"
          ? { ...d, tables: detectDocument(d.id, d.pages, settings, d.regions) }
          : d,
      );
      return { ...state, settings, documents, selection: keepSelection(state, documents) };
    }
    case "regionStarted": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      if (doc?.status !== "ready" || !pageOf(doc, action.page)) return state;
      return { ...state, region: { documentId: doc.id, page: action.page, bbox: null } };
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
    case "regionCommitted": {
      const doc = regionDocument(state);
      const { region } = state;
      if (!doc || !region?.bbox || !regionPreview(state)) return state;
      const id = `r${Math.max(0, ...doc.regions.map((r) => Number(r.id.slice(1)))) + 1}`;
      const regions = [...doc.regions, { id, page: region.page, bbox: region.bbox }];
      const tables = detectDocument(doc.id, doc.pages, state.settings, regions);
      const created = tables.find((t) => t.region === id);
      return {
        ...state,
        region: null,
        documents: state.documents.map((d) => (d === doc ? { ...d, regions, tables } : d)),
        selection: created ? { documentId: doc.id, tableId: created.id } : state.selection,
      };
    }
    case "regionCancelled":
      return state.region ? { ...state, region: null } : state;
    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
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
  if (oldTable.region) {
    const same = now.tables.find((t) => t.region === oldTable.region);
    if (same) return { documentId: now.id, tableId: same.id };
  }
  const position = old.tables.filter((t) => t.page === oldTable.page).indexOf(oldTable);
  const same = now.tables.filter((t) => t.page === oldTable.page)[position];
  const table = same ?? now.tables[0];
  return table ? { documentId: now.id, tableId: table.id } : null;
}

/**
 * Detects every Table in a Document, ordered by page and then top to bottom. A Region becomes a
 * Hand-drawn Table that replaces any Detected Table it overlaps by more than 30%.
 */
function detectDocument(
  documentId: string,
  pages: PageText[],
  settings: Settings,
  regions: Region[],
): Table[] {
  const found: Table[] = [];
  const table = (id: string, page: number, t: FoundTable, region?: string): Table => ({
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
    ...(region === undefined ? {} : { region }),
  });
  for (const p of pages) {
    const covering = regions.filter((r) => r.page === p.num);
    detectTables(p.items, settings.columnSpacing).forEach((t, i) => {
      if (covering.some((r) => overlapShare(r.bbox, t.bbox) > HAND_DRAWN_OVERLAP)) return;
      found.push(table(`${documentId}:${p.num}:${i}`, p.num, t));
    });
    for (const r of covering) {
      const t = regionTable(p.items, r.bbox, settings.columnSpacing);
      if (t) found.push(table(`${documentId}:region:${r.id}`, p.num, t, r.id));
    }
  }
  return found
    .sort((a, b) => a.page - b.page || b.parts[0]!.bbox[3] - a.parts[0]!.bbox[3])
    .map((t, i) => ({ ...t, n: i + 1 }));
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
