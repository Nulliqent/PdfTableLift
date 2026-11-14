import { useRef } from "react";
import type { OutlineBox } from "../../pdf-reader";
import {
  regionName,
  roleLabel,
  tableRegions,
  type Document,
  type StackedMember,
  type Table,
} from "../../engine";
import { Icon } from "./Icon";
import { frame, useDrawnPages, usePageWidth } from "../page-drawing";
import { CanvasHost } from "./CanvasHost";
import styles from "./SourcePage.module.css";

/** How a Table is outlined: the selected one, a Member of the selected Stacked Table, or another. */
type Look = "selected" | "member" | "left-out" | "other";

/**
 * The source page(s) drawn to canvases, with Tables outlined and labelled. Clicking an outline
 * selects that Table.
 * - For a Table: its pages, with every Table on them outlined and the selected one standing out.
 * - For a Stacked Table (`members`): every page holding a Member, once each and in page order,
 *   with only the Members outlined. A left-out Member says so in its label.
 */
export function SourcePage({
  document,
  onSelect,
  ...shown
}: {
  document: Document;
  onSelect: (tableId: string) => void;
} & ({ table: Table } | { members: StackedMember[] })) {
  const host = useRef<HTMLDivElement>(null);
  // Fit the pages to the pane, and again whenever the pane changes size.
  const width = usePageWidth(host);
  const table = "table" in shown ? shown.table : null;
  const members = "members" in shown ? shown.members : [];
  const outlined: { table: Table; look: Look }[] = table
    ? document.tables.map((t) => ({ table: t, look: t.id === table.id ? "selected" : "other" }))
    : members.flatMap((m, i, all) =>
        // A Table that is the Member twice is outlined once.
        m.table && all.findIndex((o) => o.table?.id === m.table!.id) === i
          ? [{ table: m.table, look: m.leftOut ? "left-out" : "member" }]
          : [],
      );
  const pageNums = table
    ? [...new Set(table.parts.map((p) => p.page))]
    : [...new Set(outlined.flatMap((o) => o.table.parts.map((p) => p.page)))].sort((a, b) => a - b);
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
                {outlined.flatMap(({ table: t, look }) => {
                  // The selected Hand-drawn Table of several Regions is outlined Region by Region.
                  const regions = look === "selected" ? tableRegions(document, t) : null;
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
                        look={look}
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

/**
 * One Part of a Table, as a button that selects it. The selected Table and the Members are solid.
 * Any other Table, and a left-out Member, is dashed, and "left out" is said in the label too.
 */
function Outline({
  table,
  part,
  look,
  box,
  onSelect,
}: {
  table: Table;
  part: number;
  look: Look;
  box: OutlineBox;
  onSelect: () => void;
}) {
  const label =
    `Table ${table.n}` +
    (table.parts.length > 1 ? ` · part ${part + 1} of ${table.parts.length}` : "") +
    (look === "left-out" ? " · left out" : "");
  const solid = look === "selected" || look === "member";
  return (
    <button
      type="button"
      className={solid ? styles.outline : `${styles.outline} ${styles.dim}`}
      style={frame(box)}
      aria-label={label}
      aria-current={look === "selected" ? "true" : undefined}
      title={`Show Table ${table.n}`}
      onClick={onSelect}
    >
      <span aria-hidden="true">{label}</span>
    </button>
  );
}
