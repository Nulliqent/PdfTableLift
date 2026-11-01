import { useState } from "react";
import {
  EXPORT_FORMATS,
  exportTable,
  hasSectionHeaders,
  isSectionHeader,
  tableSize,
  type BuiltStackedTable,
  type Document,
} from "../../engine";
import { copyText } from "../copy-text";
import { plural } from "../format";
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

type StackedTableDetailProps = {
  document: Document;
  stacked: BuiltStackedTable;
  onAnnounce: (message: string) => void;
  onSelectTable: (documentId: string, tableId: string) => void;
  /** Its Members are being edited in the sidebar. */
  editing: boolean;
  onEditMembers: (documentId: string, stackedId: string) => void;
  onRemoveStacked: (documentId: string, stackedId: string) => void;
};

/**
 * The preview of a Stacked Table: read-only, with a note that sends the user to its Members, any
 * Members left out, and the format, Section Mode and Copy as for any Table.
 */
export function StackedTableDetail({
  document,
  stacked,
  onAnnounce,
  onSelectTable,
  editing,
  onEditMembers,
  onRemoveStacked,
}: StackedTableDetailProps) {
  const { table, members, record } = stacked;
  const [view, setView] = useState<"table" | "source">("table");
  const { rows, cols } = tableSize(table);
  const [format, setFormat] = useExportFormat();
  const [sectionMode, setSectionMode] = useSectionMode();
  const sections = table.sections.filter((r) => isSectionHeader(table, r)).length;
  const [sheet, setSheet] = useState<string | null>(null);
  const name = EXPORT_FORMATS.find((f) => f.format === format)!.name;
  const found = members.flatMap((m) => (m.table ? [m.table] : []));
  const copy = async () => {
    const text = exportTable(table, format, sectionMode);
    if (await copyText(text)) {
      onAnnounce(format === "tsv" ? "Copied: paste into Numbers or Excel" : `Copied as ${name}`);
    } else setSheet(text);
  };
  return (
    <>
      <div className={styles.head}>
        <div className={styles.eyebrow}>
          <span>{document.name}</span>
          <span className={styles.dot}>·</span>
          <span>
            {found.length === 1 ? "Table" : "Tables"} {found.map((t) => t.n).join(", ")}
          </span>
        </div>
        <h2>Stacked Table {record.n}</h2>
        <div className={styles.joined}>
          <Icon name="stack" />
          <span>Read-only. To correct a Cell, edit its Member:</span>
          {found.map((t) => (
            <button
              key={t.id}
              type="button"
              className={styles.linkBtn}
              onClick={() => onSelectTable(document.id, t.id)}
            >
              Table {t.n}
            </button>
          ))}
        </div>
        {members.map((m, i) =>
          m.leftOut === "no-match" && m.table ? (
            <div key={i} className={styles.joined}>
              <Icon name="warn" />
              <span>
                Table {m.table.n} no longer matches the Header Row and is left out ({m.reason})
              </span>
            </div>
          ) : null,
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.linkBtn}
            aria-disabled={editing ? true : undefined}
            onClick={() => {
              if (!editing) onEditMembers(document.id, record.id);
            }}
          >
            <Icon name="stack" />
            Edit Members
          </button>
          <button
            type="button"
            className={`${styles.linkBtn} ${styles.danger}`}
            onClick={() => onRemoveStacked(document.id, record.id)}
          >
            <Icon name="trash" />
            Remove Stacked Table
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
        <Button variant="primary" onClick={() => void copy()}>
          <Icon name="copy" />
          Copy
        </Button>
      </div>
      <div className={styles.card}>
        {view === "table" ? (
          <TableView table={table} sectionMode={sectionMode} readOnly />
        ) : (
          <SourcePage
            document={document}
            members={members}
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
          {sections > 0 && ` in ${plural(sections, "section")}`} · Stacked from{" "}
          {plural(found.length, "Table")} ·{" "}
          {view === "table" ? "Read-only" : "Click an outline to open that Member"}
        </span>
      </div>
    </>
  );
}
