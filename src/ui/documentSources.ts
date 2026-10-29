/**
 * Where a Document's PDF can be reached again after it was read. The workspace reducer is pure
 * and keeps no bytes, so the UI registers a loader per Document id when the Document arrives and
 * page rendering (the Source page) asks for a page renderer by id.
 *
 * A loader, not the bytes, so a File costs no memory until a Source page is shown.
 */
import type { PageRenderer } from "../pdf-reader";

type Load = () => Promise<Uint8Array>;

const loaders = new Map<string, Load>();
const renderers = new Map<string, Promise<PageRenderer>>();

/** Remembers how to get the Document's PDF bytes. Call it when the Document is added. */
export function registerSource(documentId: string, load: Load): void {
  loaders.set(documentId, load);
}

/** The Document's page renderer, opened on first use and kept for the Document's lifetime. */
export function pageRendererFor(documentId: string): Promise<PageRenderer> {
  let renderer = renderers.get(documentId);
  if (!renderer) {
    const load = loaders.get(documentId);
    if (!load) return Promise.reject(new Error(`No source registered for ${documentId}`));
    renderer = (async () => {
      // pdf.js is large, so it loads with the first Document or Source page, not with the app.
      const { openPages } = await import("../pdf-reader");
      return openPages(await load());
    })();
    // A failed open is retried the next time a Source page is shown.
    renderer.catch(() => renderers.delete(documentId));
    renderers.set(documentId, renderer);
  }
  return renderer;
}

/** Releases the Document's PDF. Call it when the Document is removed. */
export async function releaseSource(documentId: string): Promise<void> {
  loaders.delete(documentId);
  const renderer = renderers.get(documentId);
  renderers.delete(documentId);
  await (await renderer?.catch(() => undefined))?.destroy();
}
