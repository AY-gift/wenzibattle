/**
 * The share sheet on the result screen: preview of the report image, the post text, and
 * system share / X / LINE / Bluesky / copy link / save PNG / challenge link.
 * Phones (coarse pointer + Web Share) get the system share sheet first; desktops get the SNS
 * buttons first. The PNG is prepared when the panel opens so the share calls run directly
 * inside the click (iOS Safari drops the user gesture across awaits).
 */
import { track } from './analytics';
import { canvasToBlob, downloadBlob } from './card';
import { canNativeShare, canShareFile, copyText, nativeShare, openIntent, prefersNativeShare, type SnsTarget } from './sns';

export interface SharePayload {
  title: string;
  /** Post text for the result (without the link). */
  text: string;
  /** Result link per channel (each carries its own `src` for attribution). */
  resultUrl: (src: 'x' | 'line' | 'bsky' | 'native' | 'copy' | 'image') => string;
  /** Challenge (new match) link + its post text. */
  challengeUrl: string;
  challengeText: string;
  /** Renders the report image (called when the panel opens). */
  image: () => Promise<HTMLCanvasElement>;
  filename: string;
}

export interface ShareLabels {
  sharePanel: string;
  shareNative: string;
  shareNativeImg: string;
  shareX: string;
  shareLine: string;
  shareBsky: string;
  copyLink: string;
  saveCard: string;
  challengeLink: string;
  shareHint: string;
  close: string;
}

export class SharePanel {
  private root: HTMLElement;
  private payload: SharePayload | null = null;
  private file: File | null = null;
  private blob: Blob | null = null;
  private lastFocus: HTMLElement | null = null;

  constructor(
    host: HTMLElement,
    private labels: () => ShareLabels,
    private notify: (msg: 'copied' | 'challengeCopied' | 'imageSaved' | 'copyFailed') => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'share-panel hidden';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    host.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  async open(p: SharePayload): Promise<void> {
    this.payload = p;
    this.file = null;
    this.blob = null;
    this.lastFocus = document.activeElement as HTMLElement | null;
    track('share_panel_open', { native: canNativeShare() });
    this.render(true);
    this.root.classList.remove('hidden');
    (this.root.querySelector('button') as HTMLButtonElement | null)?.focus();
    try {
      const canvas = await p.image();
      if (this.payload !== p) return;
      this.blob = await canvasToBlob(canvas);
      if (this.blob) this.file = new File([this.blob], p.filename, { type: 'image/png' });
    } catch {
      /* the panel still works without the image */
    }
    if (this.payload === p && this.isOpen) this.render(false);
  }

  close(): void {
    this.root.classList.add('hidden');
    this.payload = null;
    this.lastFocus?.focus?.();
  }

  private render(loading: boolean): void {
    const p = this.payload!;
    const L = this.labels();
    this.root.replaceChildren();
    const box = el('div', 'share-box');
    const head = el('div', 'share-head');
    head.append(el('h2', '', L.sharePanel));
    const x = el('button', 'share-close', '✕') as HTMLButtonElement;
    x.type = 'button';
    x.setAttribute('aria-label', L.close);
    x.onclick = () => this.close();
    head.append(x);
    box.append(head);

    const prev = el('div', 'share-preview');
    if (this.blob) {
      const img = document.createElement('img');
      img.alt = p.text;
      img.src = URL.createObjectURL(this.blob);
      img.onload = () => URL.revokeObjectURL(img.src);
      prev.append(img);
    } else prev.append(el('div', 'share-loading', loading ? '…' : ''));
    box.append(prev);
    const text = el('p', 'share-text', p.text);
    box.append(text);

    const nativeFirst = prefersNativeShare();
    const btn = (label: string, cls: string, fn: () => void, disabled = false) => {
      const b = el('button', `share-btn ${cls}`, label) as HTMLButtonElement;
      b.type = 'button';
      b.disabled = disabled;
      b.onclick = fn;
      return b;
    };
    const nativeBtn = canNativeShare()
      ? btn(this.file && canShareFile(this.file) ? L.shareNativeImg : L.shareNative, `native${nativeFirst ? ' big' : ''}`, () => void this.native())
      : null;
    const sns = el('div', 'share-row sns');
    const targets: [SnsTarget, string][] = [['x', L.shareX], ['line', L.shareLine], ['bsky', L.shareBsky]];
    for (const [tg, label] of targets) sns.append(btn(label, tg, () => this.sns(tg)));
    const tools = el('div', 'share-row tools');
    tools.append(btn(L.copyLink, 'copy', () => void this.copy()));
    tools.append(btn(L.saveCard, 'save', () => this.save(), !this.blob));
    const challenge = btn(L.challengeLink, 'challenge', () => void this.challenge());

    if (nativeFirst && nativeBtn) box.append(nativeBtn, sns, tools, challenge);
    else {
      box.append(sns);
      if (nativeBtn) tools.prepend(nativeBtn);
      box.append(tools, challenge);
    }
    const link = el('input', 'share-link') as HTMLInputElement;
    link.readOnly = true;
    link.value = p.resultUrl('copy');
    link.onfocus = () => link.select();
    box.append(link, el('p', 'share-hint', L.shareHint));
    this.root.append(box);
  }

  private sns(target: SnsTarget): void {
    const p = this.payload;
    if (!p) return;
    track(target === 'x' ? 'share_x_click' : target === 'line' ? 'share_line_click' : 'share_bluesky_click');
    openIntent(target, p.text, p.resultUrl(target));
  }

  private async native(): Promise<void> {
    const p = this.payload;
    if (!p) return;
    track('share_native_open', { image: !!this.file });
    const res = await nativeShare({ title: p.title, text: p.text, url: p.resultUrl('native'), file: this.file });
    if (res === 'done') track('share_native_done');
    // 'cancelled' is the player's choice: say nothing. Unsupported/failed: fall back to copying.
    if (res === 'unsupported' || res === 'failed') await this.copy();
  }

  private async copy(): Promise<void> {
    const p = this.payload;
    if (!p) return;
    track('share_link_copy');
    const ok = await copyText(`${p.text} ${p.resultUrl('copy')}`);
    this.notify(ok ? 'copied' : 'copyFailed');
  }

  private async challenge(): Promise<void> {
    const p = this.payload;
    if (!p) return;
    track('share_challenge_copy');
    const ok = await copyText(`${p.challengeText} ${p.challengeUrl}`);
    this.notify(ok ? 'challengeCopied' : 'copyFailed');
  }

  private save(): void {
    const p = this.payload;
    if (!p || !this.blob) return;
    track('share_image_download');
    downloadBlob(this.blob, p.filename);
    this.notify('imageSaved');
  }
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
