/**
 * Battle report image (PNG, 1200×630 — the size X / LINE / Weibo / OG previews all like).
 * Drawn with Canvas 2D: a screenshot of the ring on the left, the report on the right.
 * Text is fitted (shrink, then ellipsis on grapheme boundaries) so nothing is cut mid-emoji,
 * and the web fonts are loaded for exactly the characters used before drawing.
 */
import { graphemes } from './sns';

export interface CardTeam {
  name: string;
  color: string;
}

export interface CardData {
  /** e.g. 字形乱斗 3D */
  title: string;
  /** e.g. ARENA · 1 VS 1 */
  modeLabel: string;
  teams: [CardTeam, CardTeam];
  /** 「火」获胜！ / 平局 */
  headline: string;
  /** KO · 7.9s */
  detail: string;
  /** Optional score line (HP 62 : 0, or a football score later). */
  score?: string;
  mvp?: { label: string; text: string };
  highlight?: { label: string; text: string };
  /** Site / challenge hint at the bottom. */
  footer: string;
  tag: string;
}

export const CARD_W = 1200;
export const CARD_H = 630;

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans CJK JP", sans-serif, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';

/** Make sure the font subsets for these strings are loaded (fontsource uses unicode-range). */
export async function ensureFonts(texts: string[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = Array.from(new Set(texts.join(''))).join('');
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`800 40px "M PLUS Rounded 1c"`, sample), document.fonts.load(`500 40px "M PLUS Rounded 1c"`, sample)]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, px: number): void {
  ctx.font = `${weight} ${px}px ${FONT}`;
}

