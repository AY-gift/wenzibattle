/**
 * SNS share targets. Every button only OPENS the platform's official share/compose page with
 * the text and link filled in; the player decides whether to post. No posting APIs, no logins.
 *  - X:       https://x.com/intent/tweet?text=…&url=…
 *  - LINE:    https://social-plugins.line.me/lineit/share?url=…
 *  - Bluesky: https://bsky.app/intent/compose?text=…   (the link goes inside the text)
 */

export type SnsTarget = 'x' | 'line' | 'bsky';

/** Graphemes, so emoji / ZWJ sequences are never cut in half. */
const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
export function graphemes(s: string): string[] {
  return seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s);
}

/** Shorten long fighter names for post text: 「とても長い名前…」. */
export function clip(s: string, max = 16): string {
  const g = graphemes(s);
  return g.length <= max ? s : g.slice(0, max - 1).join('') + '…';
}

export function intentUrl(target: SnsTarget, text: string, url: string): string {
  switch (target) {
    case 'x': {
      const u = new URL('https://x.com/intent/tweet');
      u.searchParams.set('text', text);
      u.searchParams.set('url', url);
      return u.toString();
    }
    case 'line': {
      const u = new URL('https://social-plugins.line.me/lineit/share');
      u.searchParams.set('url', url);
      return u.toString();
    }
    case 'bsky': {
      const u = new URL('https://bsky.app/intent/compose');
      u.searchParams.set('text', `${text} ${url}`);
      return u.toString();
    }
  }
}

/** Must be called straight from a click handler (popup blockers). */
export function openIntent(target: SnsTarget, text: string, url: string): void {
  const href = intentUrl(target, text, url);
  const w = window.open(href, '_blank', 'noopener,noreferrer');
  // Some in-app browsers block popups: fall back to navigating this tab.
  if (!w && !window.opener) location.href = href;
}

export const canNativeShare = (): boolean => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Touch-first device (phones / tablets): the system share sheet goes first there. */
export const prefersNativeShare = (): boolean => canNativeShare() && matchMedia('(pointer: coarse)').matches;

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type NativeOutcome = 'done' | 'cancelled' | 'unsupported' | 'failed';

/**
 * Open the system share sheet. `done` means the player picked a target (not that anything was
 * posted); cancelling is silent. Call synchronously from the click — have the File ready.
 */
export async function nativeShare(data: { title: string; text: string; url: string; file?: File | null }): Promise<NativeOutcome> {
  if (!canNativeShare()) return 'unsupported';
  const payload: ShareData = { title: data.title, text: data.text, url: data.url };
  if (data.file && canShareFile(data.file)) payload.files = [data.file];
  try {
    await navigator.share(payload);
    return 'done';
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'AbortError') return 'cancelled';
    // Some browsers reject files + url together: retry once without the image.
    if (payload.files && name !== 'NotAllowedError') {
      try {
        await navigator.share({ title: data.title, text: data.text, url: data.url });
        return 'done';
      } catch (e2) {
        return (e2 as Error)?.name === 'AbortError' ? 'cancelled' : 'failed';
      }
    }
    return 'failed';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older / insecure contexts.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
