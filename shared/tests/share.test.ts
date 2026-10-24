import { describe, expect, it } from 'vitest';
import { cleanText, describeShare, escapeHtml, handleShare } from '../../deploy/edge/share-og';
import { buildLink, decodeResult, encodeResult, MAX_NAME, parseLink, type ResultRecord } from '../src/share/links';
import { clip, graphemes, intentUrl } from '../src/share/sns';

const BASE = 'https://example.com/arena/';
const search = (url: string) => new URL(url).search;

describe('share links', () => {
  it('round-trips Chinese, Japanese, English, emoji, ZWJ and kaomoji through the URL', () => {
    const names = ['龍', '妈妈', 'お母さん', 'Hello world', '👨‍👩‍👧', '🇯🇵', '1️⃣', '(・ω・)', 'ಠ_ಠ', '┬─┬ノ( º _ ºノ)', '(╯°□°)╯︵ ┻━┻', 'a&b=c?d#e', '100% 本気'];
    for (const a of names) {
      for (const b of ['水', '😀']) {
        const url = buildLink({ mode: 'arena', a, b }, { seed: 42, base: BASE, source: 'x' });
        const p = parseLink(search(url))!;
        expect(p.lineup.a, a).toBe(a.normalize('NFC'));
        expect(p.lineup.b).toBe(b);
        expect(p.seed).toBe(42);
        expect(p.source).toBe('x');
        expect(url).not.toMatch(/[\s#]/); // no raw spaces / fragments
      }
    }
  });

  it('keeps old links working (?a&b&seed&lang)', () => {
    const p = parseLink('?a=%E7%81%AB&b=%E6%B0%B4&seed=123&lang=zh')!;
    expect(p.lineup).toEqual({ mode: 'arena', a: '火', b: '水' });
    expect(p.seed).toBe(123);
    expect(p.lang).toBe('zh');
    expect(p.result).toBeNull();
  });

  it('validates input: length cap, bad seeds, empty or invisible names, unknown modes and sources', () => {
    const long = '龍'.repeat(500);
    const p = parseLink(`?a=${encodeURIComponent(long)}&b=x&seed=-1&src=evil`)!;
    expect(Array.from(p.lineup.a).length).toBeLessThanOrEqual(MAX_NAME);
    expect(p.seed).toBeNull();
    expect(p.source).toBeNull();
    expect(parseLink('?a=&b=x')).toBeNull();
    expect(parseLink('?a=%E2%80%8B&b=x')).toBeNull(); // zero-width space only
    expect(parseLink('?mode=soccer&a=x&b=y')).toBeNull(); // handled by the soccer game
    expect(parseLink('?seed=1.5&a=x&b=y')!.seed).toBeNull();
    expect(parseLink('?a=<script>&b=y')!.lineup.a).toBe('<script>'); // kept as text (rendered via textContent)
  });

  it('challenge links have no result; result links carry the real result', () => {
    const rec: ResultRecord = { winner: 0, reason: 'ko', time: 7.9, hp: [62, 0], highlight: { key: 'swallow', a: 0 } };
    const challenge = parseLink(search(buildLink({ mode: 'arena', a: '火', b: '水' }, { base: BASE, source: 'challenge' })))!;
    expect(challenge.result).toBeNull();
    expect(challenge.seed).toBeNull();
    const result = parseLink(search(buildLink({ mode: 'arena', a: '火', b: '水' }, { base: BASE, seed: 9, result: rec })))!;
    expect(result.result).toEqual(rec);
  });

  it('carries the best-of-three format and the series score', () => {
    const rec: ResultRecord = { winner: 1, reason: 'ringout', time: 12.3, hp: [0, 40] };
    const p = parseLink(search(buildLink({ mode: 'arena', a: '火', b: '水' }, { base: BASE, seed: 5, result: rec, bestOf: 3, series: [1, 2] })))!;
    expect(p.bestOf).toBe(3);
    expect(p.series).toEqual([1, 2]);
    const single = parseLink(search(buildLink({ mode: 'arena', a: '火', b: '水' }, { base: BASE, bestOf: 1 })))!;
    expect(single.bestOf).toBe(1);
    expect(single.series).toBeNull();
    expect(parseLink('?a=x&b=y&bo=7&sc=9-9')!).toMatchObject({ bestOf: 1, series: null });
  });

  it('result codes are strict', () => {
    const ok: ResultRecord = { winner: null, reason: 'draw', time: 15, hp: [10, 10] };
    expect(decodeResult(encodeResult(ok))).toEqual(ok);
    expect(decodeResult('1.0.draw.79.1.1')).toBeNull(); // a winner can't "draw"
    expect(decodeResult('1.d.ko.79.1.1')).toBeNull();
    expect(decodeResult('1.0.ko.99999.1.1')).toBeNull();
    expect(decodeResult('2.0.ko.79.1.1')).toBeNull();
    expect(decodeResult('1.0.boom.79.1.1')).toBeNull();
    expect(decodeResult('x'.repeat(200))).toBeNull();
    // Unknown / malformed highlight keys are dropped, the rest survives.
    expect(decodeResult('1.1.ringout.50.0.40.<img>.0', () => true)?.highlight).toBeUndefined();
    expect(decodeResult('1.1.ringout.50.0.40.notAKey.0', (k) => k === 'ko')?.highlight).toBeUndefined();
    expect(decodeResult('1.1.ringout.50.0.40.ko.1.12', (k) => k === 'ko')?.highlight).toEqual({ key: 'ko', a: 1, n: 12 });
  });
});

describe('SNS intents', () => {
  it('builds the official share URLs with proper encoding', () => {
    const text = '《字形乱斗 3D》「火」VS「😀」→「火」获胜！ #字形乱斗 & more';
    const url = 'https://example.com/arena/?a=%E7%81%AB&b=x';
    const x = new URL(intentUrl('x', text, url));
    expect(x.origin + x.pathname).toBe('https://x.com/intent/tweet');
    expect(x.searchParams.get('text')).toBe(text);
    expect(x.searchParams.get('url')).toBe(url);
    const line = new URL(intentUrl('line', text, url));
    expect(line.origin + line.pathname).toBe('https://social-plugins.line.me/lineit/share');
    expect(line.searchParams.get('url')).toBe(url);
    const bsky = new URL(intentUrl('bsky', text, url));
    expect(bsky.origin + bsky.pathname).toBe('https://bsky.app/intent/compose');
    expect(bsky.searchParams.get('text')).toBe(`${text} ${url}`);
  });

  it('shortens long names on grapheme boundaries (no broken emoji)', () => {
    const fam = '👨‍👩‍👧';
    expect(graphemes(fam.repeat(3))).toHaveLength(3);
    const c = clip(fam.repeat(30), 5);
    expect(graphemes(c)).toEqual([fam, fam, fam, fam, '…']);
    expect(clip('火', 5)).toBe('火');
  });
});

describe('per-match OG page (deploy/edge)', () => {
  it('escapes player text and never reflects raw markup', async () => {
    const evil = '"><script>alert(1)</script>';
    const req = new Request(`https://example.com/s/arena?mode=arena&a=${encodeURIComponent(evil)}&b=%E6%B0%B4&r=1.0.ko.79.62.0`);
    const html = await handleShare(req, { siteUrl: 'https://example.com/' }).text();
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<meta property="og:image" content="https://example.com/arena/og.png">');
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain('summary_large_image');
    expect(escapeHtml(`<a href="x" onclick='y'>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;');
  });

  it('describes the real result and limits text', () => {
    const d = describeShare(new URLSearchParams('mode=arena&a=火&b=水&r=1.0.ko.79.62.0'));
    expect(d.title).toContain('「火」VS「水」');
    expect(d.title).toContain('WIN');
    expect(d.description).toContain('7.9s');
    expect(Array.from(cleanText('龍'.repeat(100))).length).toBe(40);
    const soccer = describeShare(new URLSearchParams('mode=soccer&how=split&an=龙飞凤舞&bh=split&bn=风平浪静&a=龙&a=飞&a=凤&a=舞&b=风&b=平&b=浪&b=静&r=1.3.4.0.1200.6'));
    expect(soccer.title).toContain('3 - 4');
    expect(soccer.title).toContain('Glyph Soccer');
    expect(soccer.title).not.toContain('DRAW');
    expect(cleanText('a‮b\u0000c')).toBe('abc');
  });
});
