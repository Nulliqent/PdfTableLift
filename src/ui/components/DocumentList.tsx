import { tableSize, type Document, type Selection } from "../../engine";
import { pageLabel, plural } from "../format";
import { Icon } from "./Icon";
import styles from "./DocumentList.module.css";

type DocumentListProps = {
  documents: Document[];
  selection: Selection | null;
  onSelect: (documentId: string, tableId: string) => void;
  /** The Document whose Region is being selected, if any. */
  regionDocumentId: string | null;
  onSelectRegion: (documentId: string) => void;
};

/** The sidebar's Documents section: each Document and its Tables with page and size. */
export function DocumentList({
  documents,
  selection,
  onSelect,
  regionDocumentId,
  onSelectRegion,
}: DocumentListProps) {
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
              <DocumentBody
                doc={doc}
                selection={selection}
                onSelect={onSelect}
                regionDocumentId={regionDocumentId}
                onSelectRegion={onSelectRegion}
              />
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
  regionDocumentId,
  onSelectRegion,
}: { doc: Document } & Omit<DocumentListProps, "documents">) {
  if (doc.status === "loading")
    return (
      <div className={styles.status}>
        <span className={styles.spinner} />
        Reading pages…
      </div>
    );
  const selecting = regionDocumentId !== null;
  const tables = doc.tables.map((t) => {
    const { rows, cols } = tableSize(t);
    const current = !selecting && selection?.documentId === doc.id && selection.tableId === t.id;
    return (
      <button
        key={t.id}
        type="button"
        className={styles.row}
        aria-current={current}
        onClick={() => onSelect(doc.id, t.id)}
      >
        <Icon name={t.region === undefined ? "table" : "select"} />
        <span className={styles.t}>
          <b>Table {t.n}</b>
          <span className={styles.sub}>
            {pageLabel(t)} · {rows} × {cols}
            {t.region !== undefined && " · Selected by hand"}
          </span>
        </span>
      </button>
    );
  });
  return (
    <>
      {doc.tables.length ? (
        tables
      ) : (
        <div className={styles.status}>No tables found on {plural(doc.pages.length, "page")}</div>
      )}
      <button
        type="button"
        className={`${styles.row} ${styles.add}`}
        aria-current={regionDocumentId === doc.id}
        onClick={() => onSelectRegion(doc.id)}
      >
        <Icon name="select" />
        <span className={styles.t}>
          <b>Select Table Region…</b>
          <span className={styles.sub}>When a table is missed or cut off</span>
        </span>
      </button>
    </>
  );
}
