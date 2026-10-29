import { tableSize, type Document, type Selection } from "../../engine";
import { pageLabel, plural } from "../format";
import { Icon } from "./Icon";
import styles from "./DocumentList.module.css";

type DocumentListProps = {
  documents: Document[];
  selection: Selection | null;
  onSelect: (documentId: string, tableId: string) => void;
};

/** The sidebar's Documents section: each Document and its Tables with page and size. */
export function DocumentList({ documents, selection, onSelect }: DocumentListProps) {
  return (
    <div>
      <div className={styles.heading}>Documents</div>
      <div className={styles.list}>
        {documents.length ? (
          documents.map((doc) => (
            <div key={doc.id} className={styles.file}>
              <div className={styles.fileRow}>
                <Icon name="doc" className={styles.docIcon} />
                <span className={styles.name} title={doc.name}>
                  {doc.name}
                </span>
              </div>
              <DocumentBody doc={doc} selection={selection} onSelect={onSelect} />
            </div>
          ))
        ) : (
          <div className={styles.status}>No documents yet</div>
        )}
      </div>
    </div>
  );
}

function DocumentBody({
  doc,
  selection,
  onSelect,
}: { doc: Document } & Omit<DocumentListProps, "documents">) {
  if (doc.status === "loading")
    return (
      <div className={styles.status}>
        <span className={styles.spinner} />
        Reading pages…
      </div>
    );
  if (!doc.tables.length)
    return (
      <div className={styles.status}>No tables found on {plural(doc.pages.length, "page")}</div>
    );
  return doc.tables.map((t) => {
    const { rows, cols } = tableSize(t);
    const current = selection?.documentId === doc.id && selection.tableId === t.id;
    return (
      <button
        key={t.id}
        type="button"
        className={styles.row}
        aria-current={current}
        onClick={() => onSelect(doc.id, t.id)}
      >
        <Icon name="table" />
        <span className={styles.t}>
          <b>Table {t.n}</b>
          <span className={styles.sub}>
            {pageLabel(t)} · {rows} × {cols}
          </span>
        </span>
      </button>
    );
  });
}
