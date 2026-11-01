/**
 * The contract between the PDF Reader (which produces it) and the Engine (which consumes it).
 * Kept here so neither module has to import the other. Coordinates are in PDF points.
 */
export type TextItem = { str: string; x: number; y: number; w: number; h: number; bold: boolean };

/**
 * One page. `w`, `h` and `origin` are the page box (its CropBox) in the same frame as the items:
 * the page's unrotated user space, so a page with /Rotate keeps its unrotated size. `origin` is the
 * box's lower-left corner, left out when it is 0,0, as it is for most pages.
 */
export type PageText = {
  num: number;
  w: number;
  h: number;
  origin?: [number, number];
  items: TextItem[];
};

/** The page box as [x0, y0, x1, y1], in the frame of the page's items. */
export function pageBox(page: PageText): [number, number, number, number] {
  const [x, y] = page.origin ?? [0, 0];
  return [x, y, x + page.w, y + page.h];
}
