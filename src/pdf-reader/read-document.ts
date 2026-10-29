/**
 * The PDF Reader's logic, independent of which pdf.js build runs it: the browser wires in the
 * standard build with a self-hosted worker (index.ts), Node tests wire in the legacy build.
 */
import type {
  DocumentInitParameters,
  PDFPageProxy,
  TextItem as PdfTextItem,
} from "pdfjs-dist/types/src/display/api";
import type { PageText, TextItem } from "../shared/page-text";
import type { ReadError } from "../shared/read-error";

export type { ReadError };

/** The part of the pdf.js module the reader uses. */
export type PdfJs = {
  getDocument: (params: DocumentInitParameters) => {
    promise: Promise<unknown>;
    destroy(): Promise<void>;
  };
};

/** Extra getDocument options from the wiring: worker data URLs, verbosity. */
export type ReaderOptions = Omit<DocumentInitParameters, "data" | "fontExtraProperties">;

export type ReadDocument = (bytes: Uint8Array) => Promise<PageText[] | ReadError>;

type PdfDocument = {
  numPages: number;
  getPage(n: number): Promise<PDFPageProxy>;
};

const BOLD_NAME = /bold|black|heavy|semibold|demi/i;
/** How long to wait for pdf.js to resolve a font object before treating it as not bold. */
const FONT_TIMEOUT_MS = 2000;

export function createReadDocument(pdfjs: PdfJs, options: ReaderOptions = {}): ReadDocument {
  return async (bytes) => {
    // pdf.js transfers (detaches) the buffer it is given, so hand it a copy.
    const task = pdfjs.getDocument({
      ...options,
      data: bytes.slice(),
      // Without it, pdf.js 6 drops the font name, and embedded bold fonts read as regular.
      fontExtraProperties: true,
    });
    try {
      const doc = (await task.promise) as PdfDocument;
      const pages: PageText[] = [];
      for (let n = 1; n <= doc.numPages; n++) pages.push(await readPage(await doc.getPage(n), n));
      return pages.some((p) => p.items.length) ? pages : "no-text-layer";
    } catch (err) {
      // A page pdf.js cannot parse means the file is damaged: the same answer as a file that
      // is not a PDF at all, since the user cannot act on the difference.
      return (err as { name?: string })?.name === "PasswordException"
        ? "password-protected"
        : "not-pdf";
    } finally {
      await task.destroy().catch(() => undefined);
    }
  };
}

async function readPage(page: PDFPageProxy, num: number): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  // Font objects land in commonObjs while the operator list is built.
  try {
    await page.getOperatorList();
  } catch {
    // A page whose drawing fails can still have readable text.
  }
  const boldByFont = new Map<string, Promise<boolean>>();
  const isBold = (fontName: string) => {
    let v = boldByFont.get(fontName);
    if (!v) boldByFont.set(fontName, (v = fontIsBold(page, fontName)));
    return v;
  };

  const items: TextItem[] = [];
  for (const it of content.items) {
    if (!("str" in it)) continue;
    const item = it as PdfTextItem;
    if (!item.str || !item.str.trim()) continue;
    const [, b, c, d, x, y] = item.transform as number[];
    if (Math.abs(b!) > 0.01 || Math.abs(c!) > 0.01) continue; // rotated text
    const h = Math.abs(d!) || item.height || 10;
    const bold = await isBold(item.fontName);
    if (/\S\s{3,}\S/.test(item.str)) {
      // US-14: some PDFs set a whole row as one string with runs of spaces between columns.
      const cw = item.width / item.str.length;
      for (const m of item.str.matchAll(/\S+(?:\s{1,2}\S+)*/g)) {
        items.push({ str: m[0], x: x! + m.index * cw, y: y!, w: m[0].length * cw, h, bold });
      }
    } else items.push({ str: item.str, x: x!, y: y!, w: item.width, h, bold });
  }
  return { num, w: viewport.width, h: viewport.height, items };
}

type FontObject = { bold?: boolean; black?: boolean; name?: string };

/** Bold from pdf.js's font object: its flags, or its PDF font name (e.g. "CZZZZZ+Lato-Bold"). */
function fontIsBold(page: PDFPageProxy, fontName: string): Promise<boolean> {
  const fromFont = (fo: FontObject | null | undefined) =>
    !!fo && !!(fo.bold || fo.black || BOLD_NAME.test(fo.name ?? ""));
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), FONT_TIMEOUT_MS);
    const done = (fo: FontObject | null | undefined) => {
      clearTimeout(timer);
      resolve(fromFont(fo));
    };
    try {
      if (page.commonObjs.has(fontName)) done(page.commonObjs.get(fontName));
      // In the browser the font may still be loading; get() with a callback waits for it.
      else page.commonObjs.get(fontName, done);
    } catch {
      done(null);
    }
  });
}
