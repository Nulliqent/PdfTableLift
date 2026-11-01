/**
 * Engine: pure TypeScript detection, joining, Region and export logic plus the workspace reducer.
 * It never imports pdf.js, React or the DOM (enforced by ESLint), so it runs unchanged in Node,
 * the browser or a Web Worker. Its input is the PDF Reader's PageText.
 */
export type { PageText, TextItem } from "../shared/page-text";
export { READ_ERROR_MESSAGES } from "../shared/read-error";
export type { ReadError } from "../shared/read-error";
export {
  DEFAULT_SETTINGS,
  combineTarget,
  MAX_COLUMN_SPACING,
  MIN_COLUMN_SPACING,
  parseColumnSpacing,
  hasHeaderRegion,
  regionBlocked,
  regionName,
  regionPreview,
  roleLabel,
  tableRegions,
  initialWorkspace,
  isStackedSelected,
  isTableSelected,
  reduce,
  selectedDocument,
  selectedStackedTable,
  selectedTable,
  tableSize,
} from "./workspace";
export {
  buildStackedTable,
  findMember,
  headerMatch,
  memberRef,
  tickMatch,
  tickedTables,
} from "./stack";
export type {
  BuiltStackedTable,
  HeaderMatch,
  LeftOut,
  MemberRef,
  StackedMember,
  StackedTable,
  TablesInProgress,
} from "./stack";
export type {
  Band,
  Bbox,
  Combine,
  CombineDirection,
  CombineTarget,
  DiscardingAction,
  Document,
  DraftRegion,
  HandDrawn,
  Part,
  Redraw,
  Region,
  RegionInProgress,
  RegionRole,
  RegionBlocked,
  RegionTable,
  RemovedTable,
  RowAction,
  RowBeforeCombine,
  Selection,
  Settings,
  Table,
  WorkspaceAction,
  WorkspaceState,
} from "./workspace";
export { HAND_DRAWN_OVERLAP, REMOVED_TABLE_OVERLAP, overlapRatio } from "./overlap";
export {
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_SECTION_MODE,
  EXPORT_FORMATS,
  hasSectionHeaders,
  isSectionHeader,
  isSectionMode,
  usesSectionColumn,
  exportTable,
  isExportFormat,
  numericColumns,
} from "./export";
export type { ExportFormat, SectionMode } from "./export";
export type { FoundTable, RegionsBlocked } from "./detection";
