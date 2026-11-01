import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  READ_ERROR_MESSAGES,
  initialWorkspace,
  memberMove,
  nextStackedNumber,
  reduce,
  regionBlocked,
  regionPreview,
  selectedDocument,
  selectedStackedTable,
  selectedTable,
  tickOutcome,
  tickedTables,
  type MoveDirection,
  type PageText,
  type StackedTableRef,
  type ReadError,
  type RegionInProgress,
  roleLabel,
  type RegionRole,
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
import { plural } from "./format";
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
  const redrawRegion = (documentId: string, tableId: string, page: number) =>
    dispatch({ type: "regionStarted", documentId, page, tableId });
  const savedMessage = (n: number, redrawn: boolean) =>
    redrawn ? `Table ${n} redrawn from your selection` : `Table ${n} added from your selection`;
  // The Region being saved, until the reducer answers. The new Table's number is read from the
  // state the save produced, so detection runs once, inside the reducer.
  const saving = useRef<RegionInProgress | null>(null);
  const saveRegion = () => {
    saving.current = region;
    dispatch({ type: "regionCommitted" });
  };
  useEffect(() => {
    const saved = saving.current;
    if (!saved) return;
    // Held for the edit warning: the confirmation announces the save itself.
    if (state.pendingChange?.type === "regionCommitted") saving.current = null;
    if (!saving.current || state.region === saved) return;
    saving.current = null;
    const created = selectedTable(state);
    if (state.region === null && created?.manual)
      showHud(savedMessage(created.n, saved.redraw !== null));
  }, [state, showHud]);

  // Announce a read error once the reducer has recorded it: a Document removed while it was
  // loading never records one. With a good Table selected the content pane doesn't show the
  // error, only the sidebar does, so the HUD says it too.
  const announced = useRef(new Set<string>());
  const hasSelection = state.selection !== null;
  useEffect(() => {
    for (const d of state.documents) {
      if (d.status !== "error" || announced.current.has(d.id)) continue;
      announced.current.add(d.id);
      if (hasSelection && d.error) showHud(READ_ERROR_MESSAGES[d.error], "warn");
    }
  }, [state.documents, hasSelection, showHud]);

  const read = async (id: string, bytes: Uint8Array) => {
    // pdf.js is large, so it loads with the first Document instead of with the page.
    let result: PageText[] | ReadError;
    try {
      const { readDocument } = await import("../pdf-reader");
      result = await readDocument(bytes);
    } catch {
      result = "not-pdf"; // e.g. the pdf.js chunk failed to load; never leave the Document reading
    }
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

  // Select Tables. Each tick says how many are ticked; the first also says how many are left out.
  const stacking = state.stacking;
  const stackingDoc = stacking && state.documents.find((d) => d.id === stacking.documentId);
  const tick = (tableId: string, ticked: boolean) => {
    const table = stackingDoc?.tables.find((t) => t.id === tableId);
    if (!stacking || !stackingDoc || !table) return;
    const outcome = tickOutcome(stackingDoc, stacking, table, ticked);
    if (!outcome) return;
    dispatch({ type: "tableTicked", tableId, ticked });
    const count = `${plural(outcome.count, "Table")} ticked`;
    if (!ticked) return showHud(`Unticked Table ${table.n} · ${count}`);
    const out = outcome.unmatched;
    const left =
      outcome.count === 1 && out > 0
        ? ` · ${plural(out, "Table")} ${out === 1 ? "doesn't" : "don't"} match its Header Row`
        : "";
    showHud(`Ticked Table ${table.n} · ${count}${left}`);
  };
  const stack = () => {
    if (!stacking || !stackingDoc) return;
    const tables = tickedTables(stackingDoc, stacking.ticked);
    if (tables.length < 2) return;
    const n = nextStackedNumber(stackingDoc);
    dispatch({ type: "tablesStacked" });
    showHud(`Stacked Tables ${tables.map((t) => t.n).join(", ")} into Stacked Table ${n}`);
  };
  // Edit Members. Each move says where the Table now stands; Save says what the Members now are.
  const editedRecord =
    stacking?.stackedId !== undefined
      ? stackingDoc?.stacked.find((s) => s.id === stacking.stackedId)
      : undefined;
  const moveMember = (tableId: string, direction: MoveDirection) => {
    const table = stackingDoc?.tables.find((t) => t.id === tableId);
    if (!stacking || !stackingDoc || !table) return;
    const move = memberMove(stackingDoc, stacking, tableId, direction);
    if (!move) return;
    dispatch({ type: "memberMoved", tableId, direction });
    showHud(`Moved Table ${table.n} ${direction} · ${move.position} of ${move.count}`);
  };
  const saveMembers = () => {
    if (!stacking || !stackingDoc || !editedRecord) return;
    const tables = tickedTables(stackingDoc, stacking.ticked);
    if (!tables.length) return;
    dispatch({ type: "membersSaved" });
    showHud(
      `Stacked Table ${editedRecord.n} now stacks ${tables.length === 1 ? "Table" : "Tables"} ${tables.map((t) => t.n).join(", ")}`,
    );
  };
  const removeStacked = (ref: StackedTableRef) => {
    const n = state.documents
      .find((d) => d.id === ref.documentId)
      ?.stacked.find((s) => s.id === ref.stackedId)?.n;
    dispatch({ type: "stackedTableRemoved", ...ref });
    if (n !== undefined) showHud(`Removed Stacked Table ${n}. Its Members are unchanged`);
  };
  const stackingOpen = stacking !== null && state.pendingChange === null;
  useEffect(() => {
    if (!stackingOpen) return;
    // An open sheet, menu or other popover takes Escape first and closes alone.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("dialog[open], [popover]:popover-open")) return;
      dispatch({ type: "stackingCancelled" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [stackingOpen]);

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
            stacking={stacking}
            onStartStacking={(documentId) => {
              dispatch({ type: "stackingStarted", documentId });
              showHud("Tick the Tables to stack, in order");
            }}
            onTick={tick}
            onStack={stack}
            onMoveMember={moveMember}
            onSaveMembers={saveMembers}
            onCancelStacking={() => dispatch({ type: "stackingCancelled" })}
            onSelectStacked={(ref) => dispatch({ type: "stackedTableSelected", ...ref })}
          />
          <ContentPane
            document={selectedDocument(state)}
            table={selectedTable(state)}
            stacked={selectedStackedTable(state)}
            documents={state.documents}
            onSelectRegion={startRegion}
            onOpen={chooseFiles}
            onAnnounce={showHud}
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
                  blocked={regionBlocked(state)}
                  onPage={(page) => dispatch({ type: "regionChanged", page, bbox: null })}
                  onDrag={(bbox) => dispatch({ type: "regionChanged", page: region.page, bbox })}
                  onWholePage={() => dispatch({ type: "wholePageSelected" })}
                  onSingleRow={(index, value) => {
                    dispatch({ type: "regionSingleRowChanged", index, value });
                    showHud(
                      `Region ${index + 1} ${value ? "is now treated as one row" : "is grouped into rows again"}`,
                    );
                  }}
                  onAddRegion={() => {
                    dispatch({ type: "regionAdded" });
                    showHud(`Region ${region.regions.length + 1} added`);
                  }}
                  onPickRegion={(index) => dispatch({ type: "regionPicked", index })}
                  onRemoveRegion={(index) => {
                    dispatch({ type: "regionRemoved", index });
                    showHud(`Region ${index + 1} removed`);
                  }}
                  onRole={(index, role) => {
                    const was = region.regions[index]?.role;
                    if (was === role) return;
                    dispatch({ type: "regionRoleChanged", index, role });
                    const demoted =
                      role === "header"
                        ? region.regions.findIndex((r, i) => i !== index && r.role === "header")
                        : -1;
                    const now = (i: number, r: RegionRole) =>
                      `Region ${i + 1} is now ${roleLabel(r)}`;
                    showHud(now(index, role) + (demoted >= 0 ? `. ${now(demoted, "body")}` : ""));
                  }}
                  onCancel={() => dispatch({ type: "regionCancelled" })}
                  onSave={saveRegion}
                />
              )
            }
            onRedrawRegion={redrawRegion}
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
            onRowAction={dispatch}
            onSplitByPage={(documentId, tableId) => {
              dispatch({ type: "splitByPage", documentId, tableId });
              if (!hasEdits(documentId)) showHud(splitMessage(documentId, tableId));
            }}
            onJoinAgain={(documentId, tableId) => {
              dispatch({ type: "joinAgain", documentId, tableId });
              if (!hasEdits(documentId)) showHud("Joined with the previous page");
            }}
            editingStackedId={stacking?.stackedId ?? null}
            onEditMembers={(ref) => {
              dispatch({ type: "membersEditStarted", ...ref });
              showHud("Edit the Members: tick, untick or move them, then Save");
            }}
            onRemoveStacked={removeStacked}
            onToggleSource={(ref, source) =>
              dispatch({ type: "stackedSourceToggled", ...ref, source })
            }
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
              showHud(
                state.region?.redraw
                  ? "Table redrawn from your selection"
                  : "Table added from your selection",
              );
          }}
          onCancel={() => dispatch({ type: "changeCancelled" })}
        />
      )}
      {dragging && <DropOverlay />}
      <Hud message={hud} />
    </>
  );
}
