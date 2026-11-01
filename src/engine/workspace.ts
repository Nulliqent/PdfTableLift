/**
 * The workspace reducer: one pure `reduce(state, action)` holding the Documents, their Tables,
 * the selection and the settings. The UI drives it with a single useReducer.
 *
 * To add an action: add a member to WorkspaceAction and a case to `reduce`. TypeScript's
 * exhaustiveness check in the default branch flags any action left unhandled.
 */
import { pageBox, type PageText } from "../shared/page-text";
import type { ReadError } from "../shared/read-error";
import {
  detectTables,
  regionsOutcome,
  type Band,
  type Bbox,
  type FoundTable,
  type RegionRole,
  type RegionsBlocked,
} from "./detection";
import { isSectionHeader, usesSectionColumn, type SectionMode } from "./export";
import { joinTables } from "./join";
import { HAND_DRAWN_OVERLAP, REMOVED_TABLE_OVERLAP, overlapRatio } from "./overlap";
import {
  buildStackedTable,
  coversPart,
  findMember,
  memberRef,
  tickMatch,
  tickedTables,
  withMembers,
  type BuiltStackedTable,
  type MemberRef,
  type StackedTable,
  type TablesInProgress,
} from "./stack";

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
  /**
   * The page of each grid row, for a Stacked Table's Source column: a Joined Table's Rows each
   * keep their own Part's page. A combined Row takes the upper Row's page.
   */
  rowPages: number[];
  /** Grid row indexes of Section Headers. */
  sections: number[];
  /** For each Section Header row, the cells it gets back when unmarked (FoundTable.sectionCells). */
  sectionCells: Record<number, string[]>;
  /** For each grid row made by Combine, the most recent Combine that made it (Split back undoes it). */
  combinedFrom: Record<number, Combine>;
  /** Column bands, one per grid column. */
  cols: Band[];
  /** Repeated Header Rows dropped by joining. */
  repeats: number;
  /** The user split it from the Table before it, which Join Again would rejoin. */
  splitFrom: boolean;
  /** The user corrected a cell or the Header Row; re-detection would discard it. */
  edited: boolean;
  /** The id of the Hand-drawn record a Table is built from ("Selected by hand"); null if Detected. */
  manual: string | null;
};

/** A grid row as it stood just before a Combine took it in. */
export type RowBeforeCombine = {
  cells: string[];
  /** Its page (`rowPages`). */
  page: number;
  /** It was in `sections` (a Section Header, or a marked row 0 under the Header Row switch). */
  section: boolean;
  /** Its `sectionCells` entry, or null. */
  sectionCells: string[] | null;
  /** The Combine that had made it, or null: earlier Combines nest here, one at a time. */
  combinedFrom: Combine | null;
};

/** Which neighbour a Combine takes in: the grid row above, or the one below. */
export type CombineDirection = "above" | "below";

/** One Combine: the two grid rows, upper first, that became one Row in the upper Row's place. */
export type Combine = { upper: RowBeforeCombine; lower: RowBeforeCombine };

export type { RegionRole };

/** A role as the user reads it: "Header" or "Body". */
export const roleLabel = (role: RegionRole) => (role === "header" ? "Header" : "Body");

/** "Region 2 · Header": the name of a Region in the list, on the page and in announcements. */
export const regionName = (index: number, role: RegionRole) =>
  `Region ${index + 1} · ${roleLabel(role)}`;

/** A Region the user drew on a page: its bounds, its role and its Single-Row setting. */
export type Region = {
  bbox: Bbox;
  role: RegionRole;
  /** A Single-Row Region (a Body Region only): everything inside it is one Row ("Treat Region as one row"). */
  singleRow: boolean;
  /** While the Region is a Header Region: the Single-Row setting it had as a Body Region, restored when it returns to Body. */
  keptSingleRow?: boolean;
};

/** A Hand-drawn Table as saved: one record on one page, holding its Regions and its redraw data. */
export type HandDrawn = {
  id: string;
  page: number;
  regions: Region[];
  /** The Part of the Detected Table this record was redrawn from; it stays hidden, wherever the Regions move. */
  replaces: Part | null;
  /** The other Parts of the Joined Table that Part belonged to; they stand on their own, never joined. */
  apart: Part[];
};

/** What a redraw carries over from the Table whose Regions are being redrawn. */
export type Redraw = {
  /** The record being redrawn if the Table was Hand-drawn, else null (a new record is made). */
  handDrawnId: string | null;
  replaces: Part | null;
  apart: Part[];
};

/** A Region in progress: as a Region, but its bounds are null until the user drags them. */
export type DraftRegion = Omit<Region, "bbox"> & { bbox: Bbox | null };

/**
 * The Regions being selected: the page shown, the list of Regions drawn so far and the index of the
 * one being edited. `redraw` is set when it was opened from a Table, else null. A new selection
 * starts with one Body Region whose Single-Row switch is off; a redrawn Hand-drawn Table opens on its
 * own Regions.
 */
