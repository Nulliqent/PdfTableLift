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
  onRestore: (documentId: string, removedId: string) => void;
  onOpen: () => void;
  onRemove: (documentId: string) => void;
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
  onRestore,
  onOpen,
  onRemove,
  columnSpacing,
  onColumnSpacing,
}: SidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="Documents">
      <DropArea onOpen={onOpen} />
      <DocumentList
        documents={documents}
        selection={selection}
        onSelect={onSelect}
        regionDocumentId={regionDocumentId}
        onSelectRegion={onSelectRegion}
        onRestore={onRestore}
        onRemove={onRemove}
      />
      <ColumnSpacingPanel value={columnSpacing} onChange={onColumnSpacing} />
    </aside>
  );
}
