import { Icon } from "./Icon";
import styles from "./DropOverlay.module.css";

/** Full-window overlay shown while files are dragged over the page. */
export function DropOverlay() {
  return (
    <div className={styles.overlay} data-testid="drop-overlay">
      <div className={styles.target}>
        <Icon name="tray" />
        Drop to extract tables
        <small>PDF files are read on this device and never uploaded</small>
      </div>
    </div>
  );
}
