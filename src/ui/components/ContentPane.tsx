import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./ContentPane.module.css";

/** The content pane. With no Documents it shows the empty state. */
export function ContentPane() {
  return (
    <main className={styles.content}>
      <div className={styles.inner}>
        <div className={styles.emptyState}>
          <Icon name="table" />
          <h3>Drop a PDF to begin</h3>
          <p>
            Table Lift reads text-based PDFs, finds the tables, and lets you copy them as CSV,
            spreadsheet rows, Markdown or JSON.
          </p>
          <Button variant="primary">
            <Icon name="plus" />
            Open PDF
          </Button>
        </div>
      </div>
    </main>
  );
}
