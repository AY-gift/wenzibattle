/**
 * Per-match Open Graph pages for SNS previews (optional; needs an edge/serverless host).
 *
 * Social crawlers (X, LINE, Bluesky, Facebook…) do NOT run JavaScript, so changing <meta> tags
 * in the SPA after load is invisible to them. This handler answers a share URL such as
 *   https://example.com/s/arena?mode=arena&v=1&a=火&b=水&seed=123&r=1.0.ko.79.62.0
 * with a tiny HTML page whose og:title / og:description describe that match, then sends
 * humans on to the game (/arena/?…same query…). Player text is length-limited, stripped of
 * control characters and HTML-escaped; the page is noindex so player input never becomes a
 * searchable public page. The image stays the site-wide og.png (per-match images would need
 * server-side rendering, e.g. satori + resvg).
 *
 * Plain Web-standard Request → Response, so it runs on Cloudflare Pages/Workers, Vercel Edge,
 * Netlify Edge or Deno. See deploy/README.md.
 */

export interface ShareOgOptions {
  /** Public origin + path of the games, e.g. https://example.com/ */
  siteUrl: string;
  /** Path of each game relative to siteUrl. */
  gamePaths?: Record<string, string>;
}

const GAME_NAMES: Record<string, string> = { arena: '字形乱闘 3D / Glyph Rumble 3D', soccer: 'Glyph Soccer', basketball: 'Glyph Basketball' };
const REASONS: Record<string, string> = { ko: 'KO', ringout: 'Ring-out', timeup: 'Decision', draw: 'Draw' };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c]!);
}

/** At most `max` code points, no control / bidi-override characters. */
export function cleanText(s: string | null, max = 40): string {
  if (!s) return '';
  const cleaned = s.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  const cps = Array.from(cleaned);
  return cps.length > max ? cps.slice(0, max - 1).join('') + '…' : cleaned;
}

export function describeShare(q: URLSearchParams): { title: string; description: string; game: string } {
  const game = ['arena', 'soccer', 'basketball'].includes(q.get('mode') ?? '') ? q.get('mode')! : 'arena';
  const a = cleanText(q.getAll('a').join('・')) || '?';
  const b = cleanText(q.getAll('b').join('・')) || '?';
  const r = (q.get('r') ?? '').split('.');
  let title = `「${a}」VS「${b}」`;
  let description = '文字が戦う！ 文字对战！ Text fights text — can yours win?';
  if (game !== 'arena' && r[0] === '1' && r.length >= 6) {
    // Team games: r=1.<scoreA>.<scoreB>.<golden>.<time×10>.<mvp>…
    const sa = Number(r[1]), sb = Number(r[2]);
    if (Number.isInteger(sa) && Number.isInteger(sb) && sa >= 0 && sb >= 0 && sa < 100 && sb < 100) {
      title = `${a} ${sa} - ${sb} ${b}`;
      description = '挑戦する？ 来挑战！ Challenge it!';
    }
  } else if (r[0] === '1' && r.length >= 6) {
    const w = r[1] === '0' ? a : r[1] === '1' ? b : null;
    const reason = REASONS[r[2]] ?? '';
    const time = Number(r[3]) / 10;
    title += w ? ` → 「${w}」WIN (${reason})` : ' → DRAW';
    if (Number.isFinite(time)) description = `${reason} · ${time.toFixed(1)}s — 挑戦する？ 来挑战！ Challenge it!`;
  }
  return { title: `${title} | ${GAME_NAMES[game]}`, description, game };
}

export function handleShare(req: Request, opts: ShareOgOptions): Response {
  const url = new URL(req.url);
  const q = url.searchParams;
  const { title, description, game } = describeShare(q);
  const site = opts.siteUrl.endsWith('/') ? opts.siteUrl : opts.siteUrl + '/';
  const gamePath = opts.gamePaths?.[game] ?? `${game}/`;
  // Re-encode the query from parsed values so nothing raw is reflected.
  const target = new URL(gamePath, site);
  for (const [k, v] of q) if (/^(mode|v|a|b|seed|r|lang|src)$/.test(k)) target.searchParams.append(k, v.slice(0, 200));
  const image = new URL(`${gamePath}og.png`, site).toString();
  const e = escapeHtml;
  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<title>${e(title)}</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Glyph Rumble 3D">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url.toString())}">
<meta property="og:image" content="${e(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${e(image)}">
<meta http-equiv="refresh" content="0; url=${e(target.toString())}">
<link rel="canonical" href="${e(target.toString())}">
</head><body><a href="${e(target.toString())}">${e(title)}</a>
<script>location.replace(${JSON.stringify(target.toString()).replace(/</g, '\\u003c')})</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
}
