import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialWorkspace, reduce, selectedDocument, selectedTable } from "../engine";
import { ContentPane } from "./components/ContentPane";
import { Hud } from "./components/Hud";
import { IconSprite } from "./components/Icon";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { registerSource } from "./documentSources";
import { loadColumnSpacing, saveColumnSpacing } from "./column-spacing-storage";
import { useHud } from "./useHud";
import styles from "./App.module.css";

/** macOS-style split view: translucent toolbar, source-list sidebar and content pane. */
export function App() {
  const [state, dispatch] = useReducer(reduce, initialWorkspace, (initial) => ({
    ...initial,
    settings: { ...initial.settings, columnSpacing: loadColumnSpacing() },
  }));
  const columnSpacing = state.settings.columnSpacing;
  useEffect(() => saveColumnSpacing(columnSpacing), [columnSpacing]);
  const [hud, showHud] = useHud();
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFiles = useCallback(() => fileInput.current?.click(), []);

  const openFiles = async (files: File[]) => {
    for (const file of files) {
      const id = crypto.randomUUID();
      dispatch({ type: "documentAdded", id, name: file.name, size: file.size });
      registerSource(id, async () => new Uint8Array(await file.arrayBuffer()));
      // pdf.js is large, so it loads with the first Document instead of with the page.
      const { readDocument } = await import("../pdf-reader");
      const result = await readDocument(new Uint8Array(await file.arrayBuffer()));
      // A ReadError leaves the Document loading until the error screens arrive (#18).
      if (typeof result !== "string") dispatch({ type: "documentRead", id, pages: result });
    }
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
            onRestore={(documentId, removedId) => {
              dispatch({ type: "tableRestored", documentId, removedId });
              showHud("Restored table");
            }}
            columnSpacing={columnSpacing}
            onColumnSpacing={(value) => dispatch({ type: "columnSpacingChanged", value })}
          />
          <ContentPane
            document={selectedDocument(state)}
            table={selectedTable(state)}
            loading={state.documents.some((d) => d.status === "loading")}
            onOpen={chooseFiles}
            onCopied={showHud}
            onSelectTable={(documentId, tableId) =>
              dispatch({ type: "tableSelected", documentId, tableId })
            }
            onRemoveTable={(documentId, tableId) => {
              const n = selectedTable(state)?.n;
              dispatch({ type: "tableRemoved", documentId, tableId });
              showHud(`Removed Table ${n}: restore it from the sidebar`);
            }}
          />
        </div>
      </div>
      <Hud message={hud} />
    </>
  );
}
