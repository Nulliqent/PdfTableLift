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

  it("gives a page's size and origin in the frame of its text items, /Rotate and CropBox aside", async () => {
    const [rotated, cropped] = await readPages("page-frames.pdf");

    // A quarter turn changes how the page is shown, not the user space its text is in.
    expect(rotated).toMatchObject({ num: 1, w: 612, h: 792 });
    expect(rotated!.origin).toBeUndefined();
    expect(rotated!.items[0]).toMatchObject({ str: "Item", x: 72, y: 700 });
    // Cropped to [100, 200, 512, 692]: the page starts at (100, 200), where the items are.
    expect(cropped).toMatchObject({ num: 2, w: 412, h: 492, origin: [100, 200] });
    expect(cropped!.items[0]).toMatchObject({ str: "Item", x: 130, y: 640 });
  });

  it("reads the drawing's titles, Rows, note and title block into page text", async () => {
    const [sheet1, sheet2] = await readPages("parts-list-drawing.pdf");
    const strs = (p: typeof sheet1, from: number, to: number) =>
      p!.items.filter((i) => i.y >= from && i.y <= to).map((i) => i.str);

    // Page 1: two-line titles in a band above the Rows (PART/NUMBER over one column), a stray line,
    // items 1 to 3, a note across two lines, items 4 to 6, then the title block.
    expect(sheet1).toMatchObject({ num: 1, w: 612, h: 792 });
    expect(strs(sheet1, 700, 700)).toEqual(["PART", "MATERIAL"]);
    expect(strs(sheet1, 688, 688)).toEqual(["ITEM", "NUMBER", "DESCRIPTION", "QTY", "SPEC"]);
    expect(strs(sheet1, 664, 664)).toEqual(["ALL DIMENSIONS IN MM"]);
    expect(strs(sheet1, 640, 640)).toEqual(["1", "BK-1001", "BASE PLATE", "1", "STEEL S235"]);
    expect(strs(sheet1, 590, 590)).toEqual(["NOTE 1. DEBURR ALL EDGES AND"]);
    expect(strs(sheet1, 579, 579)).toEqual(["BREAK SHARP CORNERS 0.5 MAX."]);
    expect(strs(sheet1, 528, 528)).toEqual(["6", "FS-2012", "LOCK NUT M8", "8", "STAINLESS"]);
    expect(strs(sheet1, 416, 458)).toEqual([
      "TITLE",
      "BRACKET ASSEMBLY",
      "DWG NO",
      "TL-0417",
      "SCALE",
      "1:2",
      "SHEET",
      "1 OF 2",
    ]);
    // Every title sits above its column's Rows: PART NUMBER, at the Rows' x.
    const x = (page: typeof sheet1, str: string) => page!.items.find((i) => i.str === str)!.x;
    expect(x(sheet1, "NUMBER")).toBe(x(sheet1, "BK-1001"));
    expect(x(sheet1, "DESCRIPTION")).toBe(x(sheet1, "BASE PLATE"));

    // Page 2: items 5 down to 1 with the note between 3 and 2, then the titles beside the title block.
    expect(sheet2).toMatchObject({ num: 2, w: 612, h: 792 });
    expect(strs(sheet2, 700, 700)).toEqual(["5", "CV-3004", "COVER PANEL", "1", "ALUMINIUM"]);
    expect(strs(sheet2, 639, 650)).toEqual([
      "NOTE 1. DEBURR ALL EDGES AND",
      "BREAK SHARP CORNERS 0.5 MAX.",
    ]);
    expect(strs(sheet2, 602, 602)).toEqual(["1", "CV-3000", "MOUNT FRAME", "1", "STEEL S235"]);
    const below = sheet2!.items.filter((i) => i.y < 600 && i.x < 400).map((i) => i.str);
    expect(below).toEqual(expect.arrayContaining(["PART", "NUMBER", "DESCRIPTION", "QTY", "SPEC"]));
    expect(strs(sheet2, 524, 566).filter((s) => s === "2 OF 2")).toHaveLength(1);
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

    it("waits for a font that never resolves once per Document, not once per page and font", async () => {
      vi.useFakeTimers();
      try {
        // Two pages, each using two fonts that pdf.js never delivers, and one bold font it has.
        const text = (str: string, y: number, fontName: string) => ({
          str,
          transform: [9, 0, 0, 9, 72, y],
          width: 20,
          height: 9,
          fontName,
        });
        const commonObjs = {
          has: (name: string) => name === "bold",
          // Called with a callback for a font still loading; this fake never calls it back.
          get: (name: string) => (name === "bold" ? { name: "ABCDEF+Lato-Bold" } : undefined),
        };
        const page = {
          view: [0, 0, 612, 792],
          commonObjs,
          getTextContent: () =>
            Promise.resolve({
              items: [
                text("Head", 720, "bold"),
                text("one", 700, "lost1"),
                text("two", 680, "lost2"),
              ],
            }),
          getOperatorList: () => Promise.resolve({}),
        };
        const read = createReadDocument({
          getDocument: () =>
            ({
              promise: Promise.resolve({ numPages: 2, getPage: () => Promise.resolve(page) }),
              destroy: () => Promise.resolve(),
            }) as never,
        });

        let result: Awaited<ReturnType<typeof read>> | undefined;
        void read(new Uint8Array([1])).then((r) => (result = r));
        await vi.advanceTimersByTimeAsync(2000);

        expect(result).toHaveLength(2);
        const pages = result as Exclude<typeof result, string | undefined>;
        expect(pages.map((p) => p.items.map((i) => i.bold))).toEqual([
          [true, false, false],
          [true, false, false],
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("destroys the loading task when opening the PDF is rejected", async () => {
      const { result, destroy } = await readWith(() => Promise.reject(new Error("bad")));
      expect(result).toBe("not-pdf");
      expect(destroy).toHaveBeenCalled();
    });
  });
});
