import { useEffect } from "react";
import type { Bbox, Document, FoundTable, RegionInProgress } from "../../engine";
import { plural } from "../format";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { RegionPage } from "./RegionPage";
import pane from "./ContentPane.module.css";
import styles from "./RegionSelection.module.css";

/** Rows of the preview shown before "and N more rows". */
const PREVIEW_ROWS = 8;

type RegionSelectionProps = {
  document: Document;
  region: RegionInProgress;
  /** The Table the Region would make now, or null while nothing is drawn or it holds no text. */
  preview: FoundTable | null;
  onPage: (page: number) => void;
  onDrag: (bbox: Bbox) => void;
  onWholePage: () => void;
  onCancel: () => void;
  onSave: () => void;
};

/**
 * Select Region: a page stepper, the page to drag a Region on, and a live preview of the rows
 * and columns inside it. Escape or Cancel leaves with no changes.
 */
export function RegionSelection({
  document,
  region,
  preview,
  onPage,
  onDrag,
  onWholePage,
  onCancel,
  onSave,
}: RegionSelectionProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const last = Math.max(...document.pages.map((p) => p.num));
  const label = preview ? `${preview.grid.length - 1} × ${preview.grid[0]!.length}` : "No text";
  return (
    <>
      <div className={pane.head}>
        <div className={pane.eyebrow}>
          <span>{document.name}</span>
          <span className={pane.dot}>·</span>
          <span>{region.redraw ? "Redraw" : "New table"}</span>
        </div>
        <h2>Select Table Region</h2>
        <p className={styles.lede}>
          Drag a box around the table, including its header row. Only the text inside the box is
          used, and the columns are worked out from it.
        </p>
      </div>
      <div className={pane.bar}>
        <div className={styles.stepper} role="group" aria-label="Page">
          <button
            type="button"
            aria-label="Previous page"
            disabled={region.page <= 1}
            onClick={() => onPage(region.page - 1)}
          >
            ‹
          </button>
          <span>
            Page {region.page} of {last}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={region.page >= last}
            onClick={() => onPage(region.page + 1)}
          >
            ›
          </button>
        </div>
        <button type="button" className={styles.link} onClick={onWholePage}>
          Select Whole Page
        </button>
        <span className={pane.spacer} />
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!preview} onClick={onSave}>
          <Icon name="check" />
          {region.redraw ? "Replace Table" : "Add Table"}
        </Button>
      </div>
      <div className={styles.layout}>
        <div className={pane.card}>
          <RegionPage
            document={document}
            pageNum={region.page}
            bbox={region.bbox}
            label={label}
            onDrag={onDrag}
          />
        </div>
        <div className={`${pane.card} ${styles.preview}`} aria-live="polite">
          <Preview drawn={region.bbox !== null} table={preview} />
        </div>
      </div>
    </>
  );
}

function Preview({ drawn, table }: { drawn: boolean; table: FoundTable | null }) {
  if (!drawn)
    return (
      <div className={styles.empty}>
        <Icon name="select" />
        <b>Nothing selected yet</b>
        <span>
          Drag across the page to select a table. The rows and columns found inside will appear
          here.
        </span>
      </div>
    );
  if (!table)
    return (
      <div className={styles.empty}>
        <Icon name="warn" />
        <b>No text in this area</b>
        <span>
          Select an area that contains text. Tables that are pictures, like scans, can’t be read.
        </span>
      </div>
    );
  const [head, ...body] = table.grid;
  const cols = head!.length;
  return (
    <>
      <div className={styles.pvHead}>
        <b>Preview</b>
        <span>
          {plural(body.length, "row")} × {plural(cols, "column")}
        </span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.pv}>
          <thead>
            <tr>
              {head!.map((v, c) => (
                <th key={c}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.slice(0, PREVIEW_ROWS - 1).map((row, r) => (
              <tr key={r}>
                {row.map((v, c) => (
                  <td key={c} className={v ? undefined : styles.none}>
                    {v || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {body.length > PREVIEW_ROWS - 1 && (
        <div className={styles.more}>
          and {plural(body.length - (PREVIEW_ROWS - 1), "more row")}
        </div>
      )}
      <div className={styles.tip}>
        {cols === 1
          ? "Only one column was found. Move Column spacing to the left to split columns further."
          : "Columns wrong? Move Column spacing in the sidebar; this preview updates as you go."}
      </div>
    </>
  );
}
