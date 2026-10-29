/**
 * Page rendering for the Source page. `readDocument` returns only text and closes the PDF, so
 * rendering opens the bytes again: `openPages(bytes)` keeps the pdf.js document alive until
 * `destroy()`.
 */
import type { DocumentInitParameters, PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { outlineBox, type OutlineBox, type PdfBox } from "./page-outline";
import type { PdfJs, ReaderOptions } from "./read-document";

export type { OutlineBox, PdfBox } from "./page-outline";

/** One page drawn to a canvas. */
export type RenderedPage = {
  /** Backing store at device resolution; its CSS width is `width` px. */
  canvas: HTMLCanvasElement;
  /** CSS pixel size of the page as drawn. */
  width: number;
  height: number;
  /** Where a bbox in PDF space lies on this page, as fractions of its width and height. */
  locate(bbox: PdfBox): OutlineBox;
};

export type PageRenderer = {
  /** Draws a page at `width` CSS pixels wide. Rejects with an AbortError if `signal` aborts. */
  renderPage(num: number, width: number, signal?: AbortSignal): Promise<RenderedPage>;
  destroy(): Promise<void>;
};

export type OpenPages = (bytes: Uint8Array) => Promise<PageRenderer>;

type PdfDocument = {
  getPage(n: number): Promise<PDFPageProxy>;
  loadingTask: { destroy(): Promise<void> };
};

/** Sharper than 1x on high-density screens, capped so a big page stays cheap. */
const MAX_PIXEL_RATIO = 2;

export function createOpenPages(pdfjs: PdfJs, options: ReaderOptions = {}): OpenPages {
  return async (bytes) => {
    // pdf.js transfers (detaches) the buffer it is given, so hand it a copy.
    const params: DocumentInitParameters = { ...options, data: bytes.slice() };
    const doc = (await pdfjs.getDocument(params).promise) as PdfDocument;
    return {
      async renderPage(num, width, signal) {
        const page = await doc.getPage(num);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / base.width });
        const ratio = Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        const render = page.render({
          canvas,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        const cancel = () => render.cancel();
        signal?.addEventListener("abort", cancel);
        try {
          await render.promise;
        } catch (err) {
          if (signal?.aborted) throw new DOMException("Render aborted", "AbortError");
          throw err;
        } finally {
          signal?.removeEventListener("abort", cancel);
        }
        return {
          canvas,
          width: viewport.width,
          height: viewport.height,
          locate: (bbox) => outlineBox(viewport, bbox),
        };
      },
      destroy: () => doc.loadingTask.destroy(),
    };
  };
}
