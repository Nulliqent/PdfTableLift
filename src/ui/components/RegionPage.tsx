import { useRef, useState, type PointerEvent } from "react";
import type { Bbox, Document, RegionRole } from "../../engine";
import { Icon } from "./Icon";
import { frame, useDrawnPages, usePageWidth } from "../page-drawing";
import { CanvasHost } from "./CanvasHost";
import source from "./SourcePage.module.css";
import styles from "./RegionPage.module.css";

/** A drag smaller than this, in CSS pixels, in either direction is a tap, not a Region. */
const MIN_DRAG = 8;

type Fractions = { x: number; y: number };

/** A Region as drawn on the page: the one being edited is filled, the Header Region dashed and tagged. */
export type DrawnRegion = {
  bbox: Bbox | null;
  role: RegionRole;
  /** "Region 2 · Header". */
  name: string;
  edited: boolean;
};

/**
 * One page of a Document with a layer to drag a Region on, using the mouse, a pen or a finger.
 * The Region shows as a box over the page; the Tables already there are outlined for context.
 */
export function RegionPage({
  document,
  pageNum,
  regions,
  label,
  onDrag,
}: {
  document: Document;
  pageNum: number;
  /** The Regions so far, in PDF points. */
  regions: DrawnRegion[];
  /** What the Region being edited holds, such as "3 × 4", shown on its corner. */
  label: string;
  onDrag: (bbox: Bbox) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const start = useRef<Fractions | null>(null);
  // A finger scrolls the pane unless Draw is on; it turns itself off when the drag ends.
  const [fingerDraws, setFingerDraws] = useState(false);
  const width = usePageWidth(host);
  const drawn = useDrawnPages(document.id, [pageNum], width);
  const failed = drawn === "failed";
  const page = drawn && drawn !== "failed" ? drawn[0]!.page : null;

  const at = (e: PointerEvent): Fractions => {
    const b = layer.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - b.left) / b.width, 0), 1),
      y: Math.min(Math.max((e.clientY - b.top) / b.height, 0), 1),
    };
  };
  const drag = (to: Fractions) => {
    const from = start.current;
    if (!from || !page) return;
    const w = Math.abs(to.x - from.x) * page.width;
    const h = Math.abs(to.y - from.y) * page.height;
    if (w < MIN_DRAG || h < MIN_DRAG) return;
    onDrag(
      page.unlocate({
        left: Math.min(from.x, to.x),
        top: Math.min(from.y, to.y),
        width: Math.abs(to.x - from.x),
        height: Math.abs(to.y - from.y),
      }) as Bbox,
    );
  };
  /** Ends the drag. Only a lifted pointer has a real last position; a cancelled one keeps the last move. */
  const end = (e: PointerEvent) => {
    if (!start.current) return;
    if (e.type !== "pointercancel") drag(at(e));
    start.current = null;
    if (e.pointerType === "touch") setFingerDraws(false);
  };

  return (
    <div ref={host} className={source.source}>
      <button
        type="button"
        className={styles.drawToggle}
        aria-pressed={fingerDraws}
        onClick={() => setFingerDraws((on) => !on)}
      >
        Draw
      </button>
      {failed ? (
        <div className={source.message} role="alert">
          <Icon name="warn" />
          <p>This page couldn&apos;t be drawn.</p>
        </div>
      ) : !page ? (
        <div className={source.message} role="status">
          <p>Drawing the page…</p>
        </div>
      ) : (
        <div
          className={`${source.pagebox} ${styles.drawing}`}
          style={{ width: page.width }}
          data-testid={`region-page-${pageNum}`}
        >
          <CanvasHost canvas={page.canvas} />
          {document.tables.flatMap((t) =>
            t.parts.flatMap((part, k) =>
              part.page === pageNum
                ? [
                    <div
                      key={`${t.id}:${k}`}
                      className={`${source.outline} ${source.dim} ${styles.existing}`}
                      style={frame(page.locate(part.bbox))}
                      aria-hidden="true"
                    >
                      <span>Table {t.n}</span>
                    </div>,
                  ]
                : [],
            ),
          )}
          {/* The Region being edited first, so the others are not dimmed by its shadow. */}
          {[...regions]
            .sort((p, q) => Number(q.edited) - Number(p.edited))
            .map((r) =>
              r.bbox ? (
                <div
                  key={r.name}
                  className={`${r.edited ? styles.selection : styles.other} ${r.role === "header" ? styles.header : ""}`}
                  style={frame(page.locate(r.bbox))}
                  data-testid={r.edited ? "region-box" : "region-box-other"}
                  aria-hidden="true"
                >
                  <span>{r.role === "header" ? "Header" : r.edited ? label : r.name}</span>
                </div>
              ) : null,
            )}
          <div
            ref={layer}
            className={`${styles.layer} ${fingerDraws ? styles.fingerDraws : ""}`}
            role="group"
            aria-label="Drag to select a table region"
            onPointerDown={(e) => {
              if (e.button > 0) return;
              if (e.pointerType === "touch" && !fingerDraws) return; // the swipe scrolls
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              start.current = at(e);
            }}
            onPointerMove={(e) => start.current && drag(at(e))}
            onPointerUp={end}
            onPointerCancel={end}
          />
        </div>
      )}
    </div>
  );
}
