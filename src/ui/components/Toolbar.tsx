import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./Toolbar.module.css";

/** Translucent window toolbar: app icon, title and the Open PDF button. */
export function Toolbar() {
  return (
    <header className={styles.toolbar}>
      <div className={styles.appicon} aria-hidden="true">
        <Icon name="table" style={{ strokeWidth: 2 }} />
      </div>
      <div className={styles.titles}>
        <h1>Table Lift</h1>
        <p>Extract tables from PDFs on this device</p>
      </div>
      <Button variant="primary" aria-label="Open PDF" title="Open PDF (⌘O)">
        <Icon name="plus" />
        <span className={styles.lbl}>Open PDF</span>
      </Button>
    </header>
  );
}
