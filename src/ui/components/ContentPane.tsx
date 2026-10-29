import { exportTable, tableSize, type Document, type Table } from "../../engine";
import { pageLabel, plural } from "../format";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { TableView } from "./TableView";
import styles from "./ContentPane.module.css";

type ContentPaneProps = {
  document: Document | null;
  table: Table | null;
  /** A Document is still being read. */
  loading: boolean;
  onOpen: () => void;
  onCopied: (message: string) => void;
};

/** The content pane: the selected Table with Copy, or an empty state. */
export function ContentPane({ document, table, loading, onOpen, onCopied }: ContentPaneProps) {
  return (
    <main className={styles.content}>
      <div className={styles.inner}>
        {document && table ? (
          <TableDetail document={document} table={table} onCopied={onCopied} />
        ) : (
          <EmptyState loading={loading} onOpen={onOpen} />
        )}
      </div>
    </main>
  );
}

function TableDetail({
  document,
  table,
  onCopied,
}: {
  document: Document;
  table: Table;
  onCopied: (message: string) => void;
}) {
  const { rows, cols } = tableSize(table);
  const copy = () => {
    // The fallback sheet for a blocked clipboard (US-49) arrives with the export formats (#10).
    navigator.clipboard.writeText(exportTable(table, "csv")).then(
      () => onCopied("Copied as CSV"),
      () => undefined,
    );
  };
  return (
    <>
      <div className={styles.head}>
        <div className={styles.eyebrow}>
          <span>{document.name}</span>
          <span className={styles.dot}>·</span>
          <span>
            {pageLabel(table)} of {document.pages.length}
          </span>
        </div>
        <h2>Table {table.n}</h2>
      </div>
      <div className={styles.bar}>
        <span className={styles.spacer} />
        <Button variant="primary" onClick={copy}>
          <Icon name="copy" />
          Copy
        </Button>
      </div>
      <div className={styles.card}>
        <TableView table={table} />
      </div>
      <div className={styles.foot}>
        <span>
          {plural(rows, "row")} × {plural(cols, "column")}
        </span>
      </div>
    </>
  );
}

function EmptyState({ loading, onOpen }: { loading: boolean; onOpen: () => void }) {
  return (
    <div className={styles.emptyState}>
      <Icon name={loading ? "doc" : "table"} />
      <h3>{loading ? "Reading your PDF…" : "Drop a PDF to begin"}</h3>
      <p>
        {loading
          ? "Text and table structure are being read on this device."
          : "Table Lift reads text-based PDFs, finds the tables, and lets you copy them as CSV, spreadsheet rows, Markdown or JSON."}
      </p>
      <Button variant="primary" onClick={onOpen}>
        <Icon name="plus" />
        Open PDF
      </Button>
    </div>
  );
}
