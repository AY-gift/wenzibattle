# Deploying the Glyph games

**Production setup: Cloudflare Workers (static assets only), built from GitHub on every push to `main`.** Step-by-step guide in Chinese: [docs/部署说明.md](../docs/部署说明.md). Config: [`wrangler.jsonc`](../wrangler.jsonc), headers: [`_headers`](_headers).

- Build command: `npm run build`. Deploy command: `npx wrangler deploy`. Build variable: `SITE_URL=https://<your-domain>/`.
- Audio ships as `.mp3` (`npm run audio:compress` converts the `.wav` masters, which are not committed).

## Static build (all hosts)

```bash
npm install
SITE_URL=https://example.com/ npm run build     # → dist/  (index.html + arena/ + soccer/ [+ basketball/])
npm run preview                                  # check dist/ at http://localhost:4173
```

Upload `dist/` to any static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages, S3 + CloudFront…).

- `SITE_URL` must be the public **HTTPS** address of the site root. It becomes `VITE_SITE_URL=https://example.com/arena/` for the arena build. Open Graph / X card tags need absolute URLs, or most previews show no image.
- `og.png` (1200×630) is in each game folder and at the root. Regenerate them with `python arena/scripts/make-og.py` / `python soccer/scripts/make-og.py` (run inside that folder).
- **Audio:** the games load the compressed `.mp3` clips (13 MB for all three games); the build drops any `.wav` that has an `.mp3`.
- Optional analytics: `VITE_ANALYTICS_URL=https://…` sends anonymous JSON beacons (`{ e, p, t }`). `window.dataLayer` (GTM / GA4) and `window.plausible` are picked up automatically if you add those scripts.

## Per-match share previews (optional)

Social crawlers don't run JavaScript, so a static SPA can only show the site-wide card. To give each shared result its own title and description:

1. Deploy `edge/share-og.ts` as a function on `/s/*`. For Cloudflare Pages, copy `edge/cloudflare-pages-function.ts` to `functions/s/[game].ts` together with `share-og.ts`, and set `SITE_URL` in the project settings.
2. Build with `SITE_URL=https://example.com/ SHARE_ENDPOINT=1 npm run build`. Result links then point at `https://example.com/s/arena?...`.

The handler:
- escapes all player text and strips control / bidi characters;
- limits name length;
- marks the page `noindex`, so player input never becomes a searchable page;
- redirects people to the game.

The image stays the site-wide `og.png`; per-match images would need server-side rendering (for example satori + resvg).

There is no public list of results, and nothing is stored server-side: a link only contains what the sharer chose to share.

## Manual test checklist (sharing)

Automated: `npm test` covers link encoding (zh / ja / en / emoji / ZWJ / kaomoji / reserved characters), validation and length caps, result-code parsing, old-link compatibility, SNS intent URLs, grapheme-safe shortening, the game-switcher URLs, and OG HTML escaping. The browser checks below were done in the Claude desktop browser pane (Chromium, desktop and 375 px mobile emulation):
- share panel layout;
- report PNG with emoji ZWJ, Japanese and Chinese text;
- result-link report card;
- challenge-link hint;
- analytics events.

Still to check by hand on real devices:

| Device | Check |
| --- | --- |
| Windows Chrome / Edge | Share panel → X / LINE / Bluesky open the compose page in a new tab; copy link → paste into a new tab opens the lineup; save PNG; the "Share via…" button opens the Windows share sheet (Edge / Chrome have `navigator.share`). |
| iPhone Safari | The system share sheet comes first; it shares the PNG + text + link; cancelling shows no error; LINE / X apps receive the link; the saved PNG shows emoji and Japanese correctly. |
| Android Chrome | Same as iPhone; also a phone without file sharing → the text + link sheet, or the copy fallback. |
| Any | Open a result link in a private window: the report card shows the shared result, "watch replay" plays a match, "challenge with my own text" clears fighter B. |
| Any | Paste a link into X / LINE / Discord / Slack: the preview shows `og.png` (needs `SITE_URL`; per-match titles need the edge function). |
| Any | Old link `/arena/?a=火&b=水&seed=123` still opens the lineup. |
