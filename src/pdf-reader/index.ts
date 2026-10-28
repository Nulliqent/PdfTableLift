/**
 * PDF Reader: the only module that touches pdf.js.
 * Public interface (built in a later ticket): `readDocument(bytes) → Promise<PageText[] | ReadError>`.
 */
export type { PageText, TextItem } from "../shared/page-text";

export type ReadError = "not-pdf" | "password-protected" | "no-text-layer";
