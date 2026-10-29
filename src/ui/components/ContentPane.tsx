import { useState, type ReactNode } from "react";
import {
  EXPORT_FORMATS,
  READ_ERROR_MESSAGES,
  exportTable,
  hasSectionHeaders,
  isSectionHeader,
  tableSize,
  type Document,
  type Table,
} from "../../engine";
import { copyText } from "../copy-text";
import { pageLabel, plural } from "../format";
import { useExportFormat } from "../useExportFormat";
import { useSectionMode } from "../useSectionMode";
import { Button } from "./Button";
import { CopySheet } from "./CopySheet";
import { FormatControl } from "./FormatControl";
import { Icon } from "./Icon";
import { SectionModeControl } from "./SectionModeControl";
import { SourcePage } from "./SourcePage";
import { TableView } from "./TableView";
import styles from "./ContentPane.module.css";

type ContentPaneProps = {
  document: Document | null;
  table: Table | null;
  /** Every Document, for the screens shown when no Table is selected. */
  documents: Document[];
  onSelectRegion: (documentId: string) => void;
  onOpen: () => void;
  onCopied: (message: string) => void;
  onSelectTable: (documentId: string, tableId: string) => void;
  /** Select Region, shown in place of the selected Table while the user is drawing a Region. */
  regionSelection?: ReactNode;
  onRemoveTable: (documentId: string, tableId: string) => void;
  /** Redraw the Region of a Table on the page of one of its Parts. */
  onRedrawRegion: (documentId: string, tableId: string, page: number) => void;
  onEditCell: (
    documentId: string,
    tableId: string,
    row: number,
    col: number,
    value: string,
  ) => void;
  onToggleHeader: (documentId: string, tableId: string, header: boolean) => void;
  onToggleSection: (documentId: string, tableId: string, row: number) => void;
  onSplitByPage: (documentId: string, tableId: string) => void;
  onJoinAgain: (documentId: string, tableId: string) => void;
};

