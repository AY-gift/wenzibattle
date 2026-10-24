/**
 * GlyphRenderer — draws an input with Canvas 2D and returns coverage masks (for shape
 * analysis and contour extraction) plus a colour texture when colour matters (emoji).
 *
 * Modes
 *  - text:    one grapheme of plain text → its own outline is extruded.
 *  - plate:   kaomoji / words → text outlines extruded on a puffy backing plate so the
 *             whole string is one solid character.
 *  - sticker: anything with emoji → colour texture on a thick die-cut silhouette.
 *  - box:     nothing visible could be drawn → "?" tile so a fighter always exists.
 */
import { closeMask, createMask, inkBBox, inkCount, labelComponents, offsetMask, padMask, type Mask } from '../core/glyph/mask';
import { isEmojiGrapheme, type ProcessedInput } from '../core/InputProcessor';

export type RasterMode = 'text' | 'plate' | 'sticker' | 'box';

export interface GlyphRaster {
  mode: RasterMode;
  /** Ink coverage (thickened text, or emoji alpha). */
  mask: Mask;
  /** Backing plate / sticker silhouette (plate & sticker modes). */
  plate?: Mask;
  /** Colour image on the same pixel grid as the masks. */
  texture?: HTMLCanvasElement;
  /** World units per mask pixel, already fitted to the arena size limits. */
  pxToWorld: number;
  fontKey: string;
  warnings: string[];
}

