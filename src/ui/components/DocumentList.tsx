import { tableSize, type Document, type Selection } from "../../engine";
import { pageLabel, plural } from "../format";
import { Icon } from "./Icon";
import styles from "./DocumentList.module.css";

type DocumentListProps = {
  documents: Document[];
  selection: Selection | null;
  onSelect: (documentId: string, tableId: string) => void;
  onRestore: (documentId: string, removedId: string) => void;
};

/** The sidebar's Documents section: each Document and its Tables with page and size. */
export function DocumentList({ documents, selection, onSelect, onRestore }: DocumentListProps) {
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
              <RemovedTables doc={doc} onRestore={onRestore} />
            </div>
          ))
        ) : (
          <div className={styles.status}>No documents yet</div>
        )}
      </div>
    </div>
  );
}

/** Removed Tables of a Document, each with a Restore action. */
function RemovedTables({
  doc,
  onRestore,
}: { doc: Document } & Pick<DocumentListProps, "onRestore">) {
  if (doc.status !== "ready") return null;
  return doc.removed.map((r) => (
    <div key={r.id} className={styles.removed}>
      <span>
        Removed: Table {r.n}, {pageLabel(r)}
      </span>
      <button
        type="button"
        className={styles.linkBtn}
        aria-label={`Restore Table ${r.n} of ${doc.name}`}
        onClick={() => onRestore(doc.id, r.id)}
      >
        Restore
      </button>
    </div>
  ));
}

function DocumentBody({
  doc,
  selection,
  onSelect,
}: { doc: Document } & Pick<DocumentListProps, "selection" | "onSelect">) {
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