export type RegionInProgress = {
  documentId: string;
  page: number;
  regions: DraftRegion[];
  /** Index into `regions` of the Region the drag, Select Whole Page and the Single-Row switch act on. */
  edited: number;
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
  /** Hand-drawn records; each stands as a Hand-drawn Table. */
  handDrawn: HandDrawn[];
  /** Pages whose first Part must not join the page before: the user split a Joined Table there. */
  noJoin: number[];
  /** Stacked Tables, in the order they were made; each is built from `tables` whenever shown. */
  stacked: StackedTable[];
};

export type Settings = {
  /** 0.4–2.6, default 1.0. */
  columnSpacing: number;
  /** Join Tables that continue onto the next page. On by default. */
  join: boolean;
};

/** What the content pane shows: a Table, or a Stacked Table. */
export type Selection =
  { documentId: string; tableId: string } | { documentId: string; stackedId: string };

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
  /** The Tables being ticked while the user is in Select Tables, else null. */
  stacking: TablesInProgress | null;
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
  /**
   * "Treat Region as one row" was switched for the Region in progress. Nothing is re-detected
   * until the Region is saved, so only `regionCommitted` goes through the edit warning.
   */
  | { type: "regionSingleRowChanged"; index: number; value: boolean }
  /** Add Region: a new Body Region starts, and becomes the one being edited. */
  | { type: "regionAdded" }
  /** The Region at `index` was removed. Removing the last one leaves a fresh Body Region. */
  | { type: "regionRemoved"; index: number }
  /** The Region at `index` became the one being edited. */
  | { type: "regionPicked"; index: number }
  /** The Region at `index` was made the Header Region or a Body Region. Only one is the Header Region. */
  | { type: "regionRoleChanged"; index: number; role: RegionRole }
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
  | { type: "sectionHeaderToggled"; documentId: string; tableId: string; row: number }
  /**
   * Combine with Row above / below: the grid row and its neighbour become one Row in the upper
   * Row's place, each column's text joined with a space. A correction; never re-detects.
   */
  | {
      type: "rowCombined";
      documentId: string;
      tableId: string;
      row: number;
      direction: CombineDirection;
    }
  /**
   * Split back: a combined Row becomes the two Rows of its most recent Combine again, as they stood
   * before it (edits made to the combined Row are lost). A correction; never re-detects.
   */
  | { type: "rowSplitBack"; documentId: string; tableId: string; row: number }
  /** Select Tables was entered for a Document, with nothing ticked. Leaves Select Region. */
  | { type: "stackingStarted"; documentId: string }
  /**
   * A Table was ticked or unticked in Select Tables. Ticking one that fails the matching rule
   * against the first ticked Table (`tickMatch`) is ignored.
   */
  | { type: "tableTicked"; tableId: string; ticked: boolean }
  /** Escape or Cancel: leave Select Tables with no changes. */
  | { type: "stackingCancelled" }
  /** Stack N Tables: the ticked Tables, in tick order, become a Stacked Table, which is selected. Needs two. */
  | { type: "tablesStacked" }
  | { type: "stackedTableSelected"; documentId: string; stackedId: string }
  /** The Source switch of a Stacked Table: a leading Source column with each Row's page. */
  | { type: "stackedSourceToggled"; documentId: string; stackedId: string; source: boolean }
  /** Edit Members: the checkboxes reopen with the Stacked Table's Members ticked, in order. Leaves Select Region. */
  | { type: "membersEditStarted"; documentId: string; stackedId: string }
  /** A ticked Table moves one place up or down in the tick order (the Member order). */
  | { type: "memberMoved"; tableId: string; direction: "up" | "down" }
  /** Save in Edit Members: the ticked Tables, in order, become the Stacked Table's Members. Needs one. */
  | { type: "membersSaved" }
  /** Remove Stacked Table: only the Stacked Table goes; its Members stay as they are. */
  | { type: "stackedTableRemoved"; documentId: string; stackedId: string };

/** The actions a row number's menu dispatches; each names its Table and grid row. */
export type RowAction = Extract<
  WorkspaceAction,
  { type: "sectionHeaderToggled" | "rowCombined" | "rowSplitBack" }