export const FONT_FAMILY = '"M PLUS Rounded 1c"';
const FONT_STACK = `${FONT_FAMILY}, "Hiragino Maru Gothic ProN", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK JP", "Noto Sans JP", "Noto Sans SC", "Nirmala UI", "Noto Sans Kannada", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
const WEIGHT = 800;
/** Lighter weight for very intricate glyphs (龍, 鬱 …) so their strokes don't fuse when extruded. */
const LIGHT_WEIGHT = 500;
const EM_WORLD = 1.7;
const MAX_W = 2.7;
const MAX_H = 2.1;
const MIN_DIM = 0.6;
const MAX_CANVAS = 300;

export const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/';

function font(px: number, weight = WEIGHT): string {
  return `${weight} ${px}px ${FONT_STACK}`;
}

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return { c, ctx };
}

function alphaMask(ctx: CanvasRenderingContext2D, w: number, h: number): Mask {
  const data = ctx.getImageData(0, 0, w, h).data;
  const m = createMask(w, h);
  for (let i = 0; i < w * h; i++) m.a[i] = data[i * 4 + 3] / 255;
  return m;
}

let fontsReady: Promise<void> | null = null;
const loadedFor = new Set<string>();

/** Make sure the bundled rounded font (and its unicode-range slices for `text`) are loaded. */
export async function ensureFont(text: string): Promise<boolean> {
  if (!('fonts' in document)) return false;
  fontsReady ??= document.fonts.ready.then(() => undefined);
  await fontsReady;
  const missing = Array.from(text).filter((ch) => !loadedFor.has(ch)).join('');
  if (!missing) return true;
  try {
    const load = Promise.all([WEIGHT, LIGHT_WEIGHT].map((w) => document.fonts.load(`${w} 64px ${FONT_FAMILY}`, missing)));
    await Promise.race([load, new Promise((r) => setTimeout(r, 2500))]);
    Array.from(missing).forEach((ch) => loadedFor.add(ch));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- tofu detection

let tofuRefs: string[] | null = null;
function glyphSignature(g: string): string {
  const { ctx } = makeCanvas(40, 40);
  ctx.font = font(28);
  ctx.textBaseline = 'middle';
  ctx.fillText(g, 4, 20);
  const d = ctx.getImageData(0, 0, 40, 40).data;
  let s = '';
  for (let i = 3; i < d.length; i += 16) s += d[i] > 127 ? '1' : '0';
  return s;
}
/** Heuristic: the grapheme renders exactly like a known-unassigned code point (or not at all). */
export function looksLikeTofu(g: string): boolean {
  if (/^\s+$/u.test(g)) return false;
  tofuRefs ??= ['͸', '￿', '\u{E01F0}'].map(glyphSignature);
  const sig = glyphSignature(g);
  if (!sig.includes('1')) return true;
  return tofuRefs.includes(sig);
}

// ---------------------------------------------------------------- twemoji

const twemojiCache = new Map<string, Promise<HTMLImageElement | null>>();

export function twemojiCode(g: string): string {
  const s = g.includes('‍') ? g : g.replace(/️/g, '');
  return Array.from(s)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-');
}

function loadTwemoji(g: string): Promise<HTMLImageElement | null> {
  const code = twemojiCode(g);
  let p = twemojiCache.get(code);
  if (!p) {
    p = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(null), 3000);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = `${TWEMOJI_BASE}${code}.svg`;
    });
    twemojiCache.set(code, p);
  }
  return p;
}

let twemojiEnabled = true;
export function setTwemojiEnabled(v: boolean): void {
  twemojiEnabled = v;
}

// ---------------------------------------------------------------- main entry

export async function renderGlyph(input: ProcessedInput): Promise<GlyphRaster> {
  const warnings: string[] = [];
  const emojiOnly = input.kind === 'emoji';
  const textGraphemes = input.graphemes.filter((g) => !isEmojiGrapheme(g));
  await ensureFont(textGraphemes.join(''));
  if (textGraphemes.some(looksLikeTofu)) warnings.push('warnTofu');

  let raster: GlyphRaster | null = null;
  if (emojiOnly && twemojiEnabled) raster = await renderTwemoji(input.graphemes.filter((g) => !/^\s+$/u.test(g)), warnings);
  if (!raster) {
    if (input.hasEmoji) {
      if (emojiOnly && twemojiEnabled) warnings.push('warnNativeEmoji');
      raster = renderTextRaster(input.text, 'sticker', warnings, emojiOnly ? 'native-emoji' : 'mixed');
    } else raster = renderTextRaster(input.text, input.kind === 'glyph' ? 'text' : 'plate', warnings, 'font');
  }
  if (!raster || inkCount(raster.mask) < 12) {
    warnings.push('warnInvisible');
    raster = renderBox(warnings);
  }
  return raster;
}

function measure(text: string, px: number, weight = WEIGHT) {
  const { ctx } = makeCanvas(4, 4);
  ctx.font = font(px, weight);
  const m = ctx.measureText(text);
  const left = m.actualBoundingBoxLeft || 0;
  const right = m.actualBoundingBoxRight || m.width;
  const asc = m.actualBoundingBoxAscent || px * 0.8;
  const desc = m.actualBoundingBoxDescent || px * 0.2;
  return { left, w: Math.max(1, left + right), asc, h: Math.max(1, asc + desc) };
}

/**
 * Stroke complexity: ink perimeter per character, normalised by glyph height.
 * 一 ≈ 2, 火 ≈ 3.7, 猫 ≈ 5, 龍 ≈ 6, 鬱/變 ≈ 8.
 */
function strokeComplexity(m: Mask, chars: number): number {
  const bb = inkBBox(m);
  if (!bb) return 0;
  let edges = 0;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.a[y * m.w + x] >= 0.5;
  for (let y = bb.y0; y <= bb.y1; y++)
    for (let x = bb.x0; x <= bb.x1; x++) {
      if (!on(x, y)) continue;
      if (!on(x - 1, y)) edges++;
      if (!on(x + 1, y)) edges++;
      if (!on(x, y - 1)) edges++;
      if (!on(x, y + 1)) edges++;
    }
  return edges / (2 * (bb.y1 - bb.y0 + 1) * Math.max(1, chars));
}

function renderTextRaster(text: string, mode: RasterMode, warnings: string[], fontTag: string): GlyphRaster | null {
  const colour = mode === 'sticker';
  const chars = Math.max(1, Array.from(text.replace(/\s/gu, '')).length);
  const draw = (weight: number, thicken: number, maxCanvas: number) => {
    const m100 = measure(text, 100, weight);
    // Pick a font size so the canvas stays small but strokes keep enough pixels.
    const fontPx = Math.max(36, Math.min(220, (100 * (maxCanvas - 70)) / Math.max(m100.w, m100.h)));
    const mm = measure(text, fontPx, weight);
    const pad = Math.ceil(fontPx * 0.3 + 6);
    const W = Math.ceil(mm.w + pad * 2), H = Math.ceil(mm.h + pad * 2);
    const { c, ctx } = makeCanvas(W, H);
    ctx.font = font(fontPx, weight);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colour ? '#2b2b33' : '#000';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineJoin = 'round';
    const x = pad + mm.left, y = pad + mm.asc;
    ctx.fillText(text, x, y);
    if (thicken > 0) {
      ctx.lineWidth = fontPx * thicken;
      ctx.strokeText(text, x, y);
    }
    return { c, mask: alphaMask(ctx, W, H), fontPx };
  };

  let weight = WEIGHT;
  let thicken = 0;
  let maxCanvas = MAX_CANVAS;
  if (!colour) {
    // Simple glyphs get slightly fattened (chunky and cute); intricate ones are drawn
    // thinner and larger so the gaps between strokes survive extrusion.
    const complexity = strokeComplexity(draw(WEIGHT, 0, MAX_CANVAS).mask, chars);
    thicken = 0.04 * Math.min(1, Math.max(0, (4.7 - complexity) / 0.9));
    if (complexity >= 5.4) weight = LIGHT_WEIGHT;
    if (complexity >= 4.7) maxCanvas = 380;
  }
  const { c, mask, fontPx } = draw(weight, thicken, maxCanvas);
  if (inkCount(mask) < 12) return null;
  const pxToWorld0 = EM_WORLD / fontPx;
  const fontKey = `${fontTag}:${weight}:${thicken.toFixed(3)}`;
  if (mode === 'text') return finish({ mode, mask, pxToWorld: pxToWorld0, fontKey, warnings });
  const plate = makePlate(mask, fontPx * (mode === 'sticker' ? 0.07 : 0.16), mode === 'sticker' ? 0.15 : 0.55);
  if (mode === 'sticker') return finish({ mode, mask, plate, texture: composeSticker(c, plate), pxToWorld: pxToWorld0, fontKey, warnings });
  return finish({ mode, mask, plate, pxToWorld: pxToWorld0, fontKey, warnings });
}

async function renderTwemoji(gs: string[], warnings: string[]): Promise<GlyphRaster | null> {
  if (gs.length === 0 || gs.length > 6) return null;
  const imgs = await Promise.all(gs.map(loadTwemoji));
  if (imgs.some((i) => !i)) return null;
  const size = gs.length === 1 ? 170 : Math.max(60, Math.floor(230 / gs.length));
  const gap = Math.round(size * 0.04);
  const pad = Math.ceil(size * 0.18 + 6);
  const W = pad * 2 + gs.length * size + (gs.length - 1) * gap, H = pad * 2 + size;
  const { c, ctx } = makeCanvas(W, H);
  try {
    imgs.forEach((img, i) => ctx.drawImage(img!, pad + i * (size + gap), pad, size, size));
    const mask = alphaMask(ctx, W, H); // throws if the canvas got tainted
    const plate = makePlate(mask, size * 0.06, 0.15);
    // A Twemoji glyph spans ~one em.
    return finish({ mode: 'sticker', mask, plate, texture: composeSticker(c, plate), pxToWorld: EM_WORLD / size, fontKey: 'twemoji-15.1', warnings });
  } catch {
    return null;
  }
}

function renderBox(warnings: string[]): GlyphRaster {
  const S = 200;
  const { c, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#fff';
  roundRect(ctx, 30, 30, 140, 140, 28);
  ctx.fill();
  ctx.fillStyle = '#6b5cff';
  ctx.font = font(110);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 100, 106);
  const plate = createMask(S, S);
  const { ctx: pctx } = makeCanvas(S, S);
  roundRect(pctx, 30, 30, 140, 140, 28);
  pctx.fill();
  plate.a.set(alphaMask(pctx, S, S).a);
  return finish({ mode: 'box', mask: plate, plate, texture: c, pxToWorld: 1.3 / 140, fontKey: 'box', warnings });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Backing silhouette: grow the ink, then shrink it partly back (morphological closing),
 * increasing the radius until every island is joined into one piece.
 */
function makePlate(mask: Mask, grow: number, shrinkRatio: number): Mask {
  let r = grow;
  for (let i = 0; i < 4; i++) {
    // Net outward growth stays at grow·(1-shrinkRatio) however large the joining radius gets.
    const plate = closeMask(mask, r, r - grow * (1 - shrinkRatio));
    if (labelComponents(plate).count <= 1) return plate;
    r *= 1.7;
  }
  // Still split (very spread-out input): fall back to a rounded box around everything.
  const bb = inkBBox(mask)!;
  const box = createMask(mask.w, mask.h);
  const g = Math.round(grow);
  for (let y = Math.max(0, bb.y0 - g); y <= Math.min(mask.h - 1, bb.y1 + g); y++)
    for (let x = Math.max(0, bb.x0 - g); x <= Math.min(mask.w - 1, bb.x1 + g); x++) box.a[y * mask.w + x] = 1;
  return offsetMask(offsetMask(box, -g), g);
}

/** White die-cut rim under the colour artwork, like an acrylic sticker. */
function composeSticker(art: HTMLCanvasElement, plate: Mask): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(art.width, art.height);
  const img = ctx.createImageData(art.width, art.height);
  for (let i = 0; i < plate.a.length; i++) {
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.round(Math.min(1, plate.a[i] * 1.5) * 255);
  }
  ctx.putImageData(img, 0, 0);
  ctx.drawImage(art, 0, 0);
  return c;
}

/** Pad the grids a little and fit the world scale into the arena's size limits. */
function finish(r: GlyphRaster): GlyphRaster {
  const p = 2;
  r.mask = padMask(r.mask, p);
  if (r.plate) r.plate = padMask(r.plate, p);
  if (r.texture) {
    const { c, ctx } = makeCanvas(r.texture.width + p * 2, r.texture.height + p * 2);
    ctx.drawImage(r.texture, p, p);
    r.texture = c;
  }
  const bb = inkBBox(r.plate ?? r.mask)!;
  const w = (bb.x1 - bb.x0 + 1) * r.pxToWorld, h = (bb.y1 - bb.y0 + 1) * r.pxToWorld;
  let k = Math.min(1, MAX_W / w, MAX_H / h);
  if (Math.max(w, h) * k < MIN_DIM) k = MIN_DIM / Math.max(w, h);
  r.pxToWorld *= k;
  return r;
}
