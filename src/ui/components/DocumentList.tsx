import { useEffect, useRef } from "react";
import {
  READ_ERROR_MESSAGES,
  buildStackedTable,
  isSectionHeader,
  isStackedSelected,
  isTableSelected,
  tableSize,
  tickMatch,
  tickedTables,
  type Document,
  type MoveDirection,
  type Selection,
  type StackedTableRef,
  type Table,
  type TablesInProgress,
} from "../../engine";
import { pageLabel, plural } from "../format";
import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./DocumentList.module.css";

type DocumentListProps = {
  documents: Document[];
  selection: Selection | null;
  onSelect: (documentId: string, tableId: string) => void;
  /** The Document whose Region is being selected, if any. */
  regionDocumentId: string | null;
  onSelectRegion: (documentId: string) => void;
  onRestore: (documentId: string, removedId: string) => void;
  onRemove: (documentId: string) => void;
  /** The Tables being ticked in Select Tables, if any. */
  stacking: TablesInProgress | null;
  onStartStacking: (documentId: string) => void;
  onTick: (tableId: string, ticked: boolean) => void;
  onStack: () => void;
  /** Edit Members: move a ticked Table one place up or down in the Member order. */
  onMoveMember: (tableId: string, direction: MoveDirection) => void;
  /** Edit Members: Save. */
  onSaveMembers: () => void;
  onCancelStacking: () => void;
  onSelectStacked: (ref: StackedTableRef) => void;
};

