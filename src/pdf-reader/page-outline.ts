/** A box in PDF coordinates: [x0, y0, x1, y1], y up. */
export type PdfBox = readonly [number, number, number, number];

/** The part of a pdf.js PageViewport that outlines need. */
export type ViewportLike = {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
  convertToPdfPoint(x: number, y: number): number[];
};

/** A box on a rendered page, as fractions (0 to 1) of the page's width and height. */
export type OutlineBox = { left: number; top: number; width: number; height: number };

/**
 * Maps a bbox in PDF space (y up) to a box on the rendered page. Fractions keep the box aligned
 * with the text when the canvas is scaled by CSS. Two points, because pdf.js 6 removed
 * convertToViewportRectangle.
 */
export function outlineBox(viewport: ViewportLike, bbox: PdfBox): OutlineBox {
  const [x1, y1] = viewport.convertToViewportPoint(bbox[0], bbox[1]) as [number, number];
  const [x2, y2] = viewport.convertToViewportPoint(bbox[2], bbox[3]) as [number, number];
  return {
    left: Math.min(x1, x2) / viewport.width,
    top: Math.min(y1, y2) / viewport.height,
    width: Math.abs(x2 - x1) / viewport.width,
    height: Math.abs(y2 - y1) / viewport.height,
  };
}

/**
 * The inverse of `outlineBox`: a box dragged on the rendered page (fractions of its width and
 * height, any two opposite corners) as a bbox in PDF space, [x0, y0, x1, y1] with y up.
 */
export function pdfBox(viewport: ViewportLike, box: OutlineBox): PdfBox {
  const [x1, y1] = viewport.convertToPdfPoint(
    box.left * viewport.width,
    box.top * viewport.height,
  ) as [number, number];
  const [x2, y2] = viewport.convertToPdfPoint(
    (box.left + box.width) * viewport.width,
    (box.top + box.height) * viewport.height,
  ) as [number, number];
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}
