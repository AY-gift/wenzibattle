/**
 * Pure bitmap helpers used by the glyph pipeline. A Mask is a coverage grid in [0,1]
 * (row-major, y down). These functions run in Node as well as in the browser.
 */

export interface Mask {
  w: number;
  h: number;
  a: Float32Array;
}

export function createMask(w: number, h: number): Mask {
  return { w, h, a: new Float32Array(w * h) };
}

export interface BBox {
  x0: number;
  y0: number;
  x1: number; // inclusive
  y1: number; // inclusive
}

export function inkBBox(m: Mask, iso = 0.5): BBox | null {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (m.a[y * m.w + x] >= iso) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export function inkCount(m: Mask, iso = 0.5): number {
  let n = 0;
  for (let i = 0; i < m.a.length; i++) if (m.a[i] >= iso) n++;
  return n;
}

const INF = 1e20;

/** 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Euclidean distance from every pixel to the nearest pixel where `isSeed` is true. */
export function distanceTo(m: Mask, isSeed: (v: number) => boolean): Float32Array {
  const { w, h } = m;
  const n = Math.max(w, h);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = isSeed(m.a[i]) ? 0 : INF;
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}

/** Grow (r>0) or shrink (r<0) the shape by r pixels, returning a smooth (anti-aliased) mask. */
export function offsetMask(m: Mask, r: number, iso = 0.5): Mask {
  const out = createMask(m.w, m.h);
  if (r >= 0) {
    const d = distanceTo(m, (v) => v >= iso);
    for (let i = 0; i < d.length; i++) out.a[i] = clamp01(1 + r - d[i]);
  } else {
    const d = distanceTo(m, (v) => v < iso);
    for (let i = 0; i < d.length; i++) out.a[i] = clamp01(d[i] + r);
  }
  return out;
}

/** Morphological closing: grow by r then shrink by `shrink` (≤ r). Fills gaps, joins islands. */
export function closeMask(m: Mask, r: number, shrink = r): Mask {
  return offsetMask(offsetMask(m, r), -shrink);
}

/** Pad the mask by p pixels on every side. */
export function padMask(m: Mask, p: number): Mask {
  const out = createMask(m.w + 2 * p, m.h + 2 * p);
  for (let y = 0; y < m.h; y++) out.a.set(m.a.subarray(y * m.w, (y + 1) * m.w), (y + p) * out.w + p);
  return out;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Label connected ink components (8-connectivity). Returns count and per-pixel labels (0 = none). */
export function labelComponents(m: Mask, iso = 0.5, ink = true): { count: number; labels: Int32Array; sizes: number[] } {
  const { w, h } = m;
  const labels = new Int32Array(w * h);
  const stack: number[] = [];
  const sizes: number[] = [0];
  let count = 0;
  const isOn = (i: number) => (m.a[i] >= iso) === ink;
  for (let i = 0; i < w * h; i++) {
    if (labels[i] || !isOn(i)) continue;
    count++;
    let size = 0;
    labels[i] = count;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      const x = j % w;
      const y = (j - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!ink && dx && dy) continue; // background uses 4-connectivity
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (!labels[k] && isOn(k)) {
            labels[k] = count;
            stack.push(k);
          }
        }
      }
    }
    sizes.push(size);
  }
  return { count, labels, sizes };
}

/** Number of enclosed background regions (holes such as the four cells of 田). */
export function countHoles(m: Mask, iso = 0.5, minSize = 4): number {
  const { labels, count, sizes } = labelComponents(m, iso, false);
  const touchesBorder = new Uint8Array(count + 1);
  const { w, h } = m;
  for (let x = 0; x < w; x++) {
    touchesBorder[labels[x]] = 1;
    touchesBorder[labels[(h - 1) * w + x]] = 1;
  }
  for (let y = 0; y < h; y++) {
    touchesBorder[labels[y * w]] = 1;
    touchesBorder[labels[y * w + w - 1]] = 1;
  }
  let holes = 0;
  for (let c = 1; c <= count; c++) if (!touchesBorder[c] && sizes[c] >= minSize) holes++;
  return holes;
}

/** Draw a filled axis-aligned rectangle (test helper / synthetic shapes). */
export function fillRect(m: Mask, x0: number, y0: number, x1: number, y1: number, v = 1): void {
  for (let y = Math.max(0, y0); y < Math.min(m.h, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(m.w, x1); x++) m.a[y * m.w + x] = v;
}

export function fillCircle(m: Mask, cx: number, cy: number, r: number, v = 1): void {
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m.a[y * m.w + x] = v;
}
