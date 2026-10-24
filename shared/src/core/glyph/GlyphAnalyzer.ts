/**
 * GlyphAnalyzer — measures the visual shape of a glyph mask. Every number here is a
 * plain, explainable geometric quantity; StatGenerator turns them into fighter stats.
 */
import { countHoles, inkBBox, labelComponents, type Mask } from './mask';

export interface GlyphFeatures {
  /** Ink area in world units² (after the glyph has been sized for the arena). */
  areaWorld: number;
  /** Tight bounding box size in world units. */
  widthWorld: number;
  heightWorld: number;
  /** ink pixels / bbox pixels. */
  fillRatio: number;
  /** width / height of the tight bbox. */
  aspect: number;
  /** Visual centre of mass in bbox-normalized coordinates. cx 0=left, cy 0=bottom. */
  cx: number;
  cy: number;
  /** Fraction of the bbox width covered by ink in the bottom 15% (a "foot"). */
  baseRatio: number;
  /** Ink share in the top third vs bottom third: 0 bottom-heavy … 1 top-heavy. */
  topHeavy: number;
  /** Mean stroke thickness in world units (2·area / perimeter). */
  strokeWorld: number;
  /** Isoperimetric ratio, ≥ 1 (circle = 1). Higher = spikier / more intricate. */
  spikiness: number;
  /** Enclosed background regions (田 → 4). */
  holes: number;
  /** Separate ink islands (川 → 3). */
  components: number;
  /** Left/right mirror IoU, 0…1. */
  symmetry: number;
  /** Count of ink pixels (for diagnostics). */
  inkPixels: number;
}

export function analyzeMask(m: Mask, pxToWorld: number, iso = 0.5): GlyphFeatures | null {
  const bb = inkBBox(m, iso);
  if (!bb) return null;
  const bw = bb.x1 - bb.x0 + 1;
  const bh = bb.y1 - bb.y0 + 1;
  let ink = 0, sx = 0, sy = 0, edges = 0, top = 0, bottom = 0;
  const baseRows = Math.max(1, Math.round(bh * 0.15));
  const baseCols = new Uint8Array(bw);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.a[y * m.w + x] >= iso;
  for (let y = bb.y0; y <= bb.y1; y++) {
    for (let x = bb.x0; x <= bb.x1; x++) {
      if (!on(x, y)) continue;
      ink++;
      sx += x;
      sy += y;
      const ry = (y - bb.y0) / bh;
      if (ry < 1 / 3) top++;
      else if (ry >= 2 / 3) bottom++;
      if (y > bb.y1 - baseRows) baseCols[x - bb.x0] = 1;
      // 4-neighbour boundary edges ≈ perimeter in pixels.
      if (!on(x - 1, y)) edges++;
      if (!on(x + 1, y)) edges++;
      if (!on(x, y - 1)) edges++;
      if (!on(x, y + 1)) edges++;
    }
  }
  // Pixel-edge perimeter overestimates diagonal contours by ~4/π; correct for it.
  const perimeter = edges * (Math.PI / 4);
  let mirrorHit = 0;
  for (let y = bb.y0; y <= bb.y1; y++) {
    for (let x = bb.x0; x <= bb.x1; x++) {
      if (on(x, y) && on(bb.x1 - (x - bb.x0), y)) mirrorHit++;
    }
  }
  let base = 0;
  for (let i = 0; i < bw; i++) base += baseCols[i];
  const comps = labelComponents(m, iso, true);
  const significant = comps.sizes.slice(1).filter((s) => s >= Math.max(3, ink * 0.004)).length;
  const s2 = pxToWorld * pxToWorld;
  return {
    areaWorld: ink * s2,
    widthWorld: bw * pxToWorld,
    heightWorld: bh * pxToWorld,
    fillRatio: ink / (bw * bh),
    aspect: bw / bh,
    cx: (sx / ink - bb.x0 + 0.5) / bw,
    cy: 1 - (sy / ink - bb.y0 + 0.5) / bh,
    baseRatio: base / bw,
    topHeavy: top + bottom > 0 ? top / (top + bottom) : 0.5,
    strokeWorld: ((2 * ink) / Math.max(1, perimeter)) * pxToWorld,
    spikiness: perimeter / (2 * Math.sqrt(Math.PI * ink)),
    holes: countHoles(m, iso, Math.max(4, Math.round(ink * 0.002))),
    components: Math.max(1, significant),
    symmetry: mirrorHit / ink,
    inkPixels: ink,
  };
}
