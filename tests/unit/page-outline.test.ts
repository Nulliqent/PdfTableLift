// Seam B (geometry): a Table's bbox in PDF space becomes a box on the rendered page, as fractions
// of the page, so it stays aligned with the rendered text at any size the layout produces.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeAll, describe, expect, it } from "vitest";
import { outlineBox, pdfBox } from "../../src/pdf-reader/page-outline";

// A real 612 x 792 pt page, to get pdf.js's own viewports.
let page: pdfjs.PDFPageProxy;
beforeAll(async () => {
  const data = new Uint8Array(
    readFileSync(join(import.meta.dirname, "..", "fixtures", "embedded-bold.pdf")),
  );
  const doc = await pdfjs.getDocument({ data, verbosity: pdfjs.VerbosityLevel.ERRORS }).promise;
  page = await doc.getPage(1);
});
const letter = (scale: number, rotation = 0) => page.getViewport({ scale, rotation });

describe("outlineBox", () => {
  it("flips PDF y-up coordinates into fractions of the page from its top left", () => {
    const box = outlineBox(letter(1), [72, 600, 300, 700]);

    expect(box.left).toBeCloseTo(72 / 612);
    expect(box.width).toBeCloseTo(228 / 612);
    expect(box.top).toBeCloseTo((792 - 700) / 792);
    expect(box.height).toBeCloseTo(100 / 792);
  });

  it("gives the same fractions at any render scale", () => {
    const a = outlineBox(letter(1), [72, 600, 300, 700]);
    const b = outlineBox(letter(1.7), [72, 600, 300, 700]);

    expect(b.left).toBeCloseTo(a.left);
    expect(b.top).toBeCloseTo(a.top);
    expect(b.width).toBeCloseTo(a.width);
    expect(b.height).toBeCloseTo(a.height);
  });

  it("follows a rotated page", () => {
    const box = outlineBox(letter(1, 90), [0, 0, 612, 100]);

    // Rotated 90 degrees the page is 792 wide and 612 tall, and the bottom strip is the left one.
    expect(box.left).toBeCloseTo(0);
    expect(box.width).toBeCloseTo(100 / 792);
    expect(box.height).toBeCloseTo(1);
  });
});

describe("pdfBox", () => {
  it("turns a box dragged on the page back into PDF coordinates, y up", () => {
    const dragged = { left: 72 / 612, top: 92 / 792, width: 228 / 612, height: 100 / 792 };

    const bbox = pdfBox(letter(1.3), dragged);

    expect(bbox[0]).toBeCloseTo(72);
    expect(bbox[1]).toBeCloseTo(600);
    expect(bbox[2]).toBeCloseTo(300);
    expect(bbox[3]).toBeCloseTo(700);
  });

  it("is the inverse of outlineBox, on a rotated page too", () => {
    for (const rotation of [0, 90, 180, 270]) {
      const bbox = [72, 600, 300, 700] as const;

      const back = pdfBox(letter(1, rotation), outlineBox(letter(1, rotation), bbox));

      back.forEach((v, i) => expect(v).toBeCloseTo(bbox[i]!));
    }
  });
});