>;

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
  stacking: null,
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
        handDrawn: [],
        noJoin: [],
        stacked: [],
      };
      // The Example Document steps aside when the user's first own Document opens.
      const kept = action.example ? state.documents : state.documents.filter((d) => !d.example);
      const region = kept.some((d) => d.id === state.region?.documentId) ? state.region : null;
      const stacking = kept.some((d) => d.id === state.stacking?.documentId)
        ? state.stacking
        : null;
      const next = {
        ...state,
        documents: [...kept, doc],
        ...withoutRegion(state, region),
        stacking,
      };
      return selectedDocument(next) ? next : { ...next, selection: null };
    }
    case "documentRemoved": {
      if (!state.documents.some((d) => d.id === action.id)) return state;
      const region = state.region?.documentId === action.id ? null : state.region;
      const next = {
        ...state,
        documents: state.documents.filter((d) => d.id !== action.id),
        ...withoutRegion(state, region),
        stacking: state.stacking?.documentId === action.id ? null : state.stacking,
      };
      if (selectionStands(next)) return next;
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
      if (selectionStands(next)) return next;
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
      return withSettings(state, { ...state.settings, columnSpacing });
    }
    case "joinChanged": {
      if (typeof action.value !== "boolean" || action.value === state.settings.join) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      return withSettings(state, { ...state.settings, join: action.value });
    }
    case "tableRemoved": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      const table = doc?.tables.find((t) => t.id === action.tableId);
      if (!doc || !table) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const n = Math.max(0, ...doc.removed.map((r) => r.seq)) + 1;
      // A Hand-drawn Table is deleted with its record. A Detected Table is recorded as removed.
      const own = table.manual ? doc.handDrawn.find((r) => r.id === table.manual) : undefined;
      const record = (parts: Part[]) => ({
        id: `${doc.id}:removed:${n}`,
        seq: n,
        n: table.n,
        parts,
      });
      let gone: Document;
      if (!table.manual) gone = { ...doc, removed: [...doc.removed, record(table.parts)] };
      else if (own?.replaces) {
        // A redrawn record carried the suppression of the Detected Table it replaced. Deleting the
        // record must not undo the user's Remove, so the replaced Part becomes a Removed Table
        // (restorable), and the Parts the redraw left standing alone stay unjoined.
        const alone = [own.replaces, ...own.apart].map((p) => p.page);
        gone = {
          ...doc,
          handDrawn: doc.handDrawn.filter((r) => r.id !== own.id),
          removed: [...doc.removed, record([own.replaces])],
          noJoin: [...new Set([...doc.noJoin, ...alone])],
        };
      } else gone = { ...doc, handDrawn: doc.handDrawn.filter((r) => r.id !== table.manual) };
      gone = withoutMember(gone, table);
      const next = { ...redetect(state, gone), pendingChange: null };
      // A Stacked Table that lost its last Member is gone with it: show that Document's first Table.
      if (state.selection && "stackedId" in state.selection) {
        const kept = sameTable(state, next.documents);
        const first = next.documents.find((d) => d.id === doc.id)!.tables[0];
        const fallback = first ? { documentId: doc.id, tableId: first.id } : null;
        return { ...next, selection: kept ?? fallback };
      }
      // Move to the neighbour that took the removed Table's place, else the previous one.
      const was = isTableSelected(state.selection, doc.id, table.id);
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
      if (!doc || !region || regionBlocked(state)) return state;
      if (needsConfirmation(state, action)) return { ...state, pendingChange: action };
      const id = `r${Math.max(0, ...doc.handDrawn.map((r) => Number(r.id.slice(1)))) + 1}`;
      const { redraw } = region;
      // Only Regions with bounds are saved; the preview has already refused a list with none.
      const regions = withBounds(region.regions);
      // Redrawing a Hand-drawn Table changes its own record; anything else adds one.
      const own = redraw?.handDrawnId ?? null;
      const handDrawn = own
        ? doc.handDrawn.map((r) => (r.id === own ? { ...r, page: region.page, regions } : r))
        : [
            ...doc.handDrawn,
            {
              id,
              page: region.page,
              regions,
              replaces: redraw?.replaces ?? null,
              apart: redraw?.apart ?? [],
            },
          ];
      const next = redetect({ ...state, region: null, pendingChange: null }, { ...doc, handDrawn });
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
          stacking: null,
          region: {
            documentId: doc.id,
            page: action.page,
            regions: [draftRegion(null)],
            edited: 0,
            redraw: null,
          },
        };
      }
      const table = doc.tables.find((t) => t.id === action.tableId);
      if (!table) return state;
      const part = table.parts.find((p) => p.page === action.page) ?? table.parts[0]!;
      const own = table.manual ? doc.handDrawn.find((r) => r.id === table.manual) : undefined;
      const redraw: Redraw = own
        ? { handDrawnId: own.id, replaces: own.replaces, apart: own.apart }
        : { handDrawnId: null, replaces: part, apart: table.parts.filter((p) => p !== part) };
      const regions: DraftRegion[] = own ? own.regions : [draftRegion(part.bbox)];
      return {
        ...state,
        stacking: null,
        region: { documentId: doc.id, page: own?.page ?? part.page, regions, edited: 0, redraw },
      };
    }
    case "regionChanged": {
      const doc = regionDocument(state);
      if (!state.region || !doc || !pageOf(doc, action.page)) return state;
      const { region } = state;
      // Spec #39 decision: stepping to another page starts that page's Regions over, as one fresh
      // Body Region, and only the Single-Row switch carries on. Regions of a table do not follow
      // the user to another page.
      if (action.page !== region.page) {
        const carried = editedRegion(region).singleRow;
        const fresh = { ...draftRegion(action.bbox), singleRow: carried };
        return { ...state, region: { ...region, page: action.page, regions: [fresh], edited: 0 } };
      }
      return { ...state, region: withEdited(region, { bbox: action.bbox }) };
    }
    case "wholePageSelected": {
      const doc = regionDocument(state);
      const p = doc && pageOf(doc, state.region!.page);
      if (!p) return state;
      const m = WHOLE_PAGE_MARGIN;
      const [x0, y0, x1, y1] = pageBox(p);
      return {
        ...state,
        region: withEdited(state.region!, { bbox: [x0 + m, y0 + m, x1 - m, y1 - m] }),
      };
    }
    case "regionCancelled":
      return state.region ? { ...state, region: null } : state;
    case "regionSingleRowChanged": {
      const { region } = state;
      const target = region?.regions[action.index];
      if (!region || !target || target.role !== "body" || target.singleRow === action.value)
        return state;
      const regions = region.regions.map((r, i) =>
        i === action.index ? { ...r, singleRow: action.value } : r,
      );
      return { ...state, region: { ...region, regions } };
    }
    case "regionAdded": {
      const { region } = state;
      if (!region) return state;
      const regions = [...region.regions, draftRegion(null)];
      return { ...state, region: { ...region, regions, edited: regions.length - 1 } };
    }
    case "regionRemoved": {
      const { region } = state;
      if (!region || !region.regions[action.index]) return state;
      const left = region.regions.filter((_, i) => i !== action.index);
      const regions = left.length ? left : [draftRegion(null)];
      const edited = Math.min(
        action.index < region.edited ? region.edited - 1 : region.edited,
        regions.length - 1,
      );
      return { ...state, region: { ...region, regions, edited } };
    }
    case "regionPicked": {
      const { region } = state;
      if (!region || !region.regions[action.index] || region.edited === action.index) return state;
      return { ...state, region: { ...region, edited: action.index } };
    }
    case "regionRoleChanged": {
      const { region } = state;
      const target = region?.regions[action.index];
      if (!region || !target || target.role === action.role) return state;
      const regions = region.regions.map((r, i) =>
        i === action.index
          ? toRole(r, action.role)
          : action.role === "header" && r.role === "header"
            ? toRole(r, "body")
            : r,
      );
      return { ...state, region: { ...region, regions } };
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
    case "sectionHeaderToggled":
      return updateTable(state, action.documentId, action.tableId, (t) =>
        toggleSectionHeader(t, action.row),
      );
    case "rowCombined":
      return updateTable(state, action.documentId, action.tableId, (t) =>
        combineRows(t, action.direction === "above" ? action.row - 1 : action.row),
      );
    case "rowSplitBack":
      return updateTable(state, action.documentId, action.tableId, (t) => splitBack(t, action.row));
    case "stackingStarted": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      if (doc?.status !== "ready") return state;
      return {
        ...state,
        ...withoutRegion(state, null),
        stacking: { documentId: doc.id, ticked: [] },
      };
    }
    case "tableTicked": {
      const { stacking } = state;
      const doc = state.documents.find((d) => d.id === stacking?.documentId);
      const table = doc?.tables.find((t) => t.id === action.tableId);
      if (!stacking || !doc || !table) return state;
      const tables = tickedTables(doc, stacking.ticked);
      if (tables.some((t) => t.id === table.id) === action.ticked) return state;
      if (action.ticked && !tickMatch(doc, stacking.ticked, table).matches) return state;
      // Unticking keeps the order of the rest, re-read as they stand now.
      const ticked = action.ticked
        ? [...stacking.ticked, memberRef(table)]
        : tables.filter((t) => t.id !== table.id).map(memberRef);
      return { ...state, stacking: { ...stacking, ticked } };
    }
    case "stackingCancelled":
      return state.stacking ? { ...state, stacking: null } : state;
    case "tablesStacked": {
      const { stacking } = state;
      const doc = state.documents.find((d) => d.id === stacking?.documentId);
      // In Edit Members, Save (membersSaved) applies the ticks instead.
      if (!stacking || !doc || stacking.stackedId) return state;
      const tables = tickedTables(doc, stacking.ticked);
      if (tables.length < 2) return state;
      const n = Math.max(0, ...doc.stacked.map((s) => s.n)) + 1;
      const record = withMembers(
        doc,
        { id: `${doc.id}:stacked:${n}`, n, members: [], header: [], source: false },
        tables.map(memberRef),
      );
      const stacked = { ...doc, stacked: [...doc.stacked, record] };
      return {
        ...state,
        stacking: null,
        documents: state.documents.map((d) => (d === doc ? stacked : d)),
        selection: { documentId: doc.id, stackedId: record.id },
      };
    }
    case "stackedTableSelected": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      if (!doc?.stacked.some((s) => s.id === action.stackedId)) return state;
      return {
        ...state,
        ...withoutRegion(state, null),
        selection: { documentId: doc.id, stackedId: action.stackedId },
      };
    }
    case "stackedSourceToggled": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      const record = doc?.stacked.find((s) => s.id === action.stackedId);
      if (!doc || !record || record.source === action.source) return state;
      const changed = {
        ...doc,
        stacked: doc.stacked.map((s) => (s === record ? { ...s, source: action.source } : s)),
      };
      return { ...state, documents: state.documents.map((d) => (d === doc ? changed : d)) };
    }
    case "membersEditStarted": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      const record = doc?.stacked.find((s) => s.id === action.stackedId);
      if (doc?.status !== "ready" || !record) return state;
      return {
        ...state,
        ...withoutRegion(state, null),
        selection: { documentId: doc.id, stackedId: record.id },
        stacking: { documentId: doc.id, ticked: record.members, stackedId: record.id },
      };
    }
    case "memberMoved": {
      const { stacking } = state;
      const doc = state.documents.find((d) => d.id === stacking?.documentId);
      if (!stacking || !doc) return state;
      // A Member no current Table is has no checkbox, so a move steps over it.
      const found = stacking.ticked.map((r) => findMember(doc, r));
      const i = found.findIndex((t) => t?.id === action.tableId);
      if (i < 0) return state;
      const step = action.direction === "up" ? -1 : 1;
      let j = i + step;
      while (j >= 0 && j < found.length && !found[j]) j += step;
      if (j < 0 || j >= found.length) return state;
      const ticked = [...stacking.ticked];
      [ticked[i], ticked[j]] = [ticked[j]!, ticked[i]!];
      return { ...state, stacking: { ...stacking, ticked } };
    }
    case "membersSaved": {
      const { stacking } = state;
      const doc = state.documents.find((d) => d.id === stacking?.documentId);
      const record = doc?.stacked.find((s) => s.id === stacking?.stackedId);
      if (!stacking || !doc || !record) return state;
      if (tickedTables(doc, stacking.ticked).length < 1) return state;
      // Saving renews the saved Header Row from the new first Member.
      const saved = withMembers(doc, record, stacking.ticked);
      const edited = { ...doc, stacked: doc.stacked.map((s) => (s === record ? saved : s)) };
      return {
        ...state,
        stacking: null,
        documents: state.documents.map((d) => (d === doc ? edited : d)),
        selection: { documentId: doc.id, stackedId: record.id },
      };
    }
    case "stackedTableRemoved": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      const record = doc?.stacked.find((s) => s.id === action.stackedId);
      if (!doc || !record) return state;
      const kept = { ...doc, stacked: doc.stacked.filter((s) => s !== record) };
      const stacking = state.stacking?.stackedId === record.id ? null : state.stacking;
      // Removing the selected Stacked Table opens its first Member, else the Document's first Table.
      const next =
        tickedTables(doc, record.members)[0] ?? (doc.tables[0] as Table | undefined) ?? null;
      const selection = isStackedSelected(state.selection, doc.id, record.id)
        ? next && { documentId: doc.id, tableId: next.id }
        : state.selection;
      return {
        ...state,
        stacking,
        selection,
        documents: state.documents.map((d) => (d === doc ? kept : d)),
      };
    }
    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}

