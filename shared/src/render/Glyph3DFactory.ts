/**
 * Glyph3DFactory — turns a GlyphRaster into a Three.js model.
 *  - Outlines are traced from the mask and extruded with a bevel (real 3D geometry).
 *  - Colour inputs get the texture on the front/back caps of a thick silhouette.
 *  - If extrusion fails or produces garbage, a textured rounded tile is used instead.
 * The visual model is independent from collision (the simulator uses a simple cylinder).
 */
import * as THREE from 'three';
import { extractOutlines, type Polygon, type ShapeOutline } from '../core/glyph/contour';
import { inkBBox, type Mask } from '../core/glyph/mask';
import type { GlyphRaster } from './GlyphRenderer';

export interface GlyphTemplate {
  width: number;
  height: number;
  depth: number;
  method: 'extrude' | 'plate' | 'sticker' | 'slab';
  triangles: number;
  /** Shared geometry + template materials (read-only; used for instanced crowds). */
  parts: ReadonlyArray<{ geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] }>;
  /** Builds a scene instance (shares geometry, owns its materials). */
  instantiate(): GlyphInstance;
  dispose(): void;
}

export interface GlyphInstance {
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  dispose(): void;
}

interface Part {
  geometry: THREE.BufferGeometry;
  materials: THREE.MeshStandardMaterial[];
}

const TEXT_DEPTH = 0.36;
const PLATE_DEPTH = 0.2;
const STICKER_DEPTH = 0.26;

function polyToPath<T extends THREE.Path>(poly: Polygon, P: new () => T, toWorld: (x: number, y: number) => [number, number]): T {
  const path = new P();
  poly.forEach(([x, y], i) => {
    const [wx, wy] = toWorld(x, y);
    if (i === 0) path.moveTo(wx, wy);
    else path.lineTo(wx, wy);
  });
  path.closePath();
  return path;
}

function outlinesToShapes(outlines: ShapeOutline[], toWorld: (x: number, y: number) => [number, number], withHoles = true): THREE.Shape[] {
  return outlines.map((o) => {
    const s = polyToPath(o.outer, THREE.Shape, toWorld);
    if (withHoles) for (const h of o.holes) s.holes.push(polyToPath(h, THREE.Path, toWorld));
    return s;
  });
}

function validGeometry(g: THREE.BufferGeometry): boolean {
  const pos = g.getAttribute('position');
  if (!pos || pos.count < 3) return false;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  g.computeBoundingBox();
  const s = g.boundingBox!.getSize(new THREE.Vector3());
  return s.x > 0.02 && s.y > 0.02;
}

function extrude(shapes: THREE.Shape[], depth: number, bevel: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel * 1.2,
    bevelSize: bevel,
    // Bevel grows inward from the outline, so neighbouring strokes never fuse.
    bevelOffset: -bevel,
    bevelSegments: 2,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** Planar UVs so a texture covering the whole raster canvas lands on the caps. */
function applyPlanarUV(g: THREE.BufferGeometry, r: GlyphRaster, cx: number, cy: number): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const W = r.texture!.width, H = r.texture!.height, s = r.pxToWorld;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) / s + cx;
    const py = cy - pos.getY(i) / s;
    uv[i * 2] = px / W;
    uv[i * 2 + 1] = 1 - py / H;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function hsl(h: number, s: number, l: number): THREE.Color {
  return new THREE.Color().setHSL(((h % 360) + 360) % 360 / 360, s, l, THREE.SRGBColorSpace);
}

function mat(color: THREE.Color, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.04, ...opts });
}

