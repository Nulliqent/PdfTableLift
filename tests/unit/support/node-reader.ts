// The PDF Reader wired to pdf.js's legacy build, the one that runs in Node: the standard build
// needs Math.sumPrecise, which Node lacks. The browser wiring is src/pdf-reader/index.ts.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createReadDocument } from "../../../src/pdf-reader/read-document";

export const readDocument = createReadDocument(pdfjs, { verbosity: pdfjs.VerbosityLevel.ERRORS });
