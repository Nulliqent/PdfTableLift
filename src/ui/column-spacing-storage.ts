import { DEFAULT_SETTINGS, parseColumnSpacing } from "../engine";

const KEY = "table-lift.columnSpacing";

/** The saved Column Spacing; a missing, unreadable or invalid value gives the default. */
export function loadColumnSpacing(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const value = raw === null || raw.trim() === "" ? null : parseColumnSpacing(Number(raw));
    return value ?? DEFAULT_SETTINGS.columnSpacing;
  } catch {
    return DEFAULT_SETTINGS.columnSpacing;
  }
}

export function saveColumnSpacing(value: number): void {
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // Storage can be blocked or full; the setting just isn't remembered.
  }
}
