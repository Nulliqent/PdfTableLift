import { useEffect } from "react";
import type {
  Bbox,
  Document,
  RegionInProgress,
  RegionRole,
  RegionBlocked,
  RegionTable,
} from "../../engine";
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
  preview: RegionTable | null;
  /** Why the Regions cannot be saved, or null when they can. */
  blocked: RegionBlocked | null;
  onPage: (page: number) => void;
  onDrag: (bbox: Bbox) => void;
  onWholePage: () => void;
  /** "Treat Region as one row" was switched. */
  onSingleRow: (index: number, value: boolean) => void;
  /** Add Region: another Region on the same page. */
  onAddRegion: () => void;
  onPickRegion: (index: number) => void;
  onRemoveRegion: (index: number) => void;
  onRole: (index: number, role: RegionRole) => void;
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
  blocked,
  onPage,
  onDrag,
  onWholePage,
  onSingleRow,
  onAddRegion,
  onPickRegion,
  onRemoveRegion,
  onRole,
  onCancel,
  onSave,
}: RegionSelectionProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const edited = region.regions[region.edited]!;
  const last = Math.max(...document.pages.map((p) => p.num));
  // The preview shows the Header Row as the saved Table will start: off for a single Row.
  const label = preview
    ? `${preview.grid.length - (preview.header ? 1 : 0)} × ${preview.grid[0]!.length}`
    : "No text";
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
          used, and the columns are worked out from it. If the column titles sit apart from the
          rows, add a Region for them and mark it Header.
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
        <button type="button" className={styles.link} onClick={onAddRegion}>
          Add Region
        </button>
        <span className={pane.spacer} />
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!preview || blocked !== null} onClick={onSave}>
          <Icon name="check" />
          {region.redraw ? "Replace Table" : "Add Table"}
        </Button>
      </div>
      <ul className={styles.regions} aria-label="Regions">
        {region.regions.map((r, i) => (
          <li key={i} className={i === region.edited ? styles.current : undefined}>
            <button
              type="button"
              className={styles.pick}
              aria-current={i === region.edited ? "true" : undefined}
              onClick={() => onPickRegion(i)}
            >
              {regionName(i, r.role)}
            </button>
            <div className={styles.roles} role="group" aria-label={`Region ${i + 1} role`}>
              {(["header", "body"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  aria-pressed={r.role === role}
                  onClick={() => onRole(i, role)}
                >
                  {role === "header" ? "Header" : "Body"}
                </button>
              ))}
            </div>
            {r.role === "body" && (
              <label className={pane.switch}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={r.singleRow}
                  onChange={(e) => onSingleRow(i, e.target.checked)}
                />
                Treat Region as one row
              </label>
            )}
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove Region ${i + 1}`}
              onClick={() => onRemoveRegion(i)}
            >
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.layout}>
        <div className={pane.card}>
          <RegionPage
            document={document}
            pageNum={region.page}
            regions={region.regions.map((r, i) => ({
              bbox: r.bbox,
              role: r.role,
              name: regionName(i, r.role),
              edited: i === region.edited,
            }))}
            label={label}
            onDrag={onDrag}
          />
        </div>
        <div className={`${pane.card} ${styles.preview}`} aria-live="polite">
          <Preview
            drawn={region.regions.some((r) => r.bbox !== null)}
            table={preview}
            blocked={blocked}
            lone={region.regions.length === 1 && edited.role === "body"}
            undrawn={region.regions.findIndex((r) => !r.bbox)}
          />
        </div>
      </div>
    </>
  );
}

/** "Region 2 · Header": the name of a Region in the list, on the page and in announcements. */
const regionName = (index: number, role: RegionRole) =>
  `Region ${index + 1} · ${role === "header" ? "Header" : "Body"}`;

function Preview({
  drawn,
  table,
  blocked,
  lone,
  undrawn,
}: {
  drawn: boolean;
  table: RegionTable | null;
  blocked: RegionBlocked | null;
  lone: boolean;
  /** Index of the first Region not yet dragged, or -1. */
  undrawn: number;
}) {
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
  if (blocked === "undrawn")
    return (
      <div className={styles.empty}>
        <Icon name="warn" />
        <b>Region {undrawn + 1} is not drawn yet</b>
        <span>Drag across the page to draw it, or remove it, to save the Table.</span>
      </div>
    );
  if (!table) {
    // A lone Body Region keeps today's wording; with other Regions the reason names the one at fault.
    const reason =
      blocked === "no-header"
        ? "No text in the Header Region"
        : lone
          ? "No text in this Region"
          : "No Body Region with text";
    return (
      <div className={styles.empty}>
        <Icon name="warn" />
        <b>{reason}</b>
        <span>
          {blocked === "no-header"
            ? "Move the Header Region over the column titles, or mark it Body."
            : "Select a Region that contains text. Tables that are pictures, like scans, can’t be read."}
        </span>
      </div>
    );
  }
  const { header } = table;
  const head = header ? table.grid[0]! : null;
  const body = header ? table.grid.slice(1) : table.grid;
  const cols = table.grid[0]!.length;
  const shown = PREVIEW_ROWS - (header ? 1 : 0);
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
          {head && (
            <thead>
              <tr>
                {head.map((v, c) => (
                  <th key={c}>{v}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.slice(0, shown).map((row, r) => (
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
      {body.length > shown && (
        <div className={styles.more}>and {plural(body.length - shown, "more row")}</div>
      )}
      <div className={styles.tip}>
        {cols === 1
          ? "Only one column was found. Move Column spacing to the left to split columns further."
          : "Columns wrong? Move Column spacing in the sidebar; this preview updates as you go."}
      </div>
    </>
  );
}
