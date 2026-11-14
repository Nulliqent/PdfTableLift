/**
 * What Source Page and Region selection share to draw a Document's pages: the page width that
 * fits the pane, the abortable render and the frame that places a box over a page. The canvas
 * slot is the CanvasHost component.
 */
import { useEffect, useState, type RefObject } from "react";
import type { OutlineBox, RenderedPage } from "../pdf-reader";
import { pageRendererFor } from "./documentSources";

/** The widest a page is drawn, in CSS pixels. */
const MAX_PAGE_WIDTH = 900;
/** The least a page is drawn at, so a very narrow pane still shows something. */
const MIN_PAGE_WIDTH = 240;
/** Horizontal padding of the card around the pages. */
const GUTTER = 16;

/** The width to draw pages at inside `host`, kept up to date as the pane changes size. */
export function usePageWidth(host: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
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
  }, [host]);
  return width;
}

export type DrawnPage = { num: number; page: RenderedPage };

/**
 * The Document's pages drawn at `width`: null while drawing, "failed" when a page couldn't be
 * drawn. While the pane is resized the last pages stay up (anything placed on them is in
 * fractions, so it still lines up) until the redraw lands; other pages start from null.
 */
export function useDrawnPages(
  documentId: string,
  pageNums: number[],
  width: number,
): DrawnPage[] | "failed" | null {
  const nums = pageNums.join(",");
  const key = `${documentId}|${nums}`;
  const [result, setResult] = useState<{ key: string; pages: DrawnPage[] | "failed" } | null>(null);
  useEffect(() => {
    if (!width) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const renderer = await pageRendererFor(documentId);
        const pages: DrawnPage[] = [];
        for (const num of nums.split(",").map(Number)) {
          pages.push({ num, page: await renderer.renderPage(num, width, abort.signal) });
        }
        // A render that finished after a newer one started must not overwrite its result.
        if (!abort.signal.aborted) setResult({ key, pages });
      } catch {
        if (!abort.signal.aborted) setResult({ key, pages: "failed" });
      }
    })();
    return () => abort.abort();
  }, [documentId, key, nums, width]);
  return result?.key === key ? result.pages : null;
}

/** The style that places a box given in fractions of the page over it. */
export const frame = (box: OutlineBox) => ({
  left: `${box.left * 100}%`,
  top: `${box.top * 100}%`,
  width: `${box.width * 100}%`,
  height: `${box.height * 100}%`,
});
