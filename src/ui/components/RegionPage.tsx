import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { RenderedPage } from "../../pdf-reader";
import type { Bbox, Document } from "../../engine";
import { pageRendererFor } from "../documentSources";
import { Icon } from "./Icon";
import { CanvasHost } from "./SourcePage";
import source from "./SourcePage.module.css";
import styles from "./RegionPage.module.css";

const MAX_PAGE_WIDTH = 900;
const MIN_PAGE_WIDTH = 240;
const GUTTER = 16;
/** A drag smaller than this, in CSS pixels, in either direction is a tap, not a Region. */
const MIN_DRAG = 8;

type Fractions = { x: number; y: number };
type Result = { key: string; page: RenderedPage | "failed" };

/**
 * One page of a Document with a layer to drag a Region on, using the mouse, a pen or a finger.
 * The Region shows as a box over the page; the Tables already there are outlined for context.
 */
export function RegionPage({
  document,
  pageNum,
  bbox,
  label,
  onDrag,
}: {
  document: Document;
  pageNum: number;
  /** The Region so far, in PDF points. */
  bbox: Bbox | null;
  /** What the Region holds, such as "3 × 4", shown on its corner. */
  label: string;
  onDrag: (bbox: Bbox) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const start = useRef<Fractions | null>(null);
  const [width, setWidth] = useState(0);
  // The last result, tagged with what it shows. While the pane is resized the old page stays up
  // (the boxes are fractions, so they still line up) until the redraw lands.
  const [result, setResult] = useState<Result | null>(null);
  const key = `${document.id}|${pageNum}`;
  const failed = result?.key === key && result.page === "failed";
  const page = result?.page !== "failed" && result?.key === key ? result.page : null;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () =>
      setWidth(
        Math.round(Math.min(Math.max(el.clientWidth - 2 * GUTTER, MIN_PAGE_WIDTH), MAX_PAGE_WIDTH)),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const renderer = await pageRendererFor(document.id);
        const drawn = await renderer.renderPage(pageNum, width, abort.signal);
        // A render that finished after a newer one started must not overwrite its result.
        if (!abort.signal.aborted) setResult({ key, page: drawn });
      } catch {
        if (!abort.signal.aborted) setResult({ key, page: "failed" });
      }
    })();
    return () => abort.abort();
  }, [document.id, key, pageNum, width]);

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
  const end = (e: PointerEvent) => {
    if (!start.current) return;
    drag(at(e));
    start.current = null;
  };

  return (
    <div ref={host} className={source.source}>
      {failed ? (
        <div className={source.message} role="alert">
          <Icon name="warn" />
          <p>This page couldn&apos;t be drawn.</p>
        </div>
      ) : !result || !page ? (
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
          {bbox && (
            <div
              className={styles.selection}
              style={frame(page.locate(bbox))}
              data-testid="region-box"
            >
              <span>{label}</span>
            </div>
          )}
          <div
            ref={layer}
            className={styles.layer}
            role="group"
            aria-label="Drag to select a table region"
            onPointerDown={(e) => {
              if (e.button > 0) return;
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

const frame = (o: { left: number; top: number; width: number; height: number }) => ({
  left: `${o.left * 100}%`,
  top: `${o.top * 100}%`,
  width: `${o.width * 100}%`,
  height: `${o.height * 100}%`,
});