/**
 * Marks a row as a Section Header (its text gathered into the first cell) or turns it back into a
 * data row with the cells it had before (for a detected one, its text in its own column). Counts
 * as a correction. The Header Row and rows outside the grid are left alone.
 */
function toggleSectionHeader(t: Table, row: number): Table {
  if (!t.grid[row] || (t.header && row === 0)) return t;
  if (t.sections.includes(row)) {
    const { [row]: cells = t.grid[row], ...sectionCells } = t.sectionCells;
    return {
      ...t,
      grid: t.grid.with(row, cells),
      sections: t.sections.filter((r) => r !== row),
      sectionCells,
      edited: true,
    };
  }
  const label = t.grid[row].filter(Boolean).join(" ");
  return {
    ...t,
    grid: t.grid.with(
      row,
      t.grid[row].map((_, c) => (c ? "" : label)),
    ),
    sections: [...t.sections, row].sort((a, b) => a - b),
    sectionCells: { ...t.sectionCells, [row]: t.grid[row] },
    edited: true,
  };
}

/**
 * Combines grid row `upper` with the row below it into one Row in `upper`'s place: each column's
 * text joined with a single space, upper first. A Section Header taken in is unmarked first, so its
 * text comes from its own column (as on Unmark). Into the Header Row is allowed. Later rows'
 * Section Header marks, `sectionCells` and `combinedFrom` move up by one; the new Row remembers both
 * rows as they stood. Counts as a correction. Without a row below, the Table is left alone.
 */
