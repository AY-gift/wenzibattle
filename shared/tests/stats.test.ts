import { describe, expect, it } from 'vitest';
import { elementMultiplier, resolveBehavior } from '../src/core/BehaviorResolver';
import { processInput, type ProcessedInput } from '../src/core/InputProcessor';
import { generateSpec } from '../src/core/StatGenerator';
import { featuresOf, specFor } from './helpers';

const combat = (s: { speed: number; attack: number; defense: number; stability: number }) => (s.speed + s.attack + s.defense + s.stability) / 4;

describe('StatGenerator', () => {
  it('is deterministic for the same text + font', () => {
    expect(specFor('田', 'field')).toEqual(specFor('田', 'field'));
  });

  it('differs when the font key differs (stats come from the rendered shape)', () => {
    const p = processInput('田') as ProcessedInput;
    const f = featuresOf('field');
    const a = generateSpec(p, f, { width: 1.5, height: 1.5, depth: 0.36 }, 'font-a');
    const b = generateSpec(p, f, { width: 1.5, height: 1.5, depth: 0.36 }, 'font-b');
    expect(a.seed).not.toBe(b.seed);
  });

  it('derives stats from shape, not randomness', () => {
    const field = specFor('田', 'field'); // closed, boxy, heavy
    const river = specFor('川', 'river'); // thin, separate strokes
    const block = specFor('■', 'block');
    const dot = specFor('・', 'dot');
    expect(field.stats.defense).toBeGreaterThan(river.stats.defense);
    expect(river.stats.speed).toBeGreaterThan(field.stats.speed);
    expect(block.stats.weight).toBeGreaterThan(dot.stats.weight);
    expect(dot.mass).toBeLessThan(block.mass);
    expect(field.traits).toContain('fortress');
  });

  it('keeps every combat profile on the same budget (no input is simply stronger)', () => {
    for (const [t, s] of [['田', 'field'], ['川', 'river'], ['一', 'bar'], ['■', 'block'], ['・', 'dot'], ['T', 'tee'], ['●', 'disc']] as const) {
      const spec = specFor(t, s);
      expect(combat(spec.stats), t).toBeGreaterThan(44);
      expect(combat(spec.stats), t).toBeLessThan(56);
      for (const v of Object.values(spec.stats)) {
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
  });

  it('a long or wide input is not automatically stronger', () => {
    const p = processInput('ABCDEFGHIJKLMN') as ProcessedInput;
    const wide = generateSpec(p, featuresOf('bar'), { width: 2.7, height: 0.4, depth: 0.36 }, 'f');
    const one = specFor('A', 'tee');
    expect(Math.abs(combat(wide.stats) - combat(one.stats))).toBeLessThan(8);
    expect(wide.radius).toBeLessThanOrEqual(1.25);
  });
});

describe('BehaviorResolver', () => {
  const tags = (s: string) => resolveBehavior(s, (processInput(s) as ProcessedInput).graphemes).tags;
  it('maps meanings to behaviours across scripts', () => {
    expect(tags('火')).toContain('fire');
    expect(tags('水')).toContain('slippery');
    expect(tags('飛')).toContain('flyer');
    expect(tags('飞')).toContain('flyer'); // simplified
    expect(tags('眠')).toContain('sleepy');
    expect(tags('怒')).toContain('angry');
    expect(tags('💀')).toContain('skull');
    expect(tags('🍣')).toContain('slip');
    expect(tags('♥')).toContain('charm');
    expect(tags('❤️')).toContain('charm');
    expect(tags('？')).toContain('chaos');
    expect(tags('屁')).toContain('gas');
    expect(tags('ಠ_ಠ')).toContain('angry');
    expect(tags('Fire')).toContain('fire'); // latin, case-insensitive
  });

  it('unknown text has no special behaviour but still fights', () => {
    expect(tags('Q')).toEqual([]);
    expect(tags('ゑ')).toEqual([]);
  });

  it('punctuation inside kaomoji does not trigger solo-only rules', () => {
    expect(tags('・')).toContain('tiny');
    expect(tags('(・ω・)')).not.toContain('tiny');
  });

  it('caps the number of tags and dampens stacked modifiers', () => {
    const r = resolveBehavior('火水雷爆怒急', (processInput('火水雷爆怒急') as ProcessedInput).graphemes);
    expect(r.tags.length).toBeLessThanOrEqual(3);
    expect(r.mods.attack).toBeLessThan(0.35);
  });

  it('has elemental matchups', () => {
    expect(elementMultiplier('water', 'fire')).toBeGreaterThan(1);
    expect(elementMultiplier('fire', 'water')).toBe(1);
    expect(elementMultiplier(null, 'fire')).toBe(1);
  });
});
