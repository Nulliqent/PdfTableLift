import { useRef } from "react";
import type { OutlineBox } from "../../pdf-reader";
import { regionName, roleLabel, tableRegions, type Document, type Table } from "../../engine";
import { Icon } from "./Icon";
import { frame, useDrawnPages, usePageWidth } from "../page-drawing";
import { CanvasHost } from "./CanvasHost";
import styles from "./SourcePage.module.css";

/**
 * The selected Table's source page(s), drawn to canvases with every Detected Table on them
 * outlined and labelled. Clicking an outline selects that Table.
 */
export function SourcePage({
  document,
  table,
  onSelect,
}: {
  document: Document;
  table: Table;
  onSelect: (tableId: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  // Fit the pages to the pane, and again whenever the pane changes size.
  const width = usePageWidth(host);
  const pageNums = [...new Set(table.parts.map((p) => p.page))];
  const drawn = useDrawnPages(document.id, pageNums, width);

  return (
    <div ref={host} className={styles.source}>
      {drawn === "failed" ? (
        <div className={styles.message} role="alert">
          <Icon name="warn" />
          <p>This page couldn&apos;t be drawn.</p>
        </div>
      ) : drawn === null ? (
        <div className={styles.message} role="status">
          <p>Drawing the page…</p>
        </div>
      ) : (
        <div className={styles.pages}>
          {drawn.map(({ num, page }) => (
            <figure key={num} className={styles.figure}>
              {drawn.length > 1 && <figcaption className={styles.caption}>Page {num}</figcaption>}
              <div
                className={styles.pagebox}
                style={{ width: page.width }}
                data-testid={`source-page-${num}`}
              >
                <CanvasHost canvas={page.canvas} />
                {document.tables.flatMap((t) => {
                  // A Hand-drawn Table of several Regions is outlined Region by Region.
                  const regions = t.id === table.id ? tableRegions(document, t) : null;
                  if (regions && regions.length > 1)
                    return regions.map((r, k) => (
                      <RegionOutline
                        key={`${t.id}:region:${k}`}
                        name={regionName(k, r.role)}
                        header={r.role === "header"}
                        box={page.locate(r.bbox)}
                      />
                    ));
                  return t.parts.flatMap((part, k) =>
                    part.page === num ? (
                      <Outline
                        key={`${t.id}:${k}`}
                        table={t}
                        part={k}
                        selected={t.id === table.id}
                        box={page.locate(part.bbox)}
                        onSelect={() => onSelect(t.id)}
                      />
                    ) : (
                      []
                    ),
                  );
                })}
              </div>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

/** One Region of the selected Hand-drawn Table: the Header Region is dashed and tagged "Header". */
function RegionOutline({ name, header, box }: { name: string; header: boolean; box: OutlineBox }) {
  return (
    <div
      role="img"
      aria-label={name}
      className={`${styles.regionOutline} ${header ? styles.headerRegion : ""}`}
      style={frame(box)}
      data-testid="region-outline"
    >
      <span aria-hidden="true">{roleLabel(header ? "header" : "body")}</span>
    </div>
  );
}

function Outline({
  table,
  part,
  selected,
  box,
  onSelect,
}: {
  table: Table;
  part: number;
  selected: boolean;
  box: OutlineBox;
  onSelect: () => void;
}) {
  const label = `Table ${table.n}${table.parts.length > 1 ? ` · part ${part + 1} of ${table.parts.length}` : ""}`;
  return (
    <button
      type="button"
      className={selected ? styles.outline : `${styles.outline} ${styles.dim}`}
      style={frame(box)}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      title={`Show Table ${table.n}`}
      onClick={onSelect}
    >
      <span aria-hidden="true">{label}</span>
    </button>
  );
}
