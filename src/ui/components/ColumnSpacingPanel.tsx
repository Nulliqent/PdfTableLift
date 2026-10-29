import { MAX_COLUMN_SPACING, MIN_COLUMN_SPACING } from "../../engine";
import styles from "./ColumnSpacingPanel.module.css";

type ColumnSpacingPanelProps = {
  value: number;
  onChange: (value: number) => void;
  join: boolean;
  onJoinChange: (join: boolean) => void;
};

/** The Column Spacing slider and the join switch. */
export function ColumnSpacingPanel({
  value,
  onChange,
  join,
  onJoinChange,
}: ColumnSpacingPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <label htmlFor="column-spacing">Column spacing</label>
        <output htmlFor="column-spacing">{value.toFixed(1)}×</output>
      </div>
      <input
        type="range"
        id="column-spacing"
        min={MIN_COLUMN_SPACING}
        max={MAX_COLUMN_SPACING}
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={styles.range}
      />
      <div className={styles.ends}>
        <span>Split more</span>
        <span>Merge more</span>
      </div>
      <small>
        If words land in separate columns, move right. If columns run together, move left. Tables
        are re-detected instantly.
      </small>
      <label className={styles.switch}>
        <input
          type="checkbox"
          role="switch"
          checked={join}
          onChange={(e) => onJoinChange(e.target.checked)}
        />
        Join tables that continue onto the next page
      </label>
    </div>
  );
}
