/**
 * FighterFactory — input text → (raster → features → stats → 3D template), cached by text.
 */
import { analyzeMask, type GlyphFeatures } from '../core/glyph/GlyphAnalyzer';
import { processInput, MAX_GRAPHEMES, type ProcessedInput } from '../core/InputProcessor';
import { generateSpec, type FighterSpec } from '../core/StatGenerator';
import { buildGlyphModel, type GlyphTemplate } from './Glyph3DFactory';
import { renderGlyph, type GlyphRaster } from './GlyphRenderer';

export interface FighterBundle {
  input: ProcessedInput;
  raster: GlyphRaster;
  features: GlyphFeatures;
  spec: FighterSpec;
  template: GlyphTemplate;
  /** i18n keys (+ params) of notices to show next to the input. */
  warnings: { key: string; n?: number }[];
  buildMs: number;
}

export type BuildResult = { ok: true; bundle: FighterBundle } | { ok: false; reason: 'empty' | 'invisible' };

const CACHE_LIMIT = 16;
const cache = new Map<string, Promise<FighterBundle>>();
const inUse = new Map<string, number>();

export function retain(b: FighterBundle): void {
  inUse.set(b.input.text, (inUse.get(b.input.text) ?? 0) + 1);
}
export function release(b: FighterBundle): void {
  const n = (inUse.get(b.input.text) ?? 1) - 1;
  if (n <= 0) inUse.delete(b.input.text);
  else inUse.set(b.input.text, n);
  evict();
}

function evict(): void {
  if (cache.size <= CACHE_LIMIT) return;
  for (const [key, p] of cache) {
    if (cache.size <= CACHE_LIMIT) break;
    if (inUse.has(key)) continue;
    cache.delete(key);
    p.then((b) => b.template.dispose()).catch(() => undefined);
  }
}

export async function buildFighter(raw: string): Promise<BuildResult> {
  const input = processInput(raw);
  if (!input.ok) return { ok: false, reason: input.reason };
  const key = input.text;
  let p = cache.get(key);
  if (p) {
    // Refresh LRU order.
    cache.delete(key);
    cache.set(key, p);
  } else {
    p = create(input);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    evict();
  }
  return { ok: true, bundle: await p };
}

async function create(input: ProcessedInput): Promise<FighterBundle> {
  const t0 = performance.now();
  const raster = await renderGlyph(input);
  const features = analyzeMask(raster.mask, raster.pxToWorld)!;
  // Shape stats come from the ink; the plate only changes the physical outline.
  const shape = raster.plate ? analyzeMask(raster.plate, raster.pxToWorld)! : features;
  const preDims = { width: shape.widthWorld, height: shape.heightWorld, depth: 0.36 };
  const spec0 = generateSpec(input, features, preDims, raster.fontKey);
  const { template, fellBack } = buildGlyphModel(raster, spec0.hue);
  const spec = { ...spec0, height: template.height, depth: template.depth };
  const warnings: FighterBundle['warnings'] = raster.warnings.map((key) => ({ key }));
  if (input.truncated) warnings.unshift({ key: 'warnTruncated', n: MAX_GRAPHEMES });
  if (fellBack) warnings.push({ key: 'warnFallback' });
  return { input, raster, features, spec, template, warnings, buildMs: performance.now() - t0 };
}
