/**
 * Export, ported from the prototype ("Export"). To add a format: extend ExportFormat, add it to
 * EXPORT_FORMATS and add its writer to WRITERS.
 *
 * Section Mode (#11) is the third argument of `exportTable`.
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

/** Where Section Headers go: a leading Section column on every row, or rows of their own. */
export type SectionMode = "column" | "rows";

export const DEFAULT_SECTION_MODE: SectionMode = "column";

export const isSectionMode = (v: unknown): v is SectionMode => v === "column" || v === "rows";

type OutputRow = { cells: string[]; head?: boolean; section?: boolean };
type Output = { table: Table; rows: OutputRow[]; asColumn: boolean };

/** Whether a grid row is a Section Header (the Header Row never is). */
export const isSectionHeader = (table: Table, row: number) =>
  table.sections.includes(row) && !(table.header && row === 0);

export const hasSectionHeaders = (table: Table) =>
  table.sections.some((r) => isSectionHeader(table, r));

/** Whether the Table is written with a leading Section column in this Section Mode. */
export const usesSectionColumn = (table: Table, mode: SectionMode) =>
  mode === "column" && hasSectionHeaders(table);

/**
 * The rows to write, with the Header Row flagged. As Column moves each Section Header into a
 * leading Section column of the rows below it; As Rows keeps the Section Headers as rows.
 */
function outputRows(table: Table, asColumn: boolean): OutputRow[] {
  const out: OutputRow[] = [];
  let current = "";
  table.grid.forEach((row, r) => {
    if (table.header && r === 0) {
      out.push({ cells: asColumn ? ["Section", ...row] : row.slice(), head: true });
    } else if (isSectionHeader(table, r)) {
      current = row[0] ?? "";
      if (!asColumn) out.push({ cells: row.slice(), section: true });
    } else out.push({ cells: asColumn ? [current, ...row] : row.slice() });
  });
  return out;
}

/** Header names as object keys: empty ones become column_N, repeats get _2, _3, ... suffixes. */
function uniqueKeys(headers: string[]): string[] {
  const seen = new Set<string>();
  return headers.map((h, i) => {
    const base = h || `column_${i + 1}`;
    let key = base;
    for (let n = 2; seen.has(key); n++) key = `${base}_${n}`;
    seen.add(key);
    return key;
  });
}

const isNum = (v: string) => /^[\s$€£¥(+\-−]*\d[\d,.\s]*%?\)?\s*$/.test(v);

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const mdCell = (v: string) => v.replace(/\|/g, "\\|");

const WRITERS: Record<ExportFormat, (out: Output) => string> = {
  csv: ({ rows }) => rows.map((r) => r.cells.map(csvCell).join(",")).join("\n"),
  tsv: ({ rows }) =>
    rows.map((r) => r.cells.map((v) => v.replace(/\t|\n/g, " ")).join("\t")).join("\n"),
  md: ({ table, rows, asColumn }) => {
    const first = rows[0]?.cells ?? [];
    const head = table.header ? first : first.map((_, i) => `Column ${i + 1}`);
    const body = rows.slice(table.header ? 1 : 0);
    const numeric = numericColumns(table);
    const align = asColumn ? [false, ...numeric] : numeric;
    return [
      `| ${head.map(mdCell).join(" | ")} |`,
      `| ${align.map((n) => (n ? "---:" : "---")).join(" | ")} |`,
      ...body.map((r) =>
        r.section
          ? `| **${mdCell(r.cells[0]!)}** |${" |".repeat(r.cells.length - 1)}`
          : `| ${r.cells.map(mdCell).join(" | ")} |`,
      ),
    ].join("\n");
  },
  json: ({ table, rows, asColumn }) => {
    const keys = table.header ? uniqueKeys(rows[0]!.cells) : null;
    const obj = (cells: string[]) =>
      keys ? Object.fromEntries(keys.map((k, i) => [k, cells[i]])) : cells;
    const body = rows.slice(table.header ? 1 : 0);
    if (!hasSectionHeaders(table) || asColumn)
      return JSON.stringify(
        body.map((r) => obj(r.cells)),
        null,
        2,
      );
    // As Rows: grouped by section.
    const groups: { section: string | null; rows: unknown[] }[] = [];
    let group: (typeof groups)[number] | null = null;
    for (const r of body) {
      if (r.section) {
        group = { section: r.cells[0]!, rows: [] };
        groups.push(group);
        continue;
      }
      if (!group) {
        group = { section: null, rows: [] };
        groups.push(group);
      }
      group.rows.push(obj(r.cells));
    }
    return JSON.stringify(groups, null, 2);
  },
};

/** The Table as text in the given format, ready for the clipboard. */
export function exportTable(
  table: Table,
  format: ExportFormat,
  sectionMode: SectionMode = DEFAULT_SECTION_MODE,
): string {
  const asColumn = usesSectionColumn(table, sectionMode);
  return WRITERS[format]({ table, rows: outputRows(table, asColumn), asColumn });
}

/**
 * Columns where at least 70% of the non-empty body cells are numbers, for right-aligning them.
 * Body cells exclude the Header Row and Section Headers.
 */
export function numericColumns(table: Table): boolean[] {
  const body = table.grid.filter(
    (_, r) => !(table.header && r === 0) && !isSectionHeader(table, r),
  );
  return Array.from({ length: table.grid[0]?.length ?? 0 }, (_, c) => {
    const v = body.map((r) => r[c]).filter(Boolean);
    return v.length > 0 && v.filter((x) => isNum(x!)).length / v.length >= 0.7;
  });
}
