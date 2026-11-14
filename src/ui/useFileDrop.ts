import { useEffect, useRef, useState } from "react";

const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") === true;

/** Listens for files dragged onto the window; `dragging` is true while they hover over it. */
export function useFileDrop(onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });
  useEffect(() => {
    // dragenter/dragleave fire for every child element, so count them.
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      handler.current([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return dragging;
}