function combineRows(t: Table, upper: number): Table {
  const lower = upper + 1;
  if (upper < 0 || !t.grid[lower]) return t;
  const cellsOf = (r: number) =>
    isSectionHeader(t, r) ? (t.sectionCells[r] ?? t.grid[r]!) : t.grid[r]!;
  const before = (r: number): RowBeforeCombine => ({
    cells: t.grid[r]!,
    page: t.rowPages[r]!,
    section: t.sections.includes(r),
    sectionCells: t.sectionCells[r] ?? null,
    combinedFrom: t.combinedFrom[r] ?? null,
  });
  const below = cellsOf(lower);
  const cells = cellsOf(upper).map((v, c) => [v, below[c]].filter(Boolean).join(" "));
  /** The row's index once the two rows are one; null for the two rows themselves. */
  const moved = (r: number) => (r < upper ? r : r > lower ? r - 1 : null);
  return {
    ...t,
    grid: t.grid.toSpliced(upper, 2, cells),
    rowPages: t.rowPages.toSpliced(upper, 2, t.rowPages[upper]!),
    sections: t.sections.flatMap((r) => moved(r) ?? []),
    sectionCells: reindexRows(t.sectionCells, moved),
    combinedFrom: {
      ...reindexRows(t.combinedFrom, moved),
      [upper]: { upper: before(upper), lower: before(lower) },
    },
    edited: true,
  };
}

