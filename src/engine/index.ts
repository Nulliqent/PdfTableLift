/**
 * Engine: pure TypeScript detection, joining, Region and export logic plus the workspace reducer.
 * It never imports pdf.js, React or the DOM (enforced by ESLint), so it runs unchanged in Node,
 * the browser or a Web Worker. Its input is the PDF Reader's PageText.
 */
export type { PageText, TextItem } from "../shared/page-text";
export {
  DEFAULT_SETTINGS,
  MAX_COLUMN_SPACING,
  MIN_COLUMN_SPACING,
  parseColumnSpacing,
  regionPreview,
  initialWorkspace,
  reduce,
  selectedDocument,
  selectedTable,
  tableSize,
} from "./workspace";
export type {
  Band,
  Bbox,
  DiscardingAction,
  Document,
  Part,
  Region,
  RegionInProgress,
  RemovedTable,
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
export type { FoundTable } from "./detection";
