import { useState, type ReactNode } from "react";
import {
  EXPORT_FORMATS,
  exportFile,
  exportTable,
  hasSectionHeaders,
  type SectionMode,
  type Table,
} from "../../engine";
import { copyText } from "../copy-text";
import { downloadFile } from "../download-file";
import { useExportFormat } from "../useExportFormat";
import { Button } from "./Button";
import { CopySheet } from "./CopySheet";
import { FormatControl } from "./FormatControl";
import { Icon } from "./Icon";
import { SectionModeControl } from "./SectionModeControl";
import styles from "./ContentPane.module.css";

/** What a Table's detail shows: the Table itself, or its Source Page. */
export type DetailView = "table" | "source";

type ExportBarProps = {
  documentName: string;
  /** What the Table is called in the app ("Table 3", "Stacked Table 1"), for the file name. */
  title: string;
  table: Table;
  /** A Source Cell per grid row, or null for no Source column. */
  source?: readonly string[] | null;
  view: DetailView;
  onView: (view: DetailView) => void;
  sectionMode: SectionMode;
  onSectionMode: (mode: SectionMode) => void;
  onAnnounce: (message: string) => void;
  /** A switch shown before Download, such as "First row is header" or "Source". */
  children?: ReactNode;
};

/**
 * The bar above a Table or a Stacked Table: the Table / Source Page switch, the format, the Section
 * Mode when there are Section Headers, then Download and Copy. A blocked clipboard opens the
 * CopySheet with the text to copy by hand.
 */
export function ExportBar({
  documentName,
  title,
  table,
  source = null,
  view,
  onView,
  sectionMode,
  onSectionMode,
  onAnnounce,
  children,
}: ExportBarProps) {
  const [format, setFormat] = useExportFormat();
  const [sheet, setSheet] = useState<string | null>(null);
  const name = EXPORT_FORMATS.find((f) => f.format === format)!.name;
  const copy = async () => {
    const text = exportTable(table, format, sectionMode, source);
    if (await copyText(text)) {
      onAnnounce(format === "tsv" ? "Copied: paste into Numbers or Excel" : `Copied as ${name}`);
    } else setSheet(text);
  };
  const download = () => {
    downloadFile(exportFile(documentName, title, table, format, sectionMode, source));
    onAnnounce("Downloaded");
  };
  return (
    <>
      <div className={styles.bar}>
        <div className={styles.seg} role="group" aria-label="View">
          {(["table", "source"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)}>
              {v === "table" ? "Table" : "Source Page"}
            </button>
          ))}
        </div>
        <FormatControl value={format} onChange={setFormat} />
        {hasSectionHeaders(table) && (
          <SectionModeControl value={sectionMode} onChange={onSectionMode} />
        )}
        <span className={styles.spacer} />
        {children}
        <Button onClick={download}>
          <Icon name="tray" />
          Download
        </Button>
        <Button variant="primary" onClick={() => void copy()}>
          <Icon name="copy" />
          Copy
        </Button>
      </div>
      {sheet !== null && (
        <CopySheet title={`Copy ${name}`} text={sheet} onDone={() => setSheet(null)} />
      )}
    </>
  );
}
