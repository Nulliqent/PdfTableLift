import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  initialWorkspace,
  reduce,
  regionPreview,
  selectedDocument,
  selectedTable,
  type WorkspaceAction,
} from "../engine";
import { ContentPane } from "./components/ContentPane";
import { ConfirmSheet } from "./components/ConfirmSheet";
import { DropOverlay } from "./components/DropOverlay";
import { Hud } from "./components/Hud";
import { IconSprite } from "./components/Icon";
import { RegionSelection } from "./components/RegionSelection";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { loadColumnSpacing, saveColumnSpacing } from "./column-spacing-storage";
import { loadJoin, saveJoin } from "./join-storage";
import { registerSource, releaseSource } from "./documentSources";
import { splitPdfs } from "./pdfFiles";
import { useFileDrop } from "./useFileDrop";
import { useHud } from "./useHud";
import styles from "./App.module.css";

const EXAMPLE_URL = "/example-document.pdf";
const EXAMPLE_NAME = "Northwind Q3 Summary.pdf";

/** macOS-style split view: translucent toolbar, source-list sidebar and content pane. */
export function App() {
  const [state, dispatch] = useReducer(reduce, initialWorkspace, (initial) => ({
    ...initial,
    settings: { ...initial.settings, columnSpacing: loadColumnSpacing(), join: loadJoin() },
  }));
  const columnSpacing = state.settings.columnSpacing;
  useEffect(() => saveColumnSpacing(columnSpacing), [columnSpacing]);
  const join = state.settings.join;
  useEffect(() => saveJoin(join), [join]);
  const [hud, showHud] = useHud();
  const fileInput = useRef<HTMLInputElement>(null);
  const userOpened = useRef(false);
  const exampleRequested = useRef(false);
  const chooseFiles = useCallback(() => fileInput.current?.click(), []);

  const region = state.region;
  const regionDoc = region && state.documents.find((d) => d.id === region.documentId);
  const startRegion = (documentId: string) => {
    const table = selectedTable(state);
    const onSelected = state.selection?.documentId === documentId && table;
    dispatch({ type: "regionStarted", documentId, page: onSelected ? table.page : 1 });
  };
  const saveRegion = () => {
    // The reducer is pure, so the new Table's number is known before dispatching.
    const action: WorkspaceAction = { type: "regionCommitted" };
    const created = selectedTable(reduce(state, action));
    dispatch(action);
    if (created && created.manual !== null && !hasEdits(region!.documentId))
      showHud(`Table ${created.n} added from your selection`);
  };

  const read = async (id: string, bytes: Uint8Array) => {
    // pdf.js is large, so it loads with the first Document instead of with the page.
    const { readDocument } = await import("../pdf-reader");
    const result = await readDocument(bytes);
    if (typeof result === "string") dispatch({ type: "documentFailed", id, error: result });
    else dispatch({ type: "documentRead", id, pages: result });
  };

  const openFiles = async (files: File[]) => {
    const { pdfs, skipped } = splitPdfs(files);
    if (files.length && !pdfs.length) showHud("Only PDF files can be read", "warn");
    else if (skipped)
      showHud(`Skipped ${skipped} file${skipped > 1 ? "s" : ""} that weren't PDFs`, "warn");
    if (pdfs.length) {
      userOpened.current = true;
      // The reducer drops the Example Document when the first own Document is added.
      for (const d of state.documents) if (d.example) void releaseSource(d.id);
    }
    await Promise.all(
      pdfs.map(async (file) => {
        const id = crypto.randomUUID();
        dispatch({ type: "documentAdded", id, name: file.name, size: file.size });
        registerSource(id, async () => new Uint8Array(await file.arrayBuffer()));
        await read(id, new Uint8Array(await file.arrayBuffer()));
      }),
    );
  };

  // First visit: the Example Document, unless the user opens a file before it arrives.
  useEffect(() => {
    if (exampleRequested.current) return;
    exampleRequested.current = true;
    void (async () => {
      let bytes: Uint8Array;
      try {
        const response = await fetch(EXAMPLE_URL);
        if (!response.ok) return;
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        return; // The example is a courtesy; without it the app starts empty.
      }
      if (userOpened.current) return;
      const id = crypto.randomUUID();
      dispatch({
        type: "documentAdded",
        id,
        name: EXAMPLE_NAME,
        size: bytes.length,
        example: true,
      });
      registerSource(id, () => Promise.resolve(bytes));
      await read(id, bytes);
    })();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        chooseFiles();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [chooseFiles]);

  const dragging = useFileDrop((files) => void openFiles(files));

  /** Whether re-detecting this Document would ask to discard corrections first. */
  const hasEdits = (documentId: string) =>
    state.documents.some((d) => d.id === documentId && d.tables.some((t) => t.edited));
  const removedMessage = (n: number | undefined) =>
    `Removed Table ${n}: restore it from the sidebar`;
  const splitMessage = (documentId: string, tableId: string) =>
    `Split into ${
      state.documents.find((d) => d.id === documentId)?.tables.find((t) => t.id === tableId)?.parts
        .length
    } tables`;

  const removeDocument = (id: string) => {
    const doc = state.documents.find((d) => d.id === id);
    dispatch({ type: "documentRemoved", id });
    void releaseSource(id);
    if (doc) showHud(`Removed ${doc.name}`);
  };

  return (
    <>
      <IconSprite />
      <div className={styles.app}>
        <Toolbar documents={state.documents} onOpen={chooseFiles} />
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            void openFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <div className={styles.split}>
          <Sidebar
            documents={state.documents}
            selection={state.selection}
            onSelect={(documentId, tableId) =>
              dispatch({ type: "tableSelected", documentId, tableId })
            }
            regionDocumentId={region?.documentId ?? null}
            onSelectRegion={startRegion}
            onRestore={(documentId, removedId) => {
              dispatch({ type: "tableRestored", documentId, removedId });
              if (!hasEdits(documentId)) showHud("Restored table");
            }}
            onOpen={chooseFiles}
            onRemove={removeDocument}
            columnSpacing={columnSpacing}
            onColumnSpacing={(value) => dispatch({ type: "columnSpacingChanged", value })}
            join={join}
            onJoin={(value) => dispatch({ type: "joinChanged", value })}
          />
          <ContentPane
            document={selectedDocument(state)}
            table={selectedTable(state)}
            documents={state.documents}
            onSelectRegion={startRegion}
            onOpen={chooseFiles}
            onCopied={showHud}
            onSelectTable={(documentId, tableId) =>
              dispatch({ type: "tableSelected", documentId, tableId })
            }
            regionSelection={
              region &&
              regionDoc && (
                <RegionSelection
                  document={regionDoc}
                  region={region}
                  preview={regionPreview(state)}
                  onPage={(page) => dispatch({ type: "regionChanged", page, bbox: null })}
                  onDrag={(bbox) => dispatch({ type: "regionChanged", page: region.page, bbox })}
                  onWholePage={() => dispatch({ type: "wholePageSelected" })}
                  onCancel={() => dispatch({ type: "regionCancelled" })}
                  onSave={saveRegion}
                />
              )
            }
            onRemoveTable={(documentId, tableId) => {
              const n = state.documents
                .find((d) => d.id === documentId)
                ?.tables.find((t) => t.id === tableId)?.n;
              dispatch({ type: "tableRemoved", documentId, tableId });
              if (!hasEdits(documentId)) showHud(removedMessage(n));
            }}
            onEditCell={(documentId, tableId, row, col, value) =>
              dispatch({ type: "cellEdited", documentId, tableId, row, col, value })
            }
            onToggleHeader={(documentId, tableId, header) =>
              dispatch({ type: "headerToggled", documentId, tableId, header })
            }
            onToggleSection={(documentId, tableId, row) =>
              dispatch({ type: "sectionHeaderToggled", documentId, tableId, row })
            }
            onSplitByPage={(documentId, tableId) => {
              dispatch({ type: "splitByPage", documentId, tableId });
              if (!hasEdits(documentId)) showHud(splitMessage(documentId, tableId));
            }}
            onJoinAgain={(documentId, tableId) => {
              dispatch({ type: "joinAgain", documentId, tableId });
              if (!hasEdits(documentId)) showHud("Joined with the previous page");
            }}
          />
        </div>
      </div>
      {state.pendingChange && (
        <ConfirmSheet
          title="Discard your corrections?"
          message="Detecting the tables again discards the cells you corrected and any header change."
          confirmLabel="Discard and Re-detect"
          onConfirm={() => {
            const pending = state.pendingChange;
            dispatch({ type: "changeConfirmed" });
            if (pending?.type === "tableRemoved") {
              const table = state.documents
                .find((d) => d.id === pending.documentId)
                ?.tables.find((t) => t.id === pending.tableId);
              showHud(removedMessage(table?.n));
            } else if (pending?.type === "tableRestored") showHud("Restored table");
            else if (pending?.type === "splitByPage")
              showHud(splitMessage(pending.documentId, pending.tableId));
            else if (pending?.type === "joinAgain") showHud("Joined with the previous page");
            else if (pending?.type === "regionCommitted")
              showHud("Table added from your selection");
          }}
          onCancel={() => dispatch({ type: "changeCancelled" })}
        />
      )}
      {dragging && <DropOverlay />}
      <Hud message={hud} />
    </>
  );
}
