/**
 * Export, ported from the prototype ("Export"). To add a format: extend ExportFormat and add its
 * writer to WRITERS.
 *
 * Section Mode isn't wired yet (#11): rows are written as they are in the grid, which is the
 * prototype's "As Rows" output. For a Table without Section Headers both modes are identical.
 */
import type { Table } from "./workspace";

export type ExportFormat = "csv";

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const WRITERS: Record<ExportFormat, (rows: string[][]) => string> = {
  csv: (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n"),
};

/** The Table as text in the given format, ready for the clipboard. */
export function exportTable(table: Table, format: ExportFormat): string {
  return WRITERS[format](table.grid);
}
