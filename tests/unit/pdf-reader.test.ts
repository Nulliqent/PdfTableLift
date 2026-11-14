// Seam B: the PDF Reader. Fixture PDF bytes in, PageText (or a typed ReadError) out.
// The golden comparison of every fixture's text items is in golden.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createReadDocument } from "../../src/pdf-reader/read-document";
import { readDocument } from "./support/node-reader";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "..", "fixtures", name)));

async function readPages(name: string) {
  const result = await readDocument(fixture(name));
  if (typeof result === "string") throw new Error(`expected pages, got the ReadError ${result}`);
  return result;
}

describe("readDocument", () => {
  it("returns each page's size and text items with their positions", async () => {
    const pages = await readPages("embedded-bold.pdf");

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ num: 1, w: 612, h: 792 });
    expect(pages[0]!.items.slice(0, 2)).toEqual([
      { str: "Branch staffing", x: 72, y: 740, w: expect.closeTo(102.536, 3), h: 14, bold: true },
      { str: "Branch", x: 72, y: 710, w: expect.closeTo(28.647, 3), h: 9, bold: true },
    ]);
  });

  it("detects bold from an embedded font, not only from the standard 14", async () => {
    const pages = await readPages("embedded-bold.pdf");

    const bold = (str: string) => pages[0]!.items.find((i) => i.str === str)?.bold;
    expect(bold("Budget")).toBe(true); // Lato Bold, embedded as a subset
    expect(bold("Leeds")).toBe(false); // Helvetica
  });

  it("leaves the caller's bytes usable after reading", async () => {
    const bytes = fixture("embedded-bold.pdf");
    await readDocument(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("reports a scanned PDF (no text on any page) as no-text-layer", async () => {
    expect(await readDocument(fixture("image-only.pdf"))).toBe("no-text-layer");
  });

  it("reports a password-protected PDF as password-protected", async () => {
    expect(await readDocument(fixture("encrypted.pdf"))).toBe("password-protected");
  });

  it("reports a file that is not a PDF as not-pdf", async () => {
    expect(await readDocument(fixture("not-a-pdf.pdf"))).toBe("not-pdf");
  });

  describe("when pdf.js fails partway", () => {
    const readWith = async (open: () => Promise<unknown>) => {
      const destroy = vi.fn(() => Promise.resolve());
      const read = createReadDocument({
        getDocument: () => ({ promise: open(), destroy }) as never,
      });
      return { result: await read(new Uint8Array([1])), destroy };
    };

    it("reports a page that cannot be read as not-pdf and still closes the PDF", async () => {
      const { result, destroy } = await readWith(() =>
        Promise.resolve({
          numPages: 1,
          getPage: () => Promise.reject(new Error("Invalid page")),
        }),
      );
      expect(result).toBe("not-pdf");
      expect(destroy).toHaveBeenCalled();
    });

    it("destroys the loading task when opening the PDF is rejected", async () => {
      const { result, destroy } = await readWith(() => Promise.reject(new Error("bad")));
      expect(result).toBe("not-pdf");
      expect(destroy).toHaveBeenCalled();
    });
  });
});