/**
 * Undoes the most recent Combine that made grid row `r`: the row becomes the two rows it came
 * from, each as it stood (its Section Header mark, `sectionCells` and any earlier Combine), so
 * Split back steps back one Combine at a time. Edits made to the combined row are lost. Later rows'
 * Section Header marks, `sectionCells` and `combinedFrom` move down by one. Counts as a correction. A
 * row that was not combined is left alone.
 */
function splitBack(t: Table, r: number): Table {
  const combine = t.combinedFrom[r];
  if (!combine || !t.grid[r]) return t;
  const { upper, lower } = combine;
  /** The row's index once the row is two again; null for the combined row itself. */
  const moved = (i: number) => (i < r ? i : i > r ? i + 1 : null);
  const restore = <V>(byRow: Record<number, V>, value: (b: RowBeforeCombine) => V | null) => {
    const back = [upper, lower].flatMap((b, k) => {
      const v = value(b);
      return v === null ? [] : [[r + k, v] as const];
    });
    return { ...reindexRows(byRow, moved), ...Object.fromEntries(back) } as Record<number, V>;
  };
  return {
    ...t,
    grid: t.grid.toSpliced(r, 1, upper.cells, lower.cells),
    rowPages: t.rowPages.toSpliced(r, 1, upper.page, lower.page),
    sections: [
      ...t.sections.flatMap((i) => moved(i) ?? []),
      ...[upper, lower].flatMap((b, k) => (b.section ? [r + k] : [])),
    ].sort((a, b) => a - b),
    sectionCells: restore(t.sectionCells, (b) => b.sectionCells),
    combinedFrom: restore(t.combinedFrom, (b) => b.combinedFrom),
    edited: true,
  };
}

/** The grid row a Combine would take in, and how the user sees it. */
export type CombineTarget = {
  row: number;
  /** Its text when it is a Section Header this Section Mode does not draw as a row, else null. */
  hiddenSectionHeader: string | null;
};

/**
 * The grid row that Combine with Row above / below on grid row `row` would take in, or null when
 * there is none. In As Column mode Section Headers are not drawn as rows, so the neighbour may be
 * one the user cannot see; `hiddenSectionHeader` names it so the menu can say so.
 */
export function combineTarget(
  table: Table,
  row: number,
  direction: CombineDirection,
  mode: SectionMode,
): CombineTarget | null {
  const target = direction === "above" ? row - 1 : row + 1;
  if (!table.grid[row] || !table.grid[target]) return null;
  const hidden = usesSectionColumn(table, mode) && isSectionHeader(table, target);
  return { row: target, hiddenSectionHeader: hidden ? (table.grid[target]![0] ?? "") : null };
}

/**
 * A by-row record with its rows renumbered after rows were added or taken out of the grid: `moved`
 * gives each row's new index, or null to drop its entry.
 */
function reindexRows<V>(
  byRow: Record<number, V>,
  moved: (row: number) => number | null,
): Record<number, V> {
  return Object.fromEntries(
    Object.entries(byRow).flatMap(([r, v]) => {
      const to = moved(Number(r));
      return to === null ? [] : [[to, v] as const];
    }),
  );
}

/** The region field to keep, and no pending Region save once its Region is gone. */
function withoutRegion(state: WorkspaceState, region: RegionInProgress | null) {
  const orphaned = !region && state.pendingChange?.type === "regionCommitted";
  return { region, pendingChange: orphaned ? null : state.pendingChange };
}

