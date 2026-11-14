import { useCallback, useState } from "react";
import { DEFAULT_SECTION_MODE, isSectionMode, type SectionMode } from "../engine";

const KEY = "tl-sections";

function load(): SectionMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (isSectionMode(saved)) return saved;
  } catch {
    // Storage can be blocked; the default applies.
  }
  return DEFAULT_SECTION_MODE;
}

/** The chosen Section Mode, remembered in localStorage (US-17, US-50). */
export function useSectionMode(): [SectionMode, (mode: SectionMode) => void] {
  const [mode, setMode] = useState(load);
  const choose = useCallback((next: SectionMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not remembered, still applied for this visit.
    }
  }, []);
  return [mode, choose];
}
