import { describe, expect, it } from 'vitest';
import { countPoints, extractOutlines, polygonArea, traceContours } from '../src/core/glyph/contour';
import { analyzeMask } from '../src/core/glyph/GlyphAnalyzer';
import { closeMask, countHoles, createMask, fillCircle, fillRect, labelComponents, offsetMask } from '../src/core/glyph/mask';
import { featuresOf, shapeMask } from './helpers';

describe('mask morphology', () => {
  it('counts holes and islands', () => {
    expect(countHoles(shapeMask('field'))).toBe(4);
    expect(labelComponents(shapeMask('river')).count).toBe(3);
    expect(countHoles(shapeMask('block'))).toBe(0);
  });

  it('closing joins nearby islands into one piece', () => {
    const m = shapeMask('river');
    expect(labelComponents(closeMask(m, 20, 12)).count).toBe(1);
  });

  it('offset grows and shrinks by roughly the requested radius', () => {
    const m = createMask(100, 100);
    fillRect(m, 40, 40, 60, 60);
    const grown = offsetMask(m, 5);
    const shrunk = offsetMask(m, -5);
    const count = (x: typeof m) => x.a.reduce((s, v) => s + (v >= 0.5 ? 1 : 0), 0);
    expect(count(grown)).toBeGreaterThan(count(m) * 2);
    expect(count(shrunk)).toBeLessThan(count(m) * 0.4);
  });
});

describe('contour tracing', () => {
  it('traces a square with sub-pixel accuracy', () => {
    const m = createMask(40, 40);
    fillRect(m, 10, 10, 30, 30);
    const loops = traceContours(m);
    expect(loops).toHaveLength(1);
    expect(Math.abs(polygonArea(loops[0]))).toBeGreaterThan(380);
    expect(Math.abs(polygonArea(loops[0]))).toBeLessThan(420);
  });

  it('nests holes inside their outer shape (田 → 1 shape, 4 holes)', () => {
    const shapes = extractOutlines(shapeMask('field'));
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(4);
  });

  it('keeps separate strokes and tiny dots (川 → 3 shapes, ・ survives)', () => {
    expect(extractOutlines(shapeMask('river'))).toHaveLength(3);
    expect(extractOutlines(shapeMask('dot'))).toHaveLength(1);
  });

  it('respects the vertex budget for complex shapes', () => {
    const m = createMask(256, 256);
    for (let i = 0; i < 40; i++) fillCircle(m, 20 + (i % 8) * 30, 20 + Math.floor(i / 8) * 45, 9 + (i % 3));
    const shapes = extractOutlines(m, { maxPoints: 300 });
    expect(countPoints(shapes)).toBeLessThanOrEqual(300);
    expect(shapes.length).toBe(40);
  });
});

describe('GlyphAnalyzer', () => {
  it('measures shape facts that drive stats', () => {
    const field = featuresOf('field');
    const bar = featuresOf('bar');
    const tee = featuresOf('tee');
    const disc = featuresOf('disc');
    expect(field.holes).toBe(4);
    expect(bar.aspect).toBeGreaterThan(5);
    expect(tee.topHeavy).toBeGreaterThan(0.6);
    expect(disc.spikiness).toBeLessThan(1.15);
    expect(featuresOf('river').components).toBe(3);
    expect(disc.symmetry).toBeGreaterThan(0.95);
  });

  it('returns null for an empty mask', () => {
    expect(analyzeMask(createMask(10, 10), 0.01)).toBeNull();
  });
});
