import { useState } from "react";
import { EXPORT_FORMATS, exportTable, tableSize, type Document, type Table } from "../../engine";
import { copyText } from "../copy-text";
import { pageLabel, plural } from "../format";
import { useExportFormat } from "../useExportFormat";
import { Button } from "./Button";
import { CopySheet } from "./CopySheet";
import { FormatControl } from "./FormatControl";
import { Icon } from "./Icon";
import { SourcePage } from "./SourcePage";
import { TableView } from "./TableView";
import styles from "./ContentPane.module.css";

type ContentPaneProps = {
  document: Document | null;
  table: Table | null;
  /** A Document is still being read. */
  loading: boolean;
  onOpen: () => void;
  onCopied: (message: string) => void;
  onSelectTable: (documentId: string, tableId: string) => void;
  onRemoveTable: (documentId: string, tableId: string) => void;
  onEditCell: (
    documentId: string,
    tableId: string,
    row: number,
    col: number,
    value: string,
  ) => void;
  onToggleHeader: (documentId: string, tableId: string, header: boolean) => void;
};

/** The content pane: the selected Table with Copy, or an empty state. */
export function ContentPane({
  document,
  table,
  loading,
  onOpen,
  onCopied,
  onSelectTable,
  onRemoveTable,
  onEditCell,
  onToggleHeader,
}: ContentPaneProps) {
  return (
    <main className={styles.content}>
      <div className={styles.inner}>
        {document && table ? (
          <TableDetail
            document={document}
            table={table}
            onCopied={onCopied}
            onSelectTable={onSelectTable}
            onRemoveTable={onRemoveTable}
            onEditCell={onEditCell}
            onToggleHeader={onToggleHeader}
          />
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
  onSelectTable,
  onRemoveTable,
  onEditCell,
  onToggleHeader,
}: {
  document: Document;
  table: Table;
  onCopied: (message: string) => void;
  onSelectTable: (documentId: string, tableId: string) => void;
  onRemoveTable: (documentId: string, tableId: string) => void;
  onEditCell: ContentPaneProps["onEditCell"];
  onToggleHeader: ContentPaneProps["onToggleHeader"];
}) {
  const [view, setView] = useState<"table" | "source">("table");
  const { rows, cols } = tableSize(table);
  const [format, setFormat] = useExportFormat();
  const [sheet, setSheet] = useState<string | null>(null);
  const name = EXPORT_FORMATS.find((f) => f.format === format)!.name;
  const copy = async () => {
    const text = exportTable(table, format);
    if (await copyText(text)) {
      onCopied(format === "tsv" ? "Copied: paste into Numbers or Excel" : `Copied as ${name}`);
    } else setSheet(text);
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
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.linkBtn} ${styles.danger}`}
            onClick={() => onRemoveTable(document.id, table.id)}
          >
            <Icon name="trash" />
            Remove Table
          </button>
        </div>
      </div>
      <div className={styles.bar}>
        <div className={styles.seg} role="group" aria-label="View">
          {(["table", "source"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "table" ? "Table" : "Source Page"}
            </button>
          ))}
        </div>
        <FormatControl value={format} onChange={setFormat} />
        <span className={styles.spacer} />
        {view === "table" && (
          <label className={styles.switch}>
            <input
              type="checkbox"
              role="switch"
              checked={table.header}
              onChange={(e) => onToggleHeader(document.id, table.id, e.target.checked)}
            />
            First row is header
          </label>
        )}
        <Button variant="primary" onClick={() => void copy()}>
          <Icon name="copy" />
          Copy
        </Button>
      </div>
      <div className={styles.card}>
        {view === "table" ? (
          <TableView
            table={table}
            onEdit={(row, col, value) => onEditCell(document.id, table.id, row, col, value)}
          />
        ) : (
          <SourcePage
            document={document}
            table={table}
            onSelect={(tableId) => onSelectTable(document.id, tableId)}
          />
        )}
      </div>
      {sheet !== null && (
        <CopySheet title={`Copy ${name}`} text={sheet} onDone={() => setSheet(null)} />
      )}
      <div className={styles.foot}>
        <span>
          {plural(rows, "row")} × {plural(cols, "column")}
          {view === "table"
            ? " · Click a cell to correct it"
            : " · Click an outline to switch tables"}
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
