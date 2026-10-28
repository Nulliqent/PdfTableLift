import styles from "./DocumentList.module.css";

/** The sidebar's Documents section. Empty until Documents can be opened. */
export function DocumentList() {
  return (
    <div>
      <div className={styles.heading}>Documents</div>
      <div className={styles.list}>
        <div className={styles.status}>No documents yet</div>
      </div>
    </div>
  );
}
