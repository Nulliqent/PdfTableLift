import styles from "./ColumnSpacingPanel.module.css";

/**
 * Placeholder for the Column Spacing panel and the join switch.
 * The controls are uncontrolled and dispatch nothing yet.
 */
export function ColumnSpacingPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <label htmlFor="column-spacing">Column spacing</label>
        <output htmlFor="column-spacing">1.0×</output>
      </div>
      <input
        type="range"
        id="column-spacing"
        min="0.4"
        max="2.6"
        step="0.1"
        defaultValue="1"
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
        <input type="checkbox" role="switch" defaultChecked />
        Join tables that continue onto the next page
      </label>
    </div>
  );
}
