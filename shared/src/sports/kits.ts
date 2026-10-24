/**
 * Team kits for the ball games. Every player of a team wears the team colour (instead of each
 * glyph's own colour) so the two sides are easy to tell apart. The pair is random per match but
 * deterministic per seed (a replay or result link shows the same colours), never green (the
 * pitch) and always clearly different from each other.
 */
import { Rng } from '../core/rng';

export interface Kit {
  id: string;
  name: { ja: string; zh: string; en: string };
  /** Main colour (0xRRGGBB). */
  hex: number;
  css: string;
  /** Text colour on top of the kit colour. */
  on: string;
  /** Readable version of the colour on a white card. */
  ink: string;
  hue: number;
  light: number;
}

const k = (id: string, ja: string, zh: string, en: string, css: string, on: string, ink: string, hue: number, light: number): Kit => ({ id, name: { ja, zh, en }, hex: parseInt(css.slice(1), 16), css, on, ink, hue, light });

export const KITS: Kit[] = [
  k('red', '赤', '红', 'Red', '#ff3b3b', '#fff', '#e02020', 0, 0.6),
  k('blue', '青', '蓝', 'Blue', '#2f7bff', '#fff', '#1f5fd8', 218, 0.6),
  k('yellow', '黄', '黄', 'Yellow', '#ffd23f', '#2b1a4a', '#b38600', 47, 0.62),
  k('orange', 'オレンジ', '橙', 'Orange', '#ff8a1f', '#fff', '#d96500', 28, 0.56),
  k('purple', '紫', '紫', 'Purple', '#8a4dff', '#fff', '#6b2ee0', 262, 0.65),
  k('pink', 'ピンク', '粉', 'Pink', '#ff4fa3', '#fff', '#d8307f', 330, 0.65),
  k('cyan', '水色', '青', 'Cyan', '#26c6da', '#12313a', '#0e8fa0', 187, 0.5),
  k('white', '白', '白', 'White', '#f4f4f4', '#2b1a4a', '#6a6a7a', 0, 0.96),
  k('black', '黒', '黑', 'Black', '#2a2a33', '#fff', '#2a2a33', 240, 0.18),
];

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** Two kits that read as clearly different teams. */
export function kitsContrast(a: Kit, b: Kit): boolean {
  if (a.id === b.id) return false;
  const lightGap = Math.abs(a.light - b.light);
  if (a.id === 'white' || a.id === 'black' || b.id === 'white' || b.id === 'black') return lightGap > 0.4;
  return hueGap(a.hue, b.hue) >= 70 && !(a.id === 'red' && b.id === 'pink') && !(a.id === 'pink' && b.id === 'red');
}

export function kitsFor(seed: number): [Kit, Kit] {
  const rng = new Rng((seed ^ 0x6b17) >>> 0);
  const a = rng.pick(KITS);
  const options = KITS.filter((b) => kitsContrast(a, b));
  return [a, rng.pick(options)];
}