export function buildGlyphModel(r: GlyphRaster, hue: number): { template: GlyphTemplate; fellBack: boolean } {
  const ref: Mask = r.plate ?? r.mask;
  const bb = inkBBox(ref)!;
  const cx = (bb.x0 + bb.x1 + 1) / 2, cy = (bb.y0 + bb.y1 + 1) / 2;
  const s = r.pxToWorld;
  const toWorld = (x: number, y: number): [number, number] => [(x - cx) * s, (cy - y) * s];
  const width = (bb.x1 - bb.x0 + 1) * s, height = (bb.y1 - bb.y0 + 1) * s;
  const parts: Part[] = [];
  let method: GlyphTemplate['method'] = 'extrude';
  let depth = TEXT_DEPTH;
  let fellBack = false;
  let texture: THREE.CanvasTexture | null = null;

  try {
    if (r.mode === 'text' || r.mode === 'plate') {
      const textCol = hsl(hue, 0.74, 0.56), sideCol = hsl(hue, 0.66, 0.38);
      const outlines = extractOutlines(r.mask, { maxPoints: r.mode === 'plate' ? 1100 : 800, minArea: 2.5 });
      const bevel = Math.min(0.03, 0.012 + s * 0.6);
      const g = extrude(outlinesToShapes(outlines, toWorld), r.mode === 'plate' ? TEXT_DEPTH + 0.04 : TEXT_DEPTH, bevel);
      if (!validGeometry(g)) throw new Error('text extrusion failed');
      parts.push({ geometry: g, materials: [mat(textCol), mat(sideCol)] });
      if (r.mode === 'plate' && r.plate) {
        method = 'plate';
        const plateOut = extractOutlines(r.plate, { maxPoints: 300, minArea: 20, eps: 0.8 });
        const pg = extrude(outlinesToShapes(plateOut, toWorld, false), PLATE_DEPTH, 0.035);
        if (!validGeometry(pg)) throw new Error('plate extrusion failed');
        parts.push({ geometry: pg, materials: [mat(hsl(hue, 0.55, 0.93), { roughness: 0.5 }), mat(hsl(hue, 0.4, 0.78), { roughness: 0.5 })] });
        depth = TEXT_DEPTH + 0.04;
      }
    } else if (r.mode === 'sticker' && r.texture && r.plate) {
      method = 'sticker';
      depth = STICKER_DEPTH;
      const outlines = extractOutlines(r.plate, { maxPoints: 500, minArea: 20, eps: 0.6 });
      const g = extrude(outlinesToShapes(outlines, toWorld, false), STICKER_DEPTH, 0.03);
      if (!validGeometry(g)) throw new Error('sticker extrusion failed');
      applyPlanarUV(g, r, cx, cy);
      texture = makeTexture(r.texture);
      parts.push({ geometry: g, materials: [mat(new THREE.Color(0xffffff), { map: texture, roughness: 0.3 }), mat(new THREE.Color(0xf3f1ff), { roughness: 0.45 })] });
    } else throw new Error('box');
  } catch {
    for (const p of parts) p.geometry.dispose();
    parts.length = 0;
    fellBack = r.mode !== 'box';
    method = 'slab';
    depth = STICKER_DEPTH + 0.06;
    const tex = r.texture ?? rasterToTexture(r.mask, hue);
    // Rounded tile covering the reference bbox.
    const shape = new THREE.Shape();
    const hw = width / 2, hh = height / 2, rad = Math.min(hw, hh) * 0.25;
    shape.moveTo(-hw + rad, -hh);
    shape.lineTo(hw - rad, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + rad);
    shape.lineTo(hw, hh - rad);
    shape.quadraticCurveTo(hw, hh, hw - rad, hh);
    shape.lineTo(-hw + rad, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - rad);
    shape.lineTo(-hw, -hh + rad);
    shape.quadraticCurveTo(-hw, -hh, -hw + rad, -hh);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    applyPlanarUV(g, { ...r, texture: tex }, cx, cy);
    texture?.dispose();
    texture = makeTexture(tex);
    parts.push({ geometry: g, materials: [mat(new THREE.Color(0xffffff), { map: texture }), mat(hsl(hue, 0.5, 0.75))] });
  }

  let triangles = 0;
  for (const p of parts) {
    const idx = p.geometry.getIndex();
    triangles += (idx ? idx.count : p.geometry.getAttribute('position').count) / 3;
  }
  let refs = 0;
  let disposed = false;
  const template: GlyphTemplate = {
    width,
    height,
    depth,
    method,
    triangles,
    parts,
    instantiate() {
      refs++;
      const group = new THREE.Group();
      const materials: THREE.MeshStandardMaterial[] = [];
      for (const p of parts) {
        const ms = p.materials.map((m) => m.clone());
        materials.push(...ms);
        const mesh = new THREE.Mesh(p.geometry, ms);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        group.add(mesh);
      }
      let released = false;
      return {
        group,
        materials,
        dispose() {
          if (released) return;
          released = true;
          materials.forEach((m) => m.dispose());
          group.removeFromParent();
          refs--;
          if (disposed && refs === 0) freeGpu();
        },
      };
    },
    dispose() {
      disposed = true;
      if (refs === 0) freeGpu();
    },
  };
  function freeGpu(): void {
    for (const p of parts) {
      p.geometry.dispose();
      p.materials.forEach((m) => m.dispose());
    }
    texture?.dispose();
  }
  return { template, fellBack };
}

function makeTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Paint a mask into a texture (used by the slab fallback for plain text). */
function rasterToTexture(m: Mask, hue: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = m.w;
  c.height = m.h;
  const ctx = c.getContext('2d')!;
  const bg = hsl(hue, 0.55, 0.93), fg = hsl(hue, 0.7, 0.45);
  ctx.fillStyle = `#${bg.getHexString()}`;
  ctx.fillRect(0, 0, m.w, m.h);
  const img = ctx.getImageData(0, 0, m.w, m.h);
  const fr = fg.r * 255, fgc = fg.g * 255, fb = fg.b * 255;
  for (let i = 0; i < m.a.length; i++) {
    const a = m.a[i];
    img.data[i * 4] = img.data[i * 4] * (1 - a) + fr * a;
    img.data[i * 4 + 1] = img.data[i * 4 + 1] * (1 - a) + fgc * a;
    img.data[i * 4 + 2] = img.data[i * 4 + 2] * (1 - a) + fb * a;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
