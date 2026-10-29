import type { Document, Selection } from "../../engine";
import { ColumnSpacingPanel } from "./ColumnSpacingPanel";
import { DocumentList } from "./DocumentList";
import { DropArea } from "./DropArea";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  documents: Document[];
  selection: Selection | null;
  onSelect: (documentId: string, tableId: string) => void;
  regionDocumentId: string | null;
  onSelectRegion: (documentId: string) => void;
  columnSpacing: number;
  onColumnSpacing: (value: number) => void;
};

/** Source-list sidebar: drop area, Documents and the Column Spacing panel. */
export function Sidebar({
  documents,
  selection,
  onSelect,
  regionDocumentId,
  onSelectRegion,
  columnSpacing,
  onColumnSpacing,
}: SidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="Documents">
      <DropArea />
      <DocumentList
        documents={documents}
        selection={selection}
        onSelect={onSelect}
        regionDocumentId={regionDocumentId}
        onSelectRegion={onSelectRegion}
      />
      <ColumnSpacingPanel value={columnSpacing} onChange={onColumnSpacing} />
    </aside>
  );
}
