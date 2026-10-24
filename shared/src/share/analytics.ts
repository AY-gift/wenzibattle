/**
 * Lightweight, anonymous share analytics. No login, no IDs, never the player's text.
 *
 * Events: share_panel_open, share_x_click, share_line_click, share_bluesky_click,
 * share_native_open (sheet opened) / share_native_done (a target was picked — NOT proof that
 * anything was posted), share_link_copy, share_challenge_copy, share_image_download,
 * challenge_link_open, challenge_match_started.
 * "Clicked a share button" is all we can know; actual posting happens on the platform.
 * Attribution: links we hand out carry `src=x|line|bsky|native|copy|challenge|image`; arrivals
 * report challenge_link_open { src, kind } and, if they then fight, challenge_match_started.
 *
 * Sinks (all optional): window.dataLayer (GTM / GA4), window.plausible, and a beacon to
 * VITE_ANALYTICS_URL (JSON { e, p, t }). With none configured, events only go to
 * window.__glyphEvents (handy for testing).
 */

export type ShareEvent =
  | 'share_panel_open' | 'share_x_click' | 'share_line_click' | 'share_bluesky_click'
  | 'share_native_open' | 'share_native_done' | 'share_link_copy' | 'share_challenge_copy'
  | 'share_image_download' | 'challenge_link_open' | 'challenge_match_started';

type Params = Record<string, string | number | boolean>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    plausible?: (name: string, opts?: { props?: Params }) => void;
    __glyphEvents?: { e: ShareEvent; p: Params; t: number }[];
  }
}

const ENDPOINT: string | undefined = import.meta.env?.VITE_ANALYTICS_URL;
let game = 'arena';

/** Which game the events come from ('arena' | 'soccer' | 'basketball'). */
export function setAnalyticsGame(name: string): void {
  game = name;
}

export function track(e: ShareEvent, p: Params = {}): void {
  const rec = { e, p: { game, ...p }, t: Date.now() };
  try {
    (window.__glyphEvents ??= []).push(rec);
    window.dataLayer?.push({ event: e, ...rec.p });
    window.plausible?.(e, { props: rec.p });
    if (ENDPOINT && navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify(rec)], { type: 'application/json' }));
  } catch {
    /* analytics must never break the game */
  }
}
