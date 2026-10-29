import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialWorkspace, reduce, selectedDocument, selectedTable } from "../engine";
import { ContentPane } from "./components/ContentPane";
import { DropOverlay } from "./components/DropOverlay";
import { Hud } from "./components/Hud";
import { IconSprite } from "./components/Icon";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { splitPdfs } from "./pdfFiles";
import { useFileDrop } from "./useFileDrop";
import { useHud } from "./useHud";
import styles from "./App.module.css";

const EXAMPLE_URL = "/example-document.pdf";
const EXAMPLE_NAME = "Northwind Q3 Summary.pdf";

/** macOS-style split view: translucent toolbar, source-list sidebar and content pane. */
export function App() {
  const [state, dispatch] = useReducer(reduce, initialWorkspace);
  const [hud, showHud] = useHud();
  const fileInput = useRef<HTMLInputElement>(null);
  const userOpened = useRef(false);
  const exampleRequested = useRef(false);
  const chooseFiles = useCallback(() => fileInput.current?.click(), []);

  const read = async (id: string, bytes: Uint8Array) => {
    // pdf.js is large, so it loads with the first Document instead of with the page.
    const { readDocument } = await import("../pdf-reader");
    const result = await readDocument(bytes);
    // A ReadError leaves the Document loading until the error screens arrive (#18).
    if (typeof result !== "string") dispatch({ type: "documentRead", id, pages: result });
  };

  const openFiles = async (files: File[]) => {
    const { pdfs, skipped } = splitPdfs(files);
    if (files.length && !pdfs.length) showHud("Only PDF files can be read", "warn");
    else if (skipped)
      showHud(`Skipped ${skipped} file${skipped > 1 ? "s" : ""} that weren't PDFs`, "warn");
    if (pdfs.length) userOpened.current = true;
    await Promise.all(
      pdfs.map(async (file) => {
        const id = crypto.randomUUID();
        dispatch({ type: "documentAdded", id, name: file.name, size: file.size });
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

  const removeDocument = (id: string) => {
    const doc = state.documents.find((d) => d.id === id);
    dispatch({ type: "documentRemoved", id });
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
            onOpen={chooseFiles}
            onRemove={removeDocument}
          />
          <ContentPane
            document={selectedDocument(state)}
            table={selectedTable(state)}
            loading={state.documents.some((d) => d.status === "loading")}
            onOpen={chooseFiles}
            onCopied={showHud}
          />
        </div>
      </div>
      {dragging && <DropOverlay />}
      <Hud message={hud} />
    </>
  );
}
