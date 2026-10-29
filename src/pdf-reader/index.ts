/**
 * PDF Reader: the only module that touches pdf.js.
 * Public interface: `readDocument(bytes) → Promise<PageText[] | ReadError>`.
 *
 * This file wires the reader to pdf.js's standard browser build, with its worker and data files
 * served by the app itself (no CDN). Node tests wire the legacy build instead, through
 * `createReadDocument` in read-document.ts.
 */
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createReadDocument } from "./read-document";
import { createOpenPages } from "./render-pages";

export type { PageText, TextItem } from "../shared/page-text";
export type { ReadDocument, ReadError } from "./read-document";
export type { OpenPages, OutlineBox, PageRenderer, PdfBox, RenderedPage } from "./render-pages";

GlobalWorkerOptions.workerSrc = workerUrl;

// Copied into the build by the pdfjsAssets plugin in vite.config.ts. Each URL needs its
// trailing slash.
const asset = (dir: string) =>
  new URL(`${import.meta.env.BASE_URL}pdfjs/${dir}/`, location.href).href;

const options = { wasmUrl: asset("wasm"), standardFontDataUrl: asset("standard_fonts") };

export const readDocument = createReadDocument({ getDocument }, options);

/** Opens a Document's bytes again for drawing pages (the Source page). */
export const openPages = createOpenPages({ getDocument }, options);
