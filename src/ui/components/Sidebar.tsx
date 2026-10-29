import type { Document, Selection } from "../../engine";
import { ColumnSpacingPanel } from "./ColumnSpacingPanel";
import { DocumentList } from "./DocumentList";
import { DropArea } from "./DropArea";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  documents: Document[];
  selection: Selection | null;
  onSelect: (documentId: string, tableId: string) => void;
};

/** Source-list sidebar: drop area, Documents and the Column Spacing panel. */
export function Sidebar({ documents, selection, onSelect }: SidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="Documents">
      <DropArea />
      <DocumentList documents={documents} selection={selection} onSelect={onSelect} />
      <ColumnSpacingPanel />
    </aside>
  );
}
