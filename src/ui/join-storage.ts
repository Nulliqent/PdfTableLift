import { DEFAULT_SETTINGS } from "../engine";

const KEY = "table-lift.join";

/** The saved join switch; a missing, unreadable or unrecognised value gives the default (on). */
export function loadJoin(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "1" ? true : raw === "0" ? false : DEFAULT_SETTINGS.join;
  } catch {
    return DEFAULT_SETTINGS.join;
  }
}

export function saveJoin(value: boolean): void {
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // Storage can be blocked or full; the setting just isn't remembered.
  }
}