/** Largest size (≤ max) at which `text` fits; below `min` the text is ellipsised. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, max: number, min: number, weight = 800): { text: string; px: number } {
  for (let px = max; px >= min; px -= 2) {
    setFont(ctx, weight, px);
    if (ctx.measureText(text).width <= maxW) return { text, px };
  }
  setFont(ctx, weight, min);
  const g = graphemes(text);
  let n = g.length;
  while (n > 1 && ctx.measureText(g.slice(0, n).join('') + '…').width > maxW) n--;
  return { text: g.slice(0, n).join('') + '…', px: min };
}

/** Word wrap that breaks CJK anywhere, spaced languages between words, never inside a grapheme. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const tokens: string[] = [];
  let word = '';
  for (const g of graphemes(text)) {
    if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}「」『』（）、。！？]/u.test(g)) {
      if (word) tokens.push(word);
      word = '';
      tokens.push(g);
    } else if (/\s/.test(g)) {
      word += g;
      tokens.push(word);
      word = '';
    } else word += g;
  }
  if (word) tokens.push(word);
  const lines: string[] = [];
  let line = '';
  for (const tk of tokens) {
    if (line && ctx.measureText(line + tk).width > maxW) {
      lines.push(line.trimEnd());
      line = tk.trimStart();
    } else line += tk;
  }
  if (line) lines.push(line.trimEnd());
  if (lines.length > maxLines) {
    const last = graphemes(lines[maxLines - 1]);
    let n = last.length;
    while (n > 1 && ctx.measureText(last.slice(0, n).join('') + '…').width > maxW) n--;
    lines.length = maxLines;
    lines[maxLines - 1] = last.slice(0, n).join('') + '…';
  }
  return lines;
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

export async function renderCard(card: CardData, shot: HTMLCanvasElement | null): Promise<HTMLCanvasElement> {
  await ensureFonts([card.title, card.modeLabel, card.teams[0].name, card.teams[1].name, card.headline, card.detail, card.score ?? '', card.mvp?.label ?? '', card.mvp?.text ?? '', card.highlight?.label ?? '', card.highlight?.text ?? '', card.footer, card.tag, 'VSMP字']);
  const W = CARD_W, H = CARD_H;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';

  // ---- left: the ring
  const areaW = 600;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3a2a6e');
  bg.addColorStop(1, '#16122b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (shot && shot.width > 0 && shot.height > 0) {
    const scale = Math.max(areaW / shot.width, H / shot.height);
    const sw = shot.width * scale, sh = shot.height * scale;
    ctx.drawImage(shot, (areaW - sw) / 2, (H - sh) / 2, sw, sh);
  } else {
    // No screenshot: the two names as big glyph art.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    const g0 = graphemes(card.teams[0].name)[0] ?? '?', g1 = graphemes(card.teams[1].name)[0] ?? '?';
    setFont(ctx, 800, 260);
    ctx.fillText(g0, 40, 330);
    ctx.fillText(g1, 260, 590);
  }

  // ---- right panel
  const px0 = areaW - 70;
  const fade = ctx.createLinearGradient(px0, 0, areaW + 40, 0);
  fade.addColorStop(0, 'rgba(26,18,52,0)');
  fade.addColorStop(1, 'rgba(26,18,52,0.96)');
  ctx.fillStyle = fade;
  ctx.fillRect(px0, 0, 110, H);
  ctx.fillStyle = 'rgba(26,18,52,0.96)';
  ctx.fillRect(areaW + 40, 0, W - areaW - 40, H);

  // ---- logo badge (top-left, over the screenshot)
  ctx.fillStyle = 'rgba(20,14,40,0.72)';
  roundRect(ctx, 24, 22, 300, 62, 18);
  ctx.fill();
  ctx.fillStyle = '#ff4f8b';
  roundRect(ctx, 34, 31, 44, 44, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  setFont(ctx, 800, 30);
  ctx.textAlign = 'center';
  ctx.fillText('字', 56, 64);
  ctx.textAlign = 'left';
  const logo = fitText(ctx, card.title, 222, 26, 16);
  setFont(ctx, 800, logo.px);
  ctx.fillText(logo.text, 90, 52);
  setFont(ctx, 500, 15);
  ctx.fillStyle = '#c9b8ff';
  ctx.fillText('GLYPH RUMBLE 3D', 90, 73);

  const x0 = 640, maxW = W - x0 - 44;
  let y = 64;
  // Mode chip.
  setFont(ctx, 800, 20);
  const chipW = ctx.measureText(card.modeLabel).width + 28;
  ctx.fillStyle = 'rgba(255,210,63,0.16)';
  roundRect(ctx, x0, y - 26, chipW, 36, 18);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(card.modeLabel, x0 + 14, y);
  y += 58;

  // Names: A / VS / B.
  for (const [i, tm] of card.teams.entries()) {
    const f = fitText(ctx, tm.name, maxW, 54, 26);
    setFont(ctx, 800, f.px);
    ctx.fillStyle = tm.color;
    ctx.fillText(f.text, x0, y + f.px * 0.35);
    y += Math.max(44, f.px * 0.9) + 6;
    if (i === 0) {
      setFont(ctx, 800, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('VS', x0, y);
      y += 40;
    }
  }
  y += 14;

  // Result.
  const head = fitText(ctx, card.headline, maxW, 50, 28);
  setFont(ctx, 800, head.px);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(head.text, x0, y + 10);
  y += 46;
  setFont(ctx, 700, 24);
  ctx.fillStyle = '#c9b8ff';
  const det = card.score ? `${card.detail}  ·  ${card.score}` : card.detail;
  ctx.fillText(fitText(ctx, det, maxW, 24, 16, 700).text, x0, y);
  y += 46;

  // MVP + highlight.
  const block = (label: string, text: string, color: string, lines: number) => {
    setFont(ctx, 800, 18);
    ctx.fillStyle = color;
    ctx.fillText(label, x0, y);
    y += 30;
    setFont(ctx, 600, 23);
    ctx.fillStyle = '#ffffff';
    for (const l of wrapText(ctx, text, maxW, lines)) {
      ctx.fillText(l, x0, y);
      y += 31;
    }
    y += 12;
  };
  if (card.mvp) block(card.mvp.label, card.mvp.text, '#ff7aa2', 2);
  if (card.highlight && y < H - 110) block(card.highlight.label, card.highlight.text, '#7cc8ff', Math.max(1, Math.min(3, Math.floor((H - 70 - y) / 31) - 1)));

  // Footer.
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x0, H - 62, maxW, 1);
  setFont(ctx, 700, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(fitText(ctx, card.footer, maxW - 170, 18, 13, 700).text, x0, H - 30);
  setFont(ctx, 800, 18);
  ctx.fillStyle = '#ffd23f';
  ctx.textAlign = 'right';
  ctx.fillText(fitText(ctx, card.tag, 170, 18, 12).text, W - 44, H - 30);
  ctx.textAlign = 'left';
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
