import { Icon } from "./Icon";
import styles from "./DropArea.module.css";

/** The sidebar's clickable drop target. Choosing and dropping files arrive in a later ticket. */
export function DropArea() {
  return (
    <div className={styles.drop} role="button" tabIndex={0} aria-label="Choose PDF files">
      <Icon name="tray" />
      <strong>Drop PDFs here</strong>
      <span>or click to choose files</span>
    </div>
  );
}
