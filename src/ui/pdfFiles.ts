/** Splits chosen or dropped files into the PDFs and a count of the others. */
export function splitPdfs(files: File[]): { pdfs: File[]; skipped: number } {
  const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  return { pdfs, skipped: files.length - pdfs.length };
}
