import type { Bbox } from "./detection";

/**
 * The share of the smaller box that two boxes have in common, from 0 to 1. Hand-drawn Tables use
 * it with a threshold of 0.3 to take over the Detected Tables they cover; Removed Tables use 0.6.
 */
export function overlapShare(a: Bbox, b: Bbox): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const area = (r: Bbox) => (r[2] - r[0]) * (r[3] - r[1]);
  return (w * h) / Math.max(1, Math.min(area(a), area(b)));
}
