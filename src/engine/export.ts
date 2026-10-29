/**
 * Export, ported from the prototype ("Export"). To add a format: extend ExportFormat, add it to
 * EXPORT_FORMATS and add its writer to WRITERS.
 *
 * Section Mode isn't wired yet (#11): `outputRows` is the seam. It returns the rows to write, with
 * the Header Row flagged, and #11 fills in As Column (a leading Section column) and As Rows
 * (Section Headers kept as their own rows). Until then the grid is written as it is, which for a
 * Table without Section Headers is identical in both modes.
 */
import type { Table } from "./workspace";

export type ExportFormat = "csv" | "tsv" | "md" | "json";

/** The formats in the order the UI offers them, with their labels. */
export const EXPORT_FORMATS: readonly { format: ExportFormat; label: string; name: string }[] = [
  { format: "csv", label: "CSV", name: "CSV" },
  { format: "tsv", label: "TSV", name: "Spreadsheet (TSV)" },
  { format: "md", label: "Markdown", name: "Markdown" },
  { format: "json", label: "JSON", name: "JSON" },
];

export const DEFAULT_EXPORT_FORMAT: ExportFormat = "csv";

export const isExportFormat = (v: unknown): v is ExportFormat =>
  EXPORT_FORMATS.some((f) => f.format === v);

type OutputRow = { cells: string[]; head?: boolean };
type Output = { table: Table; rows: OutputRow[] };

/** Seam for #11: the rows to write for the Table in the chosen Section Mode. */
function outputRows(table: Table): OutputRow[] {
  return table.grid.map((cells, r) => ({
    cells: cells.slice(),
    head: table.header && r === 0 ? true : undefined,
  }));
}

const isNum = (v: string) => /^[\s$€£¥(+\-−]*\d[\d,.\s]*%?\)?\s*$/.test(v);

/** Columns where at least 70% of the non-empty body cells are numbers. */
function outputNumericColumns({ table, rows }: Output): boolean[] {
  const body = rows.filter((r) => !r.head);
  const n = table.grid[0]?.length ?? 0;
  return Array.from({ length: n }, (_, c) => {
    const v = body.map((r) => r.cells[c]).filter(Boolean);
    return v.length > 0 && v.filter((x) => isNum(x!)).length / v.length >= 0.7;
  });
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const mdCell = (v: string) => v.replace(/\|/g, "\\|");

const WRITERS: Record<ExportFormat, (out: Output) => string> = {
  csv: ({ rows }) => rows.map((r) => r.cells.map(csvCell).join(",")).join("\n"),
  tsv: ({ rows }) =>
    rows.map((r) => r.cells.map((v) => v.replace(/\t|\n/g, " ")).join("\t")).join("\n"),
  md: (out) => {
    const { table, rows } = out;
    const first = rows[0]?.cells ?? [];
    const head = table.header ? first : first.map((_, i) => `Column ${i + 1}`);
    const body = rows.slice(table.header ? 1 : 0);
    const align = outputNumericColumns(out);
    return [
      `| ${head.map(mdCell).join(" | ")} |`,
      `| ${align.map((n) => (n ? "---:" : "---")).join(" | ")} |`,
      ...body.map((r) => `| ${r.cells.map(mdCell).join(" | ")} |`),
    ].join("\n");
  },
  json: ({ table, rows }) => {
    const keys = table.header ? rows[0]!.cells.map((k, i) => k || `column_${i + 1}`) : null;
    const obj = (cells: string[]) =>
      keys ? Object.fromEntries(keys.map((k, i) => [k, cells[i]])) : cells;
    return JSON.stringify(
      rows.slice(table.header ? 1 : 0).map((r) => obj(r.cells)),
      null,
      2,
    );
  },
};

/** The Table as text in the given format, ready for the clipboard. */
export function exportTable(table: Table, format: ExportFormat): string {
  return WRITERS[format]({ table, rows: outputRows(table) });
}

/**
 * Columns where at least 70% of the non-empty body cells are numbers, for right-aligning them.
 * Body cells exclude the Header Row and Section Headers.
 */
export function numericColumns(table: Table): boolean[] {
  const body = table.grid.filter(
    (_, r) => !(table.header && r === 0) && !table.sections.includes(r),
  );
  return Array.from({ length: table.grid[0]?.length ?? 0 }, (_, c) => {
    const v = body.map((r) => r[c]).filter(Boolean);
    return v.length > 0 && v.filter((x) => isNum(x!)).length / v.length >= 0.7;
  });
}
