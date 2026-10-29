import { Icon } from "./Icon";
import styles from "./DropArea.module.css";

/** The sidebar's drop target. Click, Enter or Space opens the file chooser. */
export function DropArea({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      className={styles.drop}
      role="button"
      tabIndex={0}
      aria-label="Choose PDF files"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <Icon name="tray" />
      <strong>Drop PDFs here</strong>
      <span>or click to choose files</span>
    </div>
  );
}