/** The sidebar's Documents section: each Document and its Tables with page and size. */
export function DocumentList({
  documents,
  selection,
  onSelect,
  regionDocumentId,
  onSelectRegion,
  onRestore,
  onRemove,
  ...stackingProps
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
                  {doc.example && <span className={styles.tag}> (example)</span>}
                </span>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${doc.name}`}
                  title="Remove"
                  onClick={() => onRemove(doc.id)}
                >
                  <Icon name="x" />
                </button>
              </div>
              <DocumentBody
                doc={doc}
                selection={selection}
                onSelect={onSelect}
                regionDocumentId={regionDocumentId}
                onSelectRegion={onSelectRegion}
                {...stackingProps}
              />
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

type BodyProps = { doc: Document } & Omit<
  DocumentListProps,
  "documents" | "onRestore" | "onRemove"
>;

function DocumentBody({
  doc,
  selection,
  onSelect,
  regionDocumentId,
  onSelectRegion,
  stacking,
  onStartStacking,
  onTick,
  onStack,
  onMoveMember,
  onSaveMembers,
  onCancelStacking,
  onSelectStacked,
}: BodyProps) {
  const picking = stacking?.documentId === doc.id;
  const list = useRef<HTMLDivElement>(null);
  const wasPicking = useRef(picking);
  // Leaving Select Tables replaces the checkboxes: focus goes to the new Stacked Table if one was
  // made and selected, else back to Select Tables.
  useEffect(() => {
    const left = wasPicking.current && !picking;
    wasPicking.current = picking;
    if (!left) return;
    const target =
      list.current?.querySelector<HTMLElement>('[data-stacked][aria-current="true"]') ??
      list.current?.querySelector<HTMLElement>("[data-select-tables]");
    target?.focus();
  }, [picking]);
  if (doc.status === "loading")
    return (
      <div className={styles.status}>
        <span className={styles.spinner} aria-hidden="true" />
        Reading pages…
      </div>
    );
  if (doc.status === "error")
    return (
      <div className={`${styles.status} ${styles.error}`}>
        <Icon name="warn" />
        <span>{READ_ERROR_MESSAGES[doc.error!]}</span>
      </div>
    );
  if (stacking && picking)
    return (
      <SelectTables
        doc={doc}
        stacking={stacking}
        onTick={onTick}
        onStack={onStack}
        onMove={onMoveMember}
        onSave={onSaveMembers}
        onCancel={onCancelStacking}
      />
    );
  const selecting = regionDocumentId !== null;
  const tables = doc.tables.map((t) => {
    const current = !selecting && isTableSelected(selection, doc.id, t.id);
    return (
      <button
        key={t.id}
        type="button"
        className={styles.row}
        aria-current={current}
        onClick={() => onSelect(doc.id, t.id)}
      >
        <Icon name={t.manual === null ? "table" : "select"} />
        <TableName table={t} />
      </button>
    );
  });
  // Stacked Tables are listed after the Document's Tables, each with its Members' numbers.
  const stacked = doc.stacked.map((s) => {
    const built = buildStackedTable(doc, s);
    const { rows, cols } = tableSize(built.table);
    const members = built.members.flatMap((m) => (m.table ? [m.table.n] : []));
    const current = !selecting && isStackedSelected(selection, doc.id, s.id);
    return (
      <button
        key={s.id}
        type="button"
        className={styles.row}
        aria-current={current}
        data-stacked
        onClick={() => onSelectStacked({ documentId: doc.id, stackedId: s.id })}
      >
        <Icon name="stack" />
        <span className={styles.t}>
          <b>Stacked Table {s.n}</b>
          <span className={styles.sub}>
            {members.length === 1 ? "Table" : "Tables"} {members.join(", ")} · {rows} × {cols}
          </span>
        </span>
      </button>
    );
  });
  return (
    <div ref={list} className={styles.group}>
      {doc.tables.length ? (
        tables
      ) : (
        <div className={styles.status}>No tables found on {plural(doc.pages.length, "page")}</div>
      )}
      {stacked}
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
      <SelectTablesButton doc={doc} onStart={onStartStacking} />
    </div>
  );
}

/**
 * Select Tables…, shown in every Document's section. With fewer than 2 Tables it stays focusable
 * but does nothing, marked unavailable with the reason in words beneath it.
 */
function SelectTablesButton({
  doc,
  onStart,
}: {
  doc: Document;
  onStart: (documentId: string) => void;
}) {
  const unavailable = doc.tables.length < 2;
  const reasonId = `select-tables-reason-${doc.id}`;
  return (
    <button
      type="button"
      className={`${styles.row} ${styles.add}`}
      data-select-tables
      data-unavailable={unavailable}
      aria-disabled={unavailable ? true : undefined}
      aria-describedby={unavailable ? reasonId : undefined}
      onClick={() => {
        if (!unavailable) onStart(doc.id);
      }}
    >
      <Icon name="stack" />
      <span className={styles.t}>
        <b>Select Tables…</b>
        {unavailable ? (
          <span id={reasonId} className={styles.reason}>
            Needs at least 2 Tables
          </span>
        ) : (
          <span className={styles.sub}>Stack Tables that share a Header Row</span>
        )}
      </span>
    </button>
  );
}

/** A Table's name and its page, size, sections and kind, as the sidebar lists it. */
function TableName({ table: t, id }: { table: Table; id?: string }) {
  const { rows, cols } = tableSize(t);
  const sections = t.sections.filter((r) => isSectionHeader(t, r)).length;
  return (
    <span className={styles.t} id={id}>
      <b>Table {t.n}</b>
      <span className={styles.sub}>
        {pageLabel(t)} · {rows} × {cols}
        {sections > 0 && ` · ${plural(sections, "section")}`}
        {t.manual !== null && " · Selected by hand"}
      </span>
    </span>
  );
}

/**
 * Select Tables: a checkbox per Table of the Document. A Table that fails the matching rule against
 * the first ticked Table stays listed, greyed out and marked unavailable, with the reason beneath it
 * in words. Ticked Tables show their tick order. The bar holds Stack N Tables and Cancel.
 *
 * In Edit Members Tables are judged against the Stacked Table's saved Header Row instead. The
 * ticked Tables come first, in Member order, each with Move Up and Move Down; the bar holds Save,
 * which needs one ticked Table, and Cancel.
 */
function SelectTables({
  doc,
  stacking,
  onTick,
  onStack,
  onMove,
  onSave,
  onCancel,
}: {
  doc: Document;
  stacking: TablesInProgress;
  onTick: (tableId: string, ticked: boolean) => void;
  onStack: () => void;
  onMove: (tableId: string, direction: MoveDirection) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const tickedList = tickedTables(doc, stacking.ticked);
  const ticked = tickedList.map((t) => t.id);
  const n = ticked.length;
  const record = doc.stacked.find((s) => s.id === stacking.stackedId);
  const editing = record !== undefined;
  const least = editing ? 1 : 2;
  const hintId = `stack-hint-${doc.id}`;
  const group = useRef<HTMLDivElement>(null);
  useEffect(() => {
    group.current?.querySelector<HTMLElement>("input")?.focus();
  }, []);
  const listed = editing
    ? [...tickedList, ...doc.tables.filter((t) => !ticked.includes(t.id))]
    : doc.tables;
  return (
    <div
      ref={group}
      role="group"
      aria-label={
        editing ? `Edit Members of Stacked Table ${record.n}` : `Select Tables of ${doc.name}`
      }
      className={styles.group}
    >
      {listed.map((t) => {
        const order = ticked.indexOf(t.id) + 1;
        const match = tickMatch(doc, stacking, t);
        const reason = match.matches ? null : match.reason;
        const reasonId = `stack-reason-${t.id}`;
        const nameId = `stack-name-${t.id}`;
        return (
          <label key={t.id} className={`${styles.row} ${styles.pick}`} data-unavailable={!!reason}>
            <input
              type="checkbox"
              className={styles.check}
              checked={order > 0}
              aria-disabled={reason ? true : undefined}
              aria-labelledby={nameId}
              aria-describedby={reason ? reasonId : undefined}
              onChange={(e) => {
                if (!reason) onTick(t.id, e.target.checked);
              }}
            />
            <span className={styles.t}>
              <TableName table={t} id={nameId} />
              {reason && (
                <span id={reasonId} className={styles.reason}>
                  {reason}
                </span>
              )}
            </span>
            {order > 0 && (
              <span className={styles.order} aria-label={`ticked ${order}`}>
                {order}
              </span>
            )}
            {editing && order > 0 && (
              <span className={styles.moves}>
                {(["up", "down"] as const).map((direction) => {
                  // At either end the control stays focusable but does nothing, so focus is never lost.
                  const end = direction === "up" ? order === 1 : order === n;
                  return (
                    <button
                      key={direction}
                      type="button"
                      className={styles.move}
                      aria-label={`Move Table ${t.n} ${direction}`}
                      title={direction === "up" ? "Move Up" : "Move Down"}
                      aria-disabled={end ? true : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        if (!end) onMove(t.id, direction);
                      }}
                    >
                      <Icon name={direction} />
                    </button>
                  );
                })}
              </span>
            )}
          </label>
        );
      })}
      <div className={styles.stackBar}>
        <Button
          variant="primary"
          disabled={n < least}
          aria-describedby={n < least ? hintId : undefined}
          onClick={editing ? onSave : onStack}
        >
          {editing ? "Save" : `Stack ${plural(n, "Table")}`}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        {n < least && (
          <span id={hintId} className={styles.hint}>
            {editing ? "Tick at least one Table" : "Tick at least two Tables"}
          </span>
        )}
      </div>
    </div>
  );
}
