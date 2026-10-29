import type { Table } from "../engine";

/** "Page 2", or "Pages 2–3" for a Joined Table. */
export function pageLabel(table: Pick<Table, "parts">): string {
  const a = table.parts[0]!.page;
  const b = table.parts[table.parts.length - 1]!.page;
  return a === b ? `Page ${a}` : `Pages ${a}–${b}`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
