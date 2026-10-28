import { ColumnSpacingPanel } from "./ColumnSpacingPanel";
import { DocumentList } from "./DocumentList";
import { DropArea } from "./DropArea";
import styles from "./Sidebar.module.css";

/** Source-list sidebar: drop area, Documents and the Column Spacing panel. */
export function Sidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Documents">
      <DropArea />
      <DocumentList />
      <ColumnSpacingPanel />
    </aside>
  );
}
