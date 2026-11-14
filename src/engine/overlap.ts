/**
 * Bounding-box overlap, shared by everything that hides a Detected Table because the user
 * said so: Removed Tables (more than 60%) and Hand-drawn Tables (more than 30%).
 */
import type { Bbox } from "./detection";

/** Overlap needed for a Removed Table to keep hiding a re-detected Table. */
export const REMOVED_TABLE_OVERLAP = 0.6;
/** Overlap needed for a Hand-drawn Table to suppress a Detected Table. */
export const HAND_DRAWN_OVERLAP = 0.3;

/** The intersection's area as a fraction of the smaller box's area (0 when disjoint). */
export function overlapRatio(a: Bbox, b: Bbox): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const area = (r: Bbox) => (r[2] - r[0]) * (r[3] - r[1]);
  return (w * h) / Math.max(1, Math.min(area(a), area(b)));
}
