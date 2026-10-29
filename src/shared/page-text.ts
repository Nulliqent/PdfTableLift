/**
 * The contract between the PDF Reader (which produces it) and the Engine (which consumes it).
 * Kept here so neither module has to import the other. Coordinates are in PDF points.
 */
export type TextItem = { str: string; x: number; y: number; w: number; h: number; bold: boolean };

export type PageText = { num: number; w: number; h: number; items: TextItem[] };
