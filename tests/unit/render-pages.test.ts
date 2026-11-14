// Seam B: page rendering for the Source page and Region page. pdf.js is faked; only the
// abort contract of `renderPage` is under test.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenPages } from "../../src/pdf-reader/render-pages";

afterEach(() => vi.unstubAllGlobals());

function fakePages() {
  vi.stubGlobal("document", { createElement: () => ({ style: {} }) });
  const render = vi.fn(() => ({ promise: new Promise(() => undefined), cancel: vi.fn() }));
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 150 * scale }),
    render,
  };
  const pdfjs = {
    getDocument: () => ({
      promise: Promise.resolve({ getPage: () => Promise.resolve(page) }),
      destroy: () => Promise.resolve(),
    }),
  };
  return { open: createOpenPages(pdfjs as never), render };
}

describe("renderPage", () => {
  it("rejects with an AbortError, without drawing, when the signal is already aborted", async () => {
    const { open, render } = fakePages();
    const pages = await open(new Uint8Array([1]));

    const controller = new AbortController();
    controller.abort();

    await expect(pages.renderPage(1, 100, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(render).not.toHaveBeenCalled();
  });
});
