import { useCallback, useState } from "react";
import { DEFAULT_EXPORT_FORMAT, isExportFormat, type ExportFormat } from "../engine";

const KEY = "tl-format";

function load(): ExportFormat {
  try {
    const saved = localStorage.getItem(KEY);
    if (isExportFormat(saved)) return saved;
  } catch {
    // Storage can be blocked; the default applies.
  }
  return DEFAULT_EXPORT_FORMAT;
}

/** The chosen export format, remembered in localStorage (US-44, US-50). */
export function useExportFormat(): [ExportFormat, (format: ExportFormat) => void] {
  const [format, setFormat] = useState(load);
  const choose = useCallback((next: ExportFormat) => {
    setFormat(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not remembered, still applied for this visit.
    }
  }, []);
  return [format, choose];
}