/** The content pane: the selected Table with Copy, or an empty state. */
export function ContentPane({
  document,
  table,
  documents,
  onSelectRegion,
  onOpen,
  onCopied,
  onSelectTable,
  regionSelection,
  onRemoveTable,
  onRedrawRegion,
  onEditCell,
  onToggleHeader,
  onToggleSection,
  onSplitByPage,
  onJoinAgain,
}: ContentPaneProps) {
  return (
    <main className={styles.content}>
      <div className={styles.inner}>
        {regionSelection ? (
          regionSelection
        ) : document && table ? (
          <TableDetail
            document={document}
            table={table}
            onCopied={onCopied}
            onSelectTable={onSelectTable}
            onRemoveTable={onRemoveTable}
            onRedrawRegion={onRedrawRegion}
            onEditCell={onEditCell}
            onToggleHeader={onToggleHeader}
            onToggleSection={onToggleSection}
            onSplitByPage={onSplitByPage}
            onJoinAgain={onJoinAgain}
          />
        ) : (
          <EmptyState documents={documents} onOpen={onOpen} onSelectRegion={onSelectRegion} />
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
  onRedrawRegion,
  onEditCell,
  onToggleHeader,
  onToggleSection,
  onSplitByPage,
  onJoinAgain,
}: {
  document: Document;
  table: Table;
  onCopied: (message: string) => void;
  onSelectTable: (documentId: string, tableId: string) => void;
  onRemoveTable: (documentId: string, tableId: string) => void;
  onRedrawRegion: ContentPaneProps["onRedrawRegion"];
  onEditCell: ContentPaneProps["onEditCell"];
  onToggleHeader: ContentPaneProps["onToggleHeader"];
  onToggleSection: ContentPaneProps["onToggleSection"];
  onSplitByPage: ContentPaneProps["onSplitByPage"];
  onJoinAgain: ContentPaneProps["onJoinAgain"];
}) {
  const [view, setView] = useState<"table" | "source">("table");
  const { rows, cols } = tableSize(table);
  const [format, setFormat] = useExportFormat();
  const [sectionMode, setSectionMode] = useSectionMode();
  const sections = table.sections.filter((r) => isSectionHeader(table, r)).length;
  const [sheet, setSheet] = useState<string | null>(null);
  const name = EXPORT_FORMATS.find((f) => f.format === format)!.name;
  const copy = async () => {
    const text = exportTable(table, format, sectionMode);
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
        {table.manual !== null && (
          <span className={styles.tag}>
            <Icon name="select" />
            Selected by hand
          </span>
        )}
        {table.parts.length > 1 && (
          <div className={styles.joined}>
            <Icon name="link" />
            <span>
              Joined from {table.parts.length} pages
              {table.repeats > 0 && ", repeated header removed"}
            </span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => onSplitByPage(document.id, table.id)}
            >
              Split by Page
            </button>
          </div>
        )}
        {table.splitFrom && (
          <div className={styles.joined}>
            <Icon name="link" />
            <span>Split from the table on page {table.page - 1}</span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => onJoinAgain(document.id, table.id)}
            >
              Join Again
            </button>
          </div>
        )}
        <div className={styles.actions}>
          {table.parts.map((part) => (
            <button
              key={part.page}
              type="button"
              className={styles.linkBtn}
              onClick={() => onRedrawRegion(document.id, table.id, part.page)}
            >
              <Icon name="select" />
              {table.parts.length > 1 ? `Redraw Region on Page ${part.page}` : "Redraw Region"}
            </button>
          ))}
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
        {hasSectionHeaders(table) && (
          <SectionModeControl value={sectionMode} onChange={setSectionMode} />
        )}
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
            sectionMode={sectionMode}
            onEdit={(row, col, value) => onEditCell(document.id, table.id, row, col, value)}
            onToggleSection={(row) => {
              const marking = !isSectionHeader(table, row);
              onToggleSection(document.id, table.id, row);
              // In As Column mode the new Section Header leaves the grid, so say where it went.
              if (marking && sectionMode === "column")
                onCopied("Marked as section · switch to As Rows to edit its name");
            }}
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
          {sections > 0 && ` in ${plural(sections, "section")}`}
          {view === "table"
            ? sections > 0 && sectionMode === "column"
              ? " · Click a cell to correct it · Section headers are in the Section column: switch to As Rows to edit or unmark them"
              : " · Click a cell to correct it · Click a row number to mark or unmark a section header"
            : " · Click an outline to switch tables"}
        </span>
      </div>
    </>
  );
}

/**
 * What the pane shows when no Table is selected: the reading state, or, for the newest Document
 * that needs the user's attention, why it has no Tables.
 */
function EmptyState({
  documents,
  onOpen,
  onSelectRegion,
}: {
  documents: Document[];
  onOpen: () => void;
  onSelectRegion: (documentId: string) => void;
}) {
  const loading = documents.some((d) => d.status === "loading");
  const attention = documents.findLast(
    (d) => d.status === "error" || (d.status === "ready" && d.tables.length === 0),
  );
  if (!loading && attention?.status === "error") {
    return (
      <div className={styles.emptyState} role="alert">
        <Icon name="warn" />
        <h3>{attention.name}</h3>
        <p>{READ_ERROR_MESSAGES[attention.error!]}</p>
        <Button variant="primary" onClick={onOpen}>
          <Icon name="plus" />
          Open Another PDF
        </Button>
      </div>
    );
  }
  if (!loading && attention?.status === "ready") {
    return (
      <div className={styles.emptyState}>
        <Icon name="select" />
        <h3>No tables were detected</h3>
        <p>
          Draw a box around the table on the page and Table Lift will read the rows and columns
          inside it. Moving Column Spacing to the right can also help.
        </p>
        <div className={styles.buttons}>
          <Button variant="primary" onClick={() => onSelectRegion(attention.id)}>
            <Icon name="select" />
            Select Table Region
          </Button>
          <Button onClick={onOpen}>Open Another PDF</Button>
        </div>
      </div>
    );
  }
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
