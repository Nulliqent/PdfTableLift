import {
  isSectionHeader,
  numericColumns,
  usesSectionColumn,
  type SectionMode,
  type Table,
} from "../../engine";
import styles from "./TableView.module.css";

type TableViewProps = {
  table: Table;
  /** A cell was corrected; `row` and `col` are grid coordinates (the Header Row is row 0). */
  onEdit: (row: number, col: number, value: string) => void;
  sectionMode: SectionMode;
  /** A row number was clicked; `row` is a grid row. */
  onToggleSection: (row: number) => void;
};

/**
 * The Table's grid, with the Header Row as column headers and numbered body rows. Every cell is
 * editable in place; Enter or leaving the cell commits it. Numeric columns are right-aligned.
 * Section Header rows are shaded; in As Column mode they appear as a Section column instead. The
 * row number toggles a row as a Section Header.
 */
export function TableView({ table, onEdit, sectionMode, onToggleSection }: TableViewProps) {
  const numeric = numericColumns(table);
  const first = table.header ? 1 : 0;
  const head = table.header ? table.grid[0]! : null;
  const asColumn = usesSectionColumn(table, sectionMode);
  const width = table.grid[0]?.length ?? 0;
  let current = "";
  let k = 0;
  const rows: React.ReactNode[] = [];
  table.grid.forEach((row, r) => {
    if (r < first) return;
    const section = isSectionHeader(table, r);
    const idx = (
      <td className={styles.idx}>
        <button
          type="button"
          className={styles.idxBtn}
          title={section ? "Treat as a data row" : "Mark as section header"}
          aria-label={
            section
              ? "Row is a section header. Treat as a data row"
              : `Row ${k + 1}. Mark as section header`
          }
          onClick={() => onToggleSection(r)}
        >
          {section ? "§" : k + 1}
        </button>
      </td>
    );
    if (section) {
      current = row[0] ?? "";
      if (asColumn) return; // Shown in the Section column instead.
      rows.push(
        <tr key={r} className={styles.section}>
          {idx}
          <Cell value={row[0] ?? ""} onEdit={(value) => onEdit(r, 0, value)} />
          {width > 1 && <td colSpan={width - 1} className={styles.secFill} />}
        </tr>,
      );
      return;
    }
    k++;
    rows.push(
      <tr key={r}>
        {idx}
        {asColumn && (
          <td className={styles.secCol}>{current || <span className={styles.none}>—</span>}</td>
        )}
        {row.map((v, c) => (
          <Cell key={c} value={v} numeric={numeric[c]} onEdit={(value) => onEdit(r, c, value)} />
        ))}
      </tr>,
    );
  });
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        {head && (
          <thead>
            <tr>
              <th className={styles.idx} aria-hidden="true" />
              {asColumn && <th className={styles.secColHead}>Section</th>}
              {head.map((v, c) => (
                <Cell
                  key={c}
                  header
                  value={v}
                  numeric={numeric[c]}
                  onEdit={(value) => onEdit(0, c, value)}
                />
              ))}
            </tr>
          </thead>
        )}
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

type CellProps = {
  value: string;
  numeric?: boolean;
  header?: boolean;
  onEdit: (value: string) => void;
};

/** One editable cell. Keyed by its text so a committed edit remounts it from the new value. */
function Cell({ value, numeric, header, onEdit }: CellProps) {
  const Tag = header ? "th" : "td";
  const classes = [styles.cell, value ? null : styles.empty, numeric ? styles.num : null]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag
      key={value}
      className={classes}
      scope={header ? "col" : undefined}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const text = e.currentTarget.textContent ?? "";
        if (text.replace(/\s+/g, " ").trim() === value) {
          e.currentTarget.textContent = value; // drop stray whitespace from the DOM
        } else onEdit(text);
      }}
    >
      {value}
    </Tag>
  );
}
