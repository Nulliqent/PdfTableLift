import { useLayoutEffect, useRef, useState } from "react";
import {
  isSectionHeader,
  numericColumns,
  usesSectionColumn,
  type SectionMode,
  type Table,
} from "../../engine";
import { RowMenu, type RowMenuItem } from "./RowMenu";
import styles from "./TableView.module.css";

type TableViewProps = {
  table: Table;
  /** A cell was corrected; `row` and `col` are grid coordinates (the Header Row is row 0). */
  onEdit: (row: number, col: number, value: string) => void;
  sectionMode: SectionMode;
  /** Mark or Unmark Section Header was chosen from a row's menu; `row` is a grid row. */
  onToggleSection: (row: number) => void;
  /** Combine with Row above / below was chosen from a row's menu; `row` is a grid row. */
  onCombine: (row: number, direction: "above" | "below") => void;
};

/**
 * The Table's grid, with the Header Row as column headers and numbered body rows. Every cell is
 * editable in place; Enter or leaving the cell commits it. Numeric columns are right-aligned.
 * Section Header rows are shaded; in As Column mode they appear as a Section column instead. The
 * row number opens the row's menu: Mark or Unmark Section Header, and Combine with the grid row
 * above (the Header Row included) or below.
 */
export function TableView({
  table,
  onEdit,
  sectionMode,
  onToggleSection,
  onCombine,
}: TableViewProps) {
  const [menu, setMenu] = useState<{ row: number; anchor: HTMLButtonElement } | null>(null);
  /** The press began on the row number of the open menu: that click only closes the menu. */
  const pressedOpen = useRef(false);
  const tableEl = useRef<HTMLTableElement>(null);
  /** The grid row whose row number gets focus back once the menu's action has rendered. */
  const refocus = useRef<number | null>(null);

  useLayoutEffect(() => {
    const row = refocus.current;
    if (row === null) return;
    refocus.current = null;
    const buttons = Array.from(
      tableEl.current?.querySelectorAll<HTMLButtonElement>("button[data-row]") ?? [],
    );
    // The row itself, or, when it left the grid (marked in As Column mode), the nearest one below
    // it, else above it.
    const target = buttons.find((b) => Number(b.dataset.row) >= row) ?? buttons[buttons.length - 1];
    target?.focus();
  });

  const closeMenu = (restoreFocus: boolean) => {
    if (!menu) return;
    if (restoreFocus) refocus.current = menu.row;
    setMenu(null);
  };

  const menuItems = (row: number): RowMenuItem[] => [
    {
      label: isSectionHeader(table, row) ? "Unmark Section Header" : "Mark as Section Header",
      onSelect: () => onToggleSection(row),
    },
    {
      label: "Combine with Row above",
      disabled: row === 0,
      onSelect: () => {
        // The combined Row takes the upper Row's place: its row number gets focus.
        refocus.current = row - 1;
        onCombine(row, "above");
      },
    },
    {
      label: "Combine with Row below",
      disabled: row === table.grid.length - 1,
      onSelect: () => onCombine(row, "below"),
    },
  ];

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
    const open = menu?.row === r;
    const idx = (
      <td className={styles.idx}>
        <button
          type="button"
          className={styles.idxBtn}
          data-row={r}
          title="Row actions"
          aria-label={
            section ? "Row is a section header. Row actions" : `Row ${k + 1}. Row actions`
          }
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerDown={() => {
            // The popover's light dismiss closes the menu before this press's click arrives.
            pressedOpen.current = open;
          }}
          onClick={(e) => {
            if (pressedOpen.current) {
              pressedOpen.current = false;
              return;
            }
            setMenu({ row: r, anchor: e.currentTarget });
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            setMenu({ row: r, anchor: e.currentTarget });
          }}
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
      <table ref={tableEl} className={styles.table}>
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
      {menu && (
        <RowMenu
          key={menu.row}
          label={menuLabel(table, menu.row)}
          anchor={menu.anchor}
          items={menuItems(menu.row)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

/** The menu's name: the row's number among data rows, or its Section Header text. */
function menuLabel(table: Table, row: number): string {
  if (isSectionHeader(table, row)) return `Section header row ${table.grid[row]?.[0] ?? ""}`.trim();
  let n = 0;
  for (let r = table.header ? 1 : 0; r <= row; r++) if (!isSectionHeader(table, r)) n++;
  return `Row ${n}`;
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
