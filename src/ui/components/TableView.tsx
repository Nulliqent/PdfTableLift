import { numericColumns, type Table } from "../../engine";
import styles from "./TableView.module.css";

type TableViewProps = {
  table: Table;
  /** A cell was corrected; `row` and `col` are grid coordinates (the Header Row is row 0). */
  onEdit: (row: number, col: number, value: string) => void;
};

/**
 * The Table's grid, with the Header Row as column headers and numbered body rows. Every cell is
 * editable in place; Enter or leaving the cell commits it. Numeric columns are right-aligned.
 * Section Header rows arrive with #11.
 */
export function TableView({ table, onEdit }: TableViewProps) {
  const numeric = numericColumns(table);
  const first = table.header ? 1 : 0;
  const head = table.header ? table.grid[0]! : null;
  const body = table.grid.slice(first);
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        {head && (
          <thead>
            <tr>
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
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              <td className={styles.idx}>{r + 1}</td>
              {row.map((v, c) => (
                <Cell
                  key={c}
                  value={v}
                  numeric={numeric[c]}
                  onEdit={(value) => onEdit(r + first, c, value)}
                />
              ))}
            </tr>
          ))}
        </tbody>
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
