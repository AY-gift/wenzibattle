/**
 * Contour extraction: marching squares on a coverage mask → closed polygons with sub-pixel
 * precision, Douglas–Peucker simplification, and outer/hole nesting for extrusion.
 */
import type { Mask } from './mask';

export type Pt = [number, number];
export type Polygon = Pt[];

export interface ShapeOutline {
  outer: Polygon;
  holes: Polygon[];
}

// Cell corners: c0 top-left, c1 top-right, c2 bottom-right, c3 bottom-left.
// Edges: 0 top, 1 right, 2 bottom, 3 left.
const SEGMENTS: Record<number, number[][]> = {
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]],
  9: [[0, 2]],
  11: [[1, 2]],
  12: [[3, 1]],
  13: [[0, 1]],
  14: [[3, 0]],
};

/** Trace iso-contours of the mask. Coordinates are in pixel-centre space. */
export function traceContours(m: Mask, iso = 0.5): Polygon[] {
  const { w, h, a } = m;
  const val = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[y * w + x]);
  // Cells span sample points from -1..w-1, so contours always close against the zero border.
  const cw = w + 1;
  const ch = h + 1;
  // Edge ids: horizontal edge from sample (x,y) to (x+1,y): 2*((y+1)*(cw+1)+(x+1)); vertical: +1.
  const hid = (x: number, y: number) => 2 * ((y + 1) * (cw + 1) + (x + 1));
  const vid = (x: number, y: number) => 2 * ((y + 1) * (cw + 1) + (x + 1)) + 1;
  const points = new Map<number, Pt>();
  const adj = new Map<number, number[]>();
  const link = (e1: number, e2: number) => {
    let l = adj.get(e1);
    if (!l) adj.set(e1, (l = []));
    l.push(e2);
    let r = adj.get(e2);
    if (!r) adj.set(e2, (r = []));
    r.push(e1);
  };
  const lerp = (va: number, vb: number) => {
    const d = vb - va;
    return Math.abs(d) < 1e-6 ? 0.5 : Math.min(1, Math.max(0, (iso - va) / d));
  };
  for (let y = -1; y < ch - 1; y++) {
    for (let x = -1; x < cw - 1; x++) {
      const v0 = val(x, y), v1 = val(x + 1, y), v2 = val(x + 1, y + 1), v3 = val(x, y + 1);
      const c = (v0 >= iso ? 1 : 0) | (v1 >= iso ? 2 : 0) | (v2 >= iso ? 4 : 0) | (v3 >= iso ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const edgeId = [hid(x, y), vid(x + 1, y), hid(x, y + 1), vid(x, y)];
      const ensure = (e: number) => {
        const id = edgeId[e];
        if (points.has(id)) return id;
        let p: Pt;
        if (e === 0) p = [x + lerp(v0, v1), y];
        else if (e === 1) p = [x + 1, y + lerp(v1, v2)];
        else if (e === 2) p = [x + lerp(v3, v2), y + 1];
        else p = [x, y + lerp(v0, v3)];
        points.set(id, p);
        return id;
      };
      let segs = SEGMENTS[c];
      if (c === 5 || c === 10) {
        const center = (v0 + v1 + v2 + v3) / 4 >= iso;
        if (c === 5) segs = center ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
        else segs = center ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
      }
      for (const [ea, eb] of segs) link(ensure(ea), ensure(eb));
    }
  }
  // Walk loops.
  const visited = new Set<number>();
  const loops: Polygon[] = [];
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const loop: Polygon = [];
    let prev = -1;
    let cur = start;
    for (let guard = 0; guard < 1e6; guard++) {
      visited.add(cur);
      loop.push(points.get(cur)!);
      const nb = adj.get(cur)!;
      const next = nb[0] !== prev ? nb[0] : nb[1];
      if (next === undefined || next === start) break;
      if (visited.has(next)) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export function polygonArea(p: Polygon): number {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return s / 2;
}

export function polygonPerimeter(p: Polygon): number {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]);
  return s;
}

export function pointInPolygon(pt: Pt, poly: Polygon): boolean {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

function dpOpen(pts: Polygon, eps: number): Polygon {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = perpDist(pts[i], pts[i0], pts[i1]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Douglas–Peucker for a closed ring. Always keeps at least 3 points. */
export function simplifyClosed(poly: Polygon, eps: number): Polygon {
  if (poly.length <= 4) return poly.slice();
  // Split at the vertex farthest from vertex 0.
  let far = 0, farD = -1;
  for (let i = 1; i < poly.length; i++) {
    const d = (poly[i][0] - poly[0][0]) ** 2 + (poly[i][1] - poly[0][1]) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = dpOpen(poly.slice(0, far + 1), eps);
  const b = dpOpen([...poly.slice(far), poly[0]], eps);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : poly.slice(0, 3);
}

/**
 * Group contours into outer shapes with holes using even–odd nesting depth.
 * `minArea` drops specks, but never the only contour, so tiny dots like ・ survive.
 */
export function nestContours(contours: Polygon[], minArea = 2): ShapeOutline[] {
  const items = contours
    .map((p) => ({ p, area: Math.abs(polygonArea(p)) }))
    .filter((c) => c.area >= minArea)
    .sort((x, y) => y.area - x.area);
  const depth: number[] = items.map(() => 0);
  const parent: number[] = items.map(() => -1);
  for (let i = 0; i < items.length; i++) {
    const probe = items[i].p[0];
    for (let j = 0; j < i; j++) {
      // Only larger contours can contain smaller ones (sorted by area desc).
      if (pointInPolygon(probe, items[j].p)) {
        depth[i]++;
        // Smallest container seen last because of the sort order.
        parent[i] = j;
      }
    }
  }
  const shapes: ShapeOutline[] = [];
  const shapeOf = new Map<number, ShapeOutline>();
  for (let i = 0; i < items.length; i++) {
    if (depth[i] % 2 === 0) {
      const s: ShapeOutline = { outer: items[i].p, holes: [] };
      shapes.push(s);
      shapeOf.set(i, s);
    }
  }
  for (let i = 0; i < items.length; i++) {
    if (depth[i] % 2 === 1 && parent[i] >= 0) shapeOf.get(parent[i])?.holes.push(items[i].p);
  }
  return shapes;
}

export function countPoints(shapes: ShapeOutline[]): number {
  let n = 0;
  for (const s of shapes) {
    n += s.outer.length;
    for (const h of s.holes) n += h.length;
  }
  return n;
}

/** Trace + nest + simplify with an adaptive tolerance so the total vertex count stays under budget. */
export function extractOutlines(m: Mask, opts: { maxPoints?: number; minArea?: number; eps?: number } = {}): ShapeOutline[] {
  const maxPoints = opts.maxPoints ?? 900;
  const raw = nestContours(traceContours(m), opts.minArea ?? 2);
  let eps = opts.eps ?? 0.45;
  for (let iter = 0; iter < 8; iter++) {
    const simplified = raw.map((s) => ({
      outer: simplifyClosed(s.outer, eps),
      holes: s.holes.map((h) => simplifyClosed(h, eps)).filter((h) => h.length >= 3 && Math.abs(polygonArea(h)) > 0.5),
    }));
    if (countPoints(simplified) <= maxPoints || iter === 7) return simplified;
    eps *= 1.6;
  }
  return raw;
}
