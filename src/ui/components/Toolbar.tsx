import type { Document } from "../../engine";
import { plural } from "../format";
import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./Toolbar.module.css";

type ToolbarProps = { documents: Document[]; onOpen: () => void };

/** Translucent window toolbar: app icon, title, a summary of the workspace and Open PDF. */
export function Toolbar({ documents, onOpen }: ToolbarProps) {
  const tables = documents
    .filter((d) => d.status === "ready")
    .reduce((n, d) => n + d.tables.length, 0);
  return (
    <header className={styles.toolbar}>
      <div className={styles.appicon} aria-hidden="true">
        <Icon name="table" style={{ strokeWidth: 2 }} />
      </div>
      <div className={styles.titles}>
        <h1>Table Lift</h1>
        <p>
          {documents.length
            ? `${plural(documents.length, "document")} · ${plural(tables, "table")} found`
            : "Extract tables from PDFs on this device"}
        </p>
      </div>
      <Button variant="primary" aria-label="Open PDF" title="Open PDF (⌘O)" onClick={onOpen}>
        <Icon name="plus" />
        <span className={styles.lbl}>Open PDF</span>
      </Button>
    </header>
  );
}
