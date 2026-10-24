import { analyzeMask, type GlyphFeatures } from '../src/core/glyph/GlyphAnalyzer';
import { createMask, fillCircle, fillRect, type Mask } from '../src/core/glyph/mask';
import { processInput, type ProcessedInput } from '../src/core/InputProcessor';
import { generateSpec, type FighterSpec } from '../src/core/StatGenerator';

/** A few synthetic "glyph" bitmaps standing in for canvas rendering in Node. */
export const SHAPES: Record<string, (m: Mask) => void> = {
  // 田: square frame with a cross → 4 holes.
  field(m) {
    fillRect(m, 20, 20, 140, 140);
    fillRect(m, 34, 34, 74, 74, 0);
    fillRect(m, 86, 34, 126, 74, 0);
    fillRect(m, 34, 86, 74, 126, 0);
    fillRect(m, 86, 86, 126, 126, 0);
  },
  // 川: three thin vertical strokes.
  river(m) {
    fillRect(m, 30, 20, 44, 140);
    fillRect(m, 74, 30, 88, 130);
    fillRect(m, 118, 20, 132, 140);
  },
  // 一: one wide flat bar.
  bar(m) {
    fillRect(m, 15, 72, 145, 90);
  },
  // ■ solid block.
  block(m) {
    fillRect(m, 25, 25, 135, 135);
  },
  // ● disc.
  disc(m) {
    fillCircle(m, 80, 80, 60);
  },
  // ・ tiny dot.
  dot(m) {
    fillCircle(m, 80, 80, 9);
  },
  // T-ish top-heavy shape.
  tee(m) {
    fillRect(m, 20, 20, 140, 45);
    fillRect(m, 70, 45, 90, 140);
  },
};

export function shapeMask(name: keyof typeof SHAPES): Mask {
  const m = createMask(160, 160);
  SHAPES[name](m);
  return m;
}

export function featuresOf(name: keyof typeof SHAPES, pxToWorld = 1.7 / 140): GlyphFeatures {
  return analyzeMask(shapeMask(name), pxToWorld)!;
}

export function specFor(text: string, shape: keyof typeof SHAPES): FighterSpec {
  const p = processInput(text) as ProcessedInput;
  const f = featuresOf(shape);
  return generateSpec(p, f, { width: f.widthWorld, height: f.heightWorld, depth: 0.36 }, 'test-font');
}

export const ROSTER: [string, keyof typeof SHAPES][] = [
  ['田', 'field'], ['川', 'river'], ['一', 'bar'], ['■', 'block'], ['●', 'disc'], ['・', 'dot'], ['T', 'tee'],
  ['火', 'tee'], ['水', 'river'], ['怒', 'field'], ['眠', 'disc'], ['飛', 'river'], ['急', 'tee'], ['逃', 'disc'],
  ['屁', 'block'], ['王', 'field'], ['💀', 'disc'], ['🍣', 'bar'], ['♥', 'disc'], ['？', 'tee'], ['猫', 'disc'],
  ['龍', 'field'], ['💣', 'disc'], ['👻', 'disc'], ['∞', 'bar'], ['雷', 'field'], ['笑', 'tee'], ['★', 'tee'],
];