/** Applies new Settings: every read Document is re-detected, and the selection kept. */
function withSettings(state: WorkspaceState, settings: Settings): WorkspaceState {
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

/**
 * Drops a Table the user removed from every Stacked Table it is a Member of, for good: restoring
 * it does not bring it back. That includes a Member that had become a later Part of it. A Stacked
 * Table left with one Member still stands; one left with none is gone.
 */
function withoutMember(doc: Document, table: Table): Document {
  const isTable = (ref: MemberRef) =>
    findMember(doc, ref) === table ||
    (ref.manual === null && table.manual === null && coversPart(table, ref));
  if (!doc.stacked.some((s) => s.members.some(isTable))) return doc;
  const stacked = doc.stacked
    .map((s) => ({ ...s, members: s.members.filter((ref) => !isTable(ref)) }))
    .filter((s) => s.members.length > 0);
  return { ...doc, stacked };
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
  if (sel && "stackedId" in sel) return stackedStands(sel, documents);
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
 * that Table is gone, falls back to the Document's first Table. With nothing selected before, the
 * first Table re-detection found is selected, so Tables that just appeared are shown.
 */
function keepSelection(before: WorkspaceState, documents: Document[]): Selection | null {
  const sel = before.selection;
  if (!sel) {
    const first = documents.find((d) => d.tables.length);
    return first ? { documentId: first.id, tableId: first.tables[0]!.id } : null;
  }
  // A Stacked Table outlives re-detection: its Members are found again by page and box.
  if ("stackedId" in sel) return stackedStands(sel, documents);
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
  const table = (
    id: string,
    page: number,
    t: FoundTable,
    manual: string | null,
    header = true,
  ): Table => ({
    id,
    n: 0,
    page,
    parts: [{ page, bbox: t.bbox }],
    header,
    firstBold: t.firstBold,
    grid: t.grid,
    rowPages: t.grid.map(() => page),
    sections: t.sections,
    sectionCells: t.sectionCells,
    combinedFrom: {},
    cols: t.cols,
    repeats: 0,
    splitFrom: false,
    edited: false,
    manual,
  });
  for (const p of pages) {
    /** Whether one of the Parts lies on this page over the box: the same Table, re-detected. */
    const overlaps = (parts: Part[], bbox: Bbox) =>
      parts.some((q) => q.page === p.num && overlapRatio(q.bbox, bbox) > REMOVED_TABLE_OVERLAP);
    const hidden = (bbox: Bbox) => doc.removed.some((r) => overlaps(r.parts, bbox));
    // A Hand-drawn Table takes over the Detected Tables its Region covers.
    const covering = doc.handDrawn.filter((r) => r.page === p.num);
    // A redrawn Region keeps hiding the Table it replaced, wherever it now lies.
    const replaced = (bbox: Bbox) =>
      doc.handDrawn.some((r) => r.replaces !== null && overlaps([r.replaces], bbox));
    // The Parts left behind by a redraw are not joined to anything.
    const standalone = (bbox: Bbox) => doc.handDrawn.some((r) => overlaps(r.apart, bbox));
    detectTables(p.items, settings.columnSpacing).forEach((t, i) => {
      if (hidden(t.bbox) || replaced(t.bbox)) return;
      if (
        covering.some((r) =>
          r.regions.some((g) => overlapRatio(g.bbox, t.bbox) > HAND_DRAWN_OVERLAP),
        )
      )
        return;
      const id = `${documentId}:${p.num}:${i}`;
      if (standalone(t.bbox)) apart.add(id);
      detected.push(table(id, p.num, t, null));
    });
    for (const r of covering) {
      const t = handDrawnTable(p, r.regions, settings);
      if (t) handDrawn.push(table(`${documentId}:region:${r.id}`, p.num, t, r.id, t.header));
    }
  }
  // Removed Tables and Hand-drawn Regions took their Tables out per page above, so a Joined Table
  // never spans them. A Hand-drawn Table is added after joining and is never joined.
  const joined = settings.join ? joinTables(pages, detected, apart, doc.noJoin) : detected;
  return [...joined, ...handDrawn]
    .sort((a, b) => a.page - b.page || b.parts[0]!.bbox[3] - a.parts[0]!.bbox[3])
    .map((t, i) => ({ ...t, n: i + 1 }));
}

/** The Stacked Table selection, if its Document still holds that Stacked Table, else null. */
function stackedStands(
  sel: Extract<Selection, { stackedId: string }>,
  documents: Document[],
): Selection | null {
  const doc = documents.find((d) => d.id === sel.documentId);
  return doc?.stacked.some((s) => s.id === sel.stackedId) ? sel : null;
}

/** Whether the selection is that Table of that Document. */
export const isTableSelected = (sel: Selection | null, documentId: string, tableId: string) =>
  sel !== null && "tableId" in sel && sel.documentId === documentId && sel.tableId === tableId;

/** Whether the selection is that Stacked Table of that Document. */
export const isStackedSelected = (sel: Selection | null, documentId: string, stackedId: string) =>
  sel !== null &&
  "stackedId" in sel &&
  sel.documentId === documentId &&
  sel.stackedId === stackedId;

/** Whether what is selected still exists. */
const selectionStands = (state: WorkspaceState) =>
  selectedTable(state) !== null || selectedStackedTable(state) !== null;

/** The selected Stacked Table, built from its Members as they stand, or null. */
export function selectedStackedTable(state: WorkspaceState): BuiltStackedTable | null {
  const sel = state.selection;
  if (!sel || !("stackedId" in sel)) return null;
  const doc = state.documents.find((d) => d.id === sel.documentId);
  const record = doc?.stacked.find((s) => s.id === sel.stackedId);
  return doc && record ? buildStackedTable(doc, record) : null;
}

/** The selected Table, or null (also while a Stacked Table is selected). */
export function selectedTable(state: WorkspaceState): Table | null {
  const sel = state.selection;
  if (!sel || !("tableId" in sel)) return null;
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

/** Why Regions in progress cannot be saved: the engine's reasons, or a Region not yet drawn. */
export type RegionBlocked = RegionsBlocked | "undrawn";

/** What a Region yields: the Table found inside it, and whether it starts with a Header Row. */
export type RegionTable = FoundTable & { header: boolean };

/**
 * The Table a Region makes. A Table that comes out as one Row, a Single-Row Region's or any other,
 * starts with "First row is header" off: its only Row is data, not a header over nothing. So does a
 * Region drawn from a Section Header downward: its label heads the Rows below it (spec #30). The rule
 * is applied whenever the Table is found, so a redraw to a single Row turns it off and a redraw to
 * several Rows turns it back on.
 */
function handDrawnTable(page: PageText, regions: Region[], settings: Settings): RegionTable | null {
  const out = regionsOutcome(page.items, regions, settings.columnSpacing);
  if (!("table" in out)) return null;
  const t = out.table;
  // With a Header Region the Header Row is always its text; without one, today's rule applies.
  const header = regions.some((r) => r.role === "header")
    ? true
    : t.grid.length > 1 && !t.sections.includes(0);
  return { ...t, header };
}

/** The Regions a Hand-drawn Table was built from, or null for a Detected Table. */
export function tableRegions(doc: Document, table: Table): Region[] | null {
  return (table.manual && doc.handDrawn.find((r) => r.id === table.manual)?.regions) || null;
}

/** Whether a Table was built with a Header Region ("First row is header" is then not offered). */
export const hasHeaderRegion = (doc: Document, table: Table): boolean =>
  tableRegions(doc, table)?.some((r) => r.role === "header") ?? false;

/**
 * Why the Regions in progress cannot be saved, or null when they can. "nothing" is nothing drawn
 * yet, "undrawn" is a Region added but not yet dragged, "no-body" is no Body Region with text,
 * "no-header" is a Header Region without text.
 */
export function regionBlocked(state: WorkspaceState): RegionBlocked | null {
  const { region } = state;
  const doc = regionDocument(state);
  const page = doc && region && pageOf(doc, region.page);
  if (!region || !page) return "nothing";
  // A Region added but never dragged would be dropped silently on Save, so Save waits for it.
  if (region.regions.some((r) => !r.bbox) && region.regions.some((r) => r.bbox)) return "undrawn";
  const out = regionsOutcome(page.items, withBounds(region.regions), state.settings.columnSpacing);
  return "blocked" in out ? out.blocked : null;
}

/** A Region in another role. A Header Region has no Single-Row setting; it is kept for the way back to Body. */
const toRole = (r: DraftRegion, role: RegionRole): DraftRegion => {
  if (role === "header") return { ...r, role, singleRow: false, keptSingleRow: r.singleRow };
  const { keptSingleRow, ...rest } = r;
  return { ...rest, role, singleRow: keptSingleRow ?? r.singleRow };
};

/** A new Body Region, with the given bounds (null until dragged). */
const draftRegion = (bbox: Bbox | null): DraftRegion => ({ bbox, role: "body", singleRow: false });

const editedRegion = (region: RegionInProgress): DraftRegion => region.regions[region.edited]!;

/** The Regions that have bounds. */
const withBounds = (regions: DraftRegion[]): Region[] =>
  regions.flatMap((r) => (r.bbox ? [{ ...r, bbox: r.bbox }] : []));

/** The Region in progress with the edited Region changed. */
const withEdited = (region: RegionInProgress, change: Partial<DraftRegion>): RegionInProgress => ({
  ...region,
  regions: region.regions.map((r, i) => (i === region.edited ? { ...r, ...change } : r)),
});

/**
 * The Table the Regions in progress would make with the current Column Spacing, or null while
 * nothing is drawn or the Regions hold no text (so they cannot be saved).
 */
export function regionPreview(state: WorkspaceState): RegionTable | null {
  const { region } = state;
  const doc = regionDocument(state);
  const page = doc && region && pageOf(doc, region.page);
  if (!region || !page) return null;
  return handDrawnTable(page, withBounds(region.regions), state.settings);
}
