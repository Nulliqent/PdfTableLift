import { useEffect, useRef, useState } from "react";
import type { RenderedPage } from "../../pdf-reader";
import type { Document, Table } from "../../engine";
import { pageRendererFor } from "../documentSources";
import { Icon } from "./Icon";
import styles from "./SourcePage.module.css";

/** The widest a page is drawn, in CSS pixels. */
const MAX_PAGE_WIDTH = 900;
/** The least a page is drawn at, so a very narrow pane still shows something. */
const MIN_PAGE_WIDTH = 240;
/** Horizontal padding of the card around the pages. */
const GUTTER = 16;

type Drawn = { num: number; page: RenderedPage };

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
  const [width, setWidth] = useState(0);
  // The last result, tagged with what it shows. While the pane is resized the old pages stay up
  // (their outlines are fractions, so they still line up) until the redraw lands.
  const [result, setResult] = useState<{ key: string; pages: Drawn[] | "failed" } | null>(null);
  const pageNums = [...new Set(table.parts.map((p) => p.page))];
  const pagesKey = pageNums.join(",");
  const key = `${document.id}|${pagesKey}`;
  const drawn = result?.key === key ? result.pages : null;

  // Fit the pages to the pane, and again whenever the pane changes size.
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
    const nums = pagesKey.split(",").map(Number);
    void (async () => {
      try {
        const renderer = await pageRendererFor(document.id);
        const pages: Drawn[] = [];
        for (const num of nums) {
          pages.push({ num, page: await renderer.renderPage(num, width, abort.signal) });
        }
        setResult({ key, pages });
      } catch {
        if (!abort.signal.aborted) setResult({ key, pages: "failed" });
      }
    })();
    return () => abort.abort();
  }, [document.id, key, pagesKey, width]);

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
                {document.tables.flatMap((t) =>
                  t.parts.flatMap((part, k) =>
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
                  ),
                )}
              </div>
            </figure>
          ))}
        </div>
      )}
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
  box: { left: number; top: number; width: number; height: number };
  onSelect: () => void;
}) {
  const label = `Table ${table.n}${table.parts.length > 1 ? ` · part ${part + 1} of ${table.parts.length}` : ""}`;
  return (
    <button
      type="button"
      className={selected ? styles.outline : `${styles.outline} ${styles.dim}`}
      style={{
        left: `${box.left * 100}%`,
        top: `${box.top * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      }}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      title={`Show Table ${table.n}`}
      onClick={onSelect}
    >
      <span aria-hidden="true">{label}</span>
    </button>
  );
}

/** Puts a canvas made outside React into the tree. */
export function CanvasHost({ canvas }: { canvas: HTMLCanvasElement }) {
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    slot.current?.replaceChildren(canvas);
  }, [canvas]);
  return <div ref={slot} className={styles.canvas} />;
}
