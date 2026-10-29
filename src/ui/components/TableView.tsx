import type { Table } from "../../engine";
import styles from "./TableView.module.css";

/**
 * The Table's grid, with the Header Row as column headers and numbered body rows.
 * Read-only for now: cell editing (#9) and Section Header rows (#11) arrive later.
 */
export function TableView({ table }: { table: Table }) {
  const [head, ...body] = table.header ? table.grid : [null, ...table.grid];
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        {head && (
          <thead>
            <tr>
              <th className={styles.idx} aria-label="Row" />
              {head.map((v, c) => (
                <th key={c} scope="col" className={v ? undefined : styles.empty}>
                  {v}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              <td className={styles.idx}>{r + 1}</td>
              {row!.map((v, c) => (
                <td key={c} className={v ? undefined : styles.empty}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
