/** Why a Document could not be read. The PDF Reader returns it; the Engine keeps it on the Document. */
export type ReadError = "not-pdf" | "password-protected" | "no-text-layer";

/** What the user is told for each ReadError. */
export const READ_ERROR_MESSAGES: Record<ReadError, string> = {
  "no-text-layer": "No text found. This looks like a scanned PDF, which needs OCR first.",
  "password-protected": "This PDF is password-protected. Remove the password and try again.",
  "not-pdf": "This file couldn't be read as a PDF.",
};
