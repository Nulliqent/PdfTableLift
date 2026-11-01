import { useEffect, useRef, useState } from "react";
import {
  EXPORT_FORMATS,
  exportFile,
  exportTable,
  hasSectionHeaders,
  isSectionHeader,
  tableSize,
  type BuiltStackedTable,
  type Document,
  type StackedMember,
} from "../../engine";
import { copyText } from "../copy-text";
import { downloadFile } from "../download-file";
import { plural } from "../format";
import { useExportFormat } from "../useExportFormat";
import { useSectionMode } from "../useSectionMode";
import { Button } from "./Button";
import { CopySheet } from "./CopySheet";
import { FormatControl } from "./FormatControl";
import { Icon, type IconName } from "./Icon";
import { SectionModeControl } from "./SectionModeControl";
import { SourcePage } from "./SourcePage";
import { TableView } from "./TableView";
import styles from "./ContentPane.module.css";

type StackedTableDetailProps = {
  document: Document;
  stacked: BuiltStackedTable;
  onAnnounce: (message: string, icon?: IconName) => void;
  onSelectTable: (documentId: string, tableId: string) => void;
  /** Its Members are being edited in the sidebar. */
  editing: boolean;
  onEditMembers: (documentId: string, stackedId: string) => void;
  onRemoveStacked: (documentId: string, stackedId: string) => void;
  /** The Source switch: a leading Source column with each Row's page. */
  onToggleSource: (documentId: string, stackedId: string, source: boolean) => void;
};

const pageList = (pages: number[]) => {
  const ps = pages.map((p) => `p${p}`);
  return ps.length < 2 ? ps.join("") : `${ps.slice(0, -1).join(", ")} and ${ps.at(-1)}`;
};

/**
 * What changed in the Members since stacking, one sentence each: a Member that no longer matches
 * the Header Row, Parts split off a Joined Member, and a Member no Table is any more.
 */
function memberNotices(doc: Document, members: StackedMember[]): string[] {
  return members.flatMap((m) => {
    const t = m.table;
    if (!t) return [`The Member on p${m.ref.page} is no longer a Table of its own and is left out`];
    if (m.leftOut === "no-match")
      return [`Table ${t.n} no longer matches the Header Row and is left out (${m.reason})`];
    if (!m.dropped.length) return [];
    const pages = [...new Set(m.dropped.map((p) => p.page))];
    return pages.every((p) => doc.noJoin.includes(p))
      ? [`Table ${t.n} was split by page: its Rows on ${pageList(pages)} are left out`]
      : [`Table ${t.n} no longer continues onto ${pageList(pages)}: those Rows are left out`];
  });
}

/**
 * The preview of a Stacked Table: read-only, with a note that sends the user to its Members, any
 * Members left out, the Source switch, and the format, Section Mode, Download and Copy as for any
 * Table.
 */
export function StackedTableDetail({
  document,
  stacked,
  onAnnounce,
  onSelectTable,
  editing,
  onEditMembers,
  onRemoveStacked,
  onToggleSource,
}: StackedTableDetailProps) {
  const { table, members, record, source } = stacked;
  const [view, setView] = useState<"table" | "source">("table");
  const { rows, cols } = tableSize(table);
  const [format, setFormat] = useExportFormat();
  const [sectionMode, setSectionMode] = useSectionMode();
  const sections = table.sections.filter((r) => isSectionHeader(table, r)).length;
  const [sheet, setSheet] = useState<string | null>(null);
  const name = EXPORT_FORMATS.find((f) => f.format === format)!.name;
  const found = members.flatMap((m) => (m.table ? [m.table] : []));
  const notices = memberNotices(document, members);
  // Each notice is announced when it appears, including those already standing when it is opened.
  const announced = useRef(new Set<string>());
  const noticeKey = notices.join("\n");
  useEffect(() => {
    const now = noticeKey ? noticeKey.split("\n") : [];
    const fresh = now.filter((n) => !announced.current.has(n));
    announced.current = new Set(now);
    if (fresh.length) onAnnounce(fresh.join(". "), "warn");
  }, [noticeKey, onAnnounce]);
  const copy = async () => {
    const text = exportTable(table, format, sectionMode, source);
    if (await copyText(text)) {
      onAnnounce(format === "tsv" ? "Copied: paste into Numbers or Excel" : `Copied as ${name}`);
    } else setSheet(text);
  };
  const download = () => {
    const title = `Stacked Table ${record.n}`;
    downloadFile(exportFile(document.name, title, table, format, sectionMode, source));
    onAnnounce("Downloaded");
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
        {notices.map((notice) => (
          <div key={notice} className={styles.joined} data-member-notice>
            <Icon name="warn" />
            <span>{notice}</span>
          </div>
        ))}
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
        <label className={styles.switch}>
          <input
            type="checkbox"
            role="switch"
            checked={record.source}
            onChange={(e) => {
              onToggleSource(document.id, record.id, e.target.checked);
              onAnnounce(e.target.checked ? "Source column on" : "Source column off");
            }}
          />
          Source
        </label>
        <Button onClick={download}>
          <Icon name="tray" />
          Download
        </Button>
        <Button variant="primary" onClick={() => void copy()}>
          <Icon name="copy" />
          Copy
        </Button>
      </div>
      <div className={styles.card}>
        {view === "table" ? (
          <TableView table={table} sectionMode={sectionMode} readOnly source={source} />
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
