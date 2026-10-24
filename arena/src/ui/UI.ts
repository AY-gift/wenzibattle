/**
 * UI — DOM screens (select / battle / result). All user text is written with textContent,
 * never innerHTML, so inputs can't inject markup.
 */
import { BATTLE_TIME, BattleSimulator } from '../core/battle/BattleSimulator';
import type { BattleEvent, BattleResult } from '../core/battle/types';
import { buildReport } from '../core/report';
import { randomSeed } from '@shared/core/rng';
import type { Stats } from '@shared/core/StatGenerator';
import type { ArenaRenderer } from '../render/ArenaRenderer';
import { buildFighter, release, retain, type FighterBundle } from '@shared/render/FighterFactory';
import { track } from '@shared/share/analytics';
import { canvasToBlob, downloadBlob, renderCard, type CardData } from '@shared/share/card';
import { buildLink, parseLink, stripSourceParam, type ParsedLink, type ResultRecord, type ShareSource } from '@shared/share/links';
import { SharePanel } from '@shared/share/SharePanel';
import { clip } from '@shared/share/sns';
import { Commentary } from './Commentary';
import { COMMENTARY } from './commentaryText';
import { describeFighter, elementName, getLang, hasReportKey, LANGS, onLangChange, reportLine, setLang, t, type Lang } from './i18n';
import { playClip, setAudioScene, setSfxEnabled, sfxEnabled, sfxForEvent, unlockAudio } from './Sfx';

export const RANDOM_POOL = [
  '火', '水', '田', '川', '龍', '虎', '猫', '犬', '笑', '怒', '眠', '飛', '急', '逃', '屁', '王', '山', '雷', '爆', '愛', '鬼', '回', '幸', '氷',
  'A', 'Z', 'W', 'あ', 'ア', 'ぬ', 'ゑ', '★', '♥', '∞', '？', '〒', '😀', '💀', '🍣', '🔥', '👻', '🐱', '🍌', '💣', '⚡', '🐉', '💩', '🌀', '👑',
  '(・ω・)', 'ಠ_ಠ', '(>_<)', '(╯°□°)╯', 'ʕ•ᴥ•ʔ', '¯\\_(ツ)_/¯', 'm(_ _)m', '(^_^)v', 'orz', 'zzz', 'cat', 'KING', 'ねこ', '寿司',
];

const EXAMPLES: [string, string][] = [
  ['火', '水'], ['猫', '犬'], ['笑', '怒'], ['💀', '🍣'], ['(・ω・)', 'ಠ_ಠ'], ['龍', '虎'], ['★', '♥'], ['屁', '王'], ['田', '川'], ['眠', '急'],
];

const STAT_KEYS: (keyof Stats)[] = ['weight', 'speed', 'attack', 'defense', 'stability', 'luck'];
const STAT_COLORS: Record<keyof Stats, string> = {
  weight: '#a58bff', speed: '#48d6c8', attack: '#ff4f8b', defense: '#5aa9ff', stability: '#ffb347', luck: '#ffd23f',
};

type Screen = 'select' | 'battle' | 'result';

/** A best-of-three ends after this many rounds even if draws kept it level. */
const MAX_ROUNDS = 5;
const FORMAT_KEY = 'glyph-arena-bestof';

/** One match: a single bout, or rounds until someone has two. Round k replays from the series seed. */
interface Series {
  seed: number;
  bestOf: 1 | 3;
  wins: [number, number];
  rounds: BattleResult[];
}
const roundSeed = (seed: number, k: number) => (k === 0 ? seed : (seed + k * 0x2f6b9) % 2 ** 31);

/** Public site address for links and the report image (set VITE_SITE_URL when deploying). */
const SITE_URL: string = import.meta.env?.VITE_SITE_URL || '';
/** Optional share endpoint that serves per-match OG tags, e.g. https://example.com/s/arena (see deploy/). */
const SHARE_BASE: string = import.meta.env?.VITE_SHARE_BASE || '';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export class App {
  private bundles: [FighterBundle | null, FighterBundle | null] = [null, null];
  private loadToken = [0, 0];
  private timers: [number, number] = [0, 0];
  private cards: HTMLElement[];
  private inputs: HTMLInputElement[];
  private sim: BattleSimulator | null = null;
  private screen: Screen = 'select';
  private pendingSeed: number | null = null;
  private hudRaf = 0;
  private commentary: Commentary;
  private lastResult: BattleResult | null = null;
  private bestOf: 1 | 3 = 1;
  private series: Series | null = null;
  private roundTimer = 0;
  private sharePanel: SharePanel;
  /** Set when the page was opened from a challenge / result link (for attribution). */
  private arrival: { src: ShareSource | null; kind: 'config' | 'result'; started: boolean } | null = null;

  constructor(private arena: ArenaRenderer) {
    this.cards = [0, 1].map((i) => $(`.card[data-slot="${i}"]`));
    this.inputs = this.cards.map((c) => $<HTMLInputElement>('.glyph-input', c));
    this.commentary = new Commentary($('#commentary'), $('#bubbles'), arena);
    this.sharePanel = new SharePanel(
      $('#app'),
      () => ({ sharePanel: t('sharePanel'), shareNative: t('shareNative'), shareNativeImg: t('shareNativeImg'), shareX: t('shareX'), shareLine: t('shareLine'), shareBsky: t('shareBsky'), copyLink: t('copyLink'), saveCard: t('saveCard'), challengeLink: t('challengeLink'), shareHint: t('shareHint'), close: t('closeBtn') }),
      (msg) => this.toast(t(msg)),
    );
  }

  async init(): Promise<void> {
    this.buildLangSelect();
    this.buildStatRows();
    this.buildExamples();
    try {
      if (localStorage.getItem(FORMAT_KEY) === '3') this.bestOf = 3;
    } catch {
      /* storage blocked: keep the default */
    }
    this.bind();
    this.applyI18n();
    onLangChange(() => this.applyI18n());
    this.arena.onEvent = (e) => this.onBattleEvent(e);
    this.arena.onBattleDone = (sim) => this.showResult(sim);
    this.arena.onQualityAutoDrop = () => {
      this.updateToolLabels();
    };
    this.arena.moveLabel = (f) => `${COMMENTARY[getLang()].sigPrefix} ${f.spec.signature.name[getLang()]}`;
    void this.arena.stage
      .populate()
      .then(() => this.arena.loadProps())
      .then(() => this.arena.warmUp());
    // ?fps shows a small frame-rate meter (handy when reporting stutter).
    if (new URLSearchParams(location.search).has('fps')) {
      const meter = document.createElement('span');
      meter.className = 'chip fps';
      $('.tools').prepend(meter);
      setInterval(() => (meter.textContent = `${Math.round(this.arena.fps)} FPS · ${this.arena.quality}`), 500);
    }
    const loop = () => {
      this.commentary.tick();
      requestAnimationFrame(loop);
    };
    loop();
    const link = parseLink(location.search, hasReportKey);
    let a = '火', b = '水';
    if (link) {
      a = link.lineup.a;
      b = link.lineup.b;
      this.pendingSeed = link.seed;
      this.bestOf = link.bestOf;
      this.arrival = { src: link.source, kind: link.result ? 'result' : 'config', started: false };
      track('challenge_link_open', { src: link.source ?? 'direct', kind: this.arrival.kind });
      stripSourceParam();
    }
    this.inputs[0].value = a;
    this.inputs[1].value = b;
    this.renderFormat();
    this.showScreen('select');
    await Promise.all([this.load(0, a), this.load(1, b)]);
    if (link?.result) this.showSharedReport(link);
    else if (link) this.toast(t('challengeBanner'), 4000);
  }

  // ---------------------------------------------------------------- setup

  private buildLangSelect(): void {
    const sel = $<HTMLSelectElement>('#lang');
    for (const l of LANGS) {
      const o = document.createElement('option');
      o.value = l.id;
      o.textContent = l.label;
      sel.appendChild(o);
    }
    sel.value = getLang();
    sel.addEventListener('change', () => setLang(sel.value as Lang));
  }

  private buildStatRows(): void {
    for (const card of this.cards) {
      const box = $('.stats', card);
      for (const k of STAT_KEYS) {
        const lbl = document.createElement('span');
        lbl.className = 'lbl';
        lbl.dataset.stat = k;
        const bar = document.createElement('span');
        bar.className = 'bar';
        const fill = document.createElement('i');
        fill.style.background = STAT_COLORS[k];
        fill.style.width = '0%';
        bar.appendChild(fill);
        const val = document.createElement('span');
        val.className = 'val';
        val.textContent = '–';
        box.append(lbl, bar, val);
      }
    }
  }

  private buildExamples(): void {
    const box = $('#examples');
    for (const [a, b] of EXAMPLES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${a} vs ${b}`;
      btn.addEventListener('click', () => this.setPair(a, b));
      box.appendChild(btn);
    }
  }

  private bind(): void {
    this.inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        clearTimeout(this.timers[i]);
        this.timers[i] = window.setTimeout(() => this.load(i as 0 | 1, inp.value), 260);
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          clearTimeout(this.timers[i]);
          void this.load(i as 0 | 1, inp.value).then(() => this.fight());
        }
      });
      $('.dice', this.cards[i]).addEventListener('click', () => {
        unlockAudio();
        playClip('ui_dice_roll');
        const pick = this.randomText(this.inputs[1 - i].value);
        inp.value = pick;
        void this.load(i as 0 | 1, pick);
      });
    });
    $('#btn-fight').addEventListener('click', () => {
      unlockAudio();
      playClip('ui_fight_button');
      this.fight();
    });
    // Generic click sound for every other button (only when a generated clip exists).
    document.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && !b.classList.contains('dice') && b.id !== 'btn-fight') playClip('ui_click', 0.5);
    });
    document.querySelectorAll<HTMLButtonElement>('#format button').forEach((btn) =>
      btn.addEventListener('click', () => this.setFormat(btn.dataset.bo === '3' ? 3 : 1)),
    );
    $('#btn-random-match').addEventListener('click', () => this.randomMatch());
    $('#btn-random2').addEventListener('click', () => this.randomMatch());
    $('#btn-again').addEventListener('click', () => this.fight());
    $('#btn-change').addEventListener('click', () => this.backToSelect());
    $('#btn-pause').addEventListener('click', () => this.setPaused(true));
    $('#btn-resume').addEventListener('click', () => this.setPaused(false));
    $('#btn-pause-restart').addEventListener('click', () => this.fight());
    $('#btn-pause-change').addEventListener('click', () => this.backToSelect());
    $('#btn-rematch-live').addEventListener('click', () => this.fight());
    $('#btn-save').addEventListener('click', () => void this.saveImage());
    $('#btn-share').addEventListener('click', () => void this.share());
    $('#btn-quality').addEventListener('click', () => {
      this.arena.setQuality(this.arena.quality === 'high' ? 'low' : 'high');
      this.updateToolLabels();
    });
    $('#btn-sound').addEventListener('click', () => {
      unlockAudio();
      setSfxEnabled(!sfxEnabled());
      this.updateToolLabels();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.screen === 'battle') this.setPaused(!this.arena.paused);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'battle' && this.sim?.phase !== 'done') this.setPaused(true);
    });
  }

  private applyI18n(): void {
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n!);
    });
    document.title = `${t('title')} — Glyph Rumble 3D`;
    this.inputs.forEach((i) => (i.placeholder = t('placeholder')));
    this.cards.forEach((c) => {
      c.querySelectorAll<HTMLElement>('.lbl').forEach((l) => (l.textContent = t(l.dataset.stat!)));
    });
    const pack = COMMENTARY[getLang()];
    this.arena.words = pack.words;
    this.arena.stage.setTexts(pack.stage);
    this.updateSigns();
    this.updateToolLabels();
    for (const i of [0, 1] as const) this.renderCard(i);
    if (this.screen === 'result' && this.lastResult) this.renderResult(this.lastResult);
  }

  private updateToolLabels(): void {
    $('#btn-quality').textContent = t(this.arena.quality === 'high' ? 'quality_high' : 'quality_low');
    $('#btn-sound').textContent = t(sfxEnabled() ? 'sound_on' : 'sound_off');
  }

  // ---------------------------------------------------------------- fighters

  private randomText(avoid = ''): string {
    let s = avoid;
    for (let i = 0; i < 10 && (s === avoid || !s); i++) s = RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)];
    return s;
  }

  private async setPair(a: string, b: string): Promise<void> {
    this.inputs[0].value = a;
    this.inputs[1].value = b;
    await Promise.all([this.load(0, a), this.load(1, b)]);
  }

  private async load(slot: 0 | 1, text: string): Promise<void> {
    const token = ++this.loadToken[slot];
    const card = this.cards[slot];
    card.classList.add('loading');
    try {
      const res = await buildFighter(text);
      if (token !== this.loadToken[slot]) return;
      card.classList.toggle('invalid', !res.ok);
      if (!res.ok) {
        $('.warn', card).textContent = t(res.reason === 'empty' ? 'empty' : 'invalid');
        this.updateFightButton();
        return;
      }
      const old = this.bundles[slot];
      if (old !== res.bundle) {
        if (old) release(old);
        retain(res.bundle);
        this.bundles[slot] = res.bundle;
        if (this.screen === 'select') this.syncArenaFighters();
      }
      this.renderCard(slot);
    } catch (err) {
      console.error(err);
      if (token === this.loadToken[slot]) $('.warn', card).textContent = t('invalid');
    } finally {
      if (token === this.loadToken[slot]) card.classList.remove('loading');
      this.updateFightButton();
    }
  }

  /** Crowd signs cheer for whoever is currently selected. */
  private updateSigns(): void {
    const [a, b] = this.bundles;
    if (!a || !b) return;
    const names = { a: a.spec.name, b: b.spec.name };
    this.arena.stage.setSigns(COMMENTARY[getLang()].signs.map((s) => s.replace(/\{a\}/g, names.a).replace(/\{b\}/g, names.b)));
    this.commentary.setNames([names.a, names.b]);
  }

  /** Push both fighters to the 3D view; B is recoloured if both would look alike. */
  private syncArenaFighters(): void {
    const [a, b] = this.bundles;
    let shift = 0;
    if (a && b) {
      const d = Math.abs(((a.spec.hue - b.spec.hue + 540) % 360) - 180);
      if (d < 45) shift = 150;
    }
    this.arena.setFighter(0, a);
    this.arena.setFighter(1, b, shift);
    this.updateSigns();
  }

  private renderCard(slot: 0 | 1): void {
    const b = this.bundles[slot];
    const card = this.cards[slot];
    if (!b) return;
    const spec = b.spec;
    let desc = describeFighter(spec);
    if (spec.element) desc += `  [${t('element')}: ${elementName(spec.element)}]`;
    desc += `\n${t('special')}: ${spec.signature.name[getLang()]}`;
    $('.desc', card).textContent = desc;
    const fills = card.querySelectorAll<HTMLElement>('.bar i');
    const vals = card.querySelectorAll<HTMLElement>('.val');
    STAT_KEYS.forEach((k, i) => {
      fills[i].style.width = `${spec.stats[k]}%`;
      vals[i].textContent = String(spec.stats[k]);
    });
    if (!card.classList.contains('invalid')) $('.warn', card).textContent = b.warnings.map((w) => t(w.key, { n: w.n })).join(' / ');
  }

  private updateFightButton(): void {
    const ok = this.bundles.every(Boolean) && this.cards.every((c) => !c.classList.contains('invalid'));
    ($('#btn-fight') as HTMLButtonElement).disabled = !ok;
  }

  private async randomMatch(): Promise<void> {
    unlockAudio();
    const a = this.randomText();
    const b = this.randomText(a);
    await this.setPair(a, b);
    this.fight();
  }

  // ---------------------------------------------------------------- battle

  private setFormat(bo: 1 | 3): void {
    this.bestOf = bo;
    try {
      localStorage.setItem(FORMAT_KEY, String(bo));
    } catch {
      /* storage blocked: the choice lasts for this visit */
    }
    this.renderFormat();
  }

  private renderFormat(): void {
    document.querySelectorAll<HTMLButtonElement>('#format button').forEach((btn) => btn.setAttribute('aria-checked', String(btn.dataset.bo === String(this.bestOf))));
  }

  /** Starts a new match (one bout or a best-of-three) from round 1. */
  private fight(): void {
    const [a, b] = this.bundles;
    if (!a || !b || this.cards.some((c) => c.classList.contains('invalid'))) return;
    unlockAudio();
    const seed = this.pendingSeed ?? randomSeed();
    this.pendingSeed = null;
    $('#shared-report')?.remove();
    if (this.arrival && !this.arrival.started) {
      this.arrival.started = true;
      track('challenge_match_started', { src: this.arrival.src ?? 'direct', kind: this.arrival.kind });
    }
    this.series = { seed, bestOf: this.bestOf, wins: [0, 0], rounds: [] };
    this.startRound();
  }

  private startRound(): void {
    const [a, b] = this.bundles;
    const series = this.series;
    if (!a || !b || !series) return;
    clearTimeout(this.roundTimer);
    const k = series.rounds.length;
    const seed = roundSeed(series.seed, k);
    // A different crowd every match.
    this.arena.stage.reshuffle(seed);
    this.syncArenaFighters();
    this.sim = new BattleSimulator([a.spec, b.spec], seed);
    this.arena.startBattle(this.sim);
    this.commentary.start(this.sim);
    this.cards.forEach((_, i) => {
      $('.hp-name', $(`.hp-side[data-slot="${i}"]`)).textContent = (i === 0 ? a : b).spec.name;
    });
    this.setPaused(false);
    this.showScreen('battle');
    this.renderSeriesHud();
    const decider = series.bestOf === 3 && series.wins[0] === 1 && series.wins[1] === 1;
    this.banner(series.bestOf === 1 ? t('ready') : decider ? t('finalRound') : t('round', { n: k + 1 }), false);
    cancelAnimationFrame(this.hudRaf);
    const tick = () => {
      this.updateHud();
      if (this.screen === 'battle') this.hudRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  private setPaused(p: boolean): void {
    this.arena.paused = p;
    $('#pause-overlay').classList.toggle('hidden', !p);
  }

  private updateHud(): void {
    const sim = this.sim;
    if (!sim) return;
    sim.fighters.forEach((f, i) => {
      const side = $(`.hp-side[data-slot="${i}"]`);
      const pct = `${Math.max(0, (f.hp / f.maxHp) * 100)}%`;
      const bar = $('.hpbar', side);
      $('i', bar).style.width = pct;
      $('b', bar).style.width = pct;
      bar.classList.toggle('low', f.hp / f.maxHp < 0.3);
    });
    const remain = Math.max(0, BATTLE_TIME - Math.max(0, sim.t));
    const tm = $('#timer');
    tm.textContent = String(Math.ceil(remain));
    tm.classList.toggle('hurry', remain <= 5 && sim.phase === 'fight');
  }

  private onBattleEvent(e: BattleEvent): void {
    const sim = this.sim;
    sfxForEvent(e, sim?.result?.winner);
    if (!sim) return;
    // Move-specific sound (支付失败, 上课铃, 鸭叫…) on top of the usual signature cue.
    if (e.type === 'signature') {
      const id = sim.specs[e.a].signature.opts?.sfx;
      if (id) playClip(id, 0.9);
    }
    this.commentary.onEvent(e);
    switch (e.type) {
      case 'fight':
        return this.banner(t('go'), false);
      case 'timeUp':
        return this.banner(t('timeUp'), false);
      case 'suddenDeath':
        return this.banner(COMMENTARY[getLang()].events.suddenDeath.p![0], true);
      case 'finish': {
        const r = sim.result;
        if (!r) return;
        const word = r.reason === 'draw' ? t('draw') : r.reason === 'ringout' ? 'RING OUT!' : r.reason === 'ko' ? 'K.O.!' : '';
        if (word) this.banner(word, false);
        return;
      }
    }
  }

  private banner(text: string, small: boolean): void {
    const el = $('#banner');
    el.textContent = text;
    el.classList.toggle('small', small);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ---------------------------------------------------------------- result

  private renderSeriesHud(): void {
    const el = $('#series-hud');
    const s = this.series;
    el.classList.toggle('hidden', !s || s.bestOf === 1);
    if (!s || s.bestOf === 1) return;
    const names = this.bundles.map((x) => x?.spec.name ?? '');
    const side = (i: 0 | 1) => {
      const wrap = document.createElement('span');
      wrap.className = `pips ${i === 0 ? 'a' : 'b'}`;
      for (let p = 0; p < 2; p++) {
        const dot = document.createElement('i');
        if (p < s.wins[i]) dot.className = 'on';
        wrap.appendChild(dot);
      }
      wrap.title = names[i];
      return wrap;
    };
    const label = document.createElement('span');
    const live = this.sim !== null && this.sim.phase !== 'done';
    label.textContent = t('roundOf', { n: s.rounds.length + (live ? 1 : 0) });
    el.replaceChildren(side(0), label, side(1));
  }

  /** Who took the series (null = level after the round cap). */
  private seriesWinner(s: Series): 0 | 1 | null {
    return s.wins[0] === s.wins[1] ? null : s.wins[0] > s.wins[1] ? 0 : 1;
  }

  private seriesOver(s: Series): boolean {
    return s.bestOf === 1 || s.wins[0] >= 2 || s.wins[1] >= 2 || s.rounds.length >= MAX_ROUNDS;
  }

  private showResult(sim: BattleSimulator): void {
    if (sim !== this.sim || !sim.result) return;
    const r = sim.result;
    this.lastResult = r;
    const s = this.series;
    if (s) {
      s.rounds.push(r);
      if (r.winner !== null) s.wins[r.winner]++;
      if (!this.seriesOver(s)) {
        // Between rounds: show the score, then ring the bell again.
        this.renderSeriesHud();
        const w = r.winner;
        this.banner(w === null ? t('draw') : t('roundWin', { w: r.names[w], a: s.wins[0], b: s.wins[1] }), true);
        this.roundTimer = window.setTimeout(() => {
          if (this.series === s && this.sim === sim && this.screen === 'battle') this.startRound();
        }, 1900);
        return;
      }
    }
    this.renderResult(r);
    this.showScreen('result');
  }

  /** The finished best-of-three this result closed, if any. */
  private seriesOf(r: BattleResult): Series | null {
    const s = this.series;
    return s && s.bestOf === 3 && s.rounds.includes(r) ? s : null;
  }

  private renderResult(r: BattleResult): void {
    const names = r.names;
    const s = this.seriesOf(r);
    const winner = s ? this.seriesWinner(s) : r.winner;
    $('#winner-name').textContent = winner === null ? t('draw') : names[winner];
    ($('.winner-label') as HTMLElement).style.visibility = winner === null ? 'hidden' : 'visible';
    $('#reason').textContent = s
      ? winner === null
        ? t('seriesDraw', { a: s.wins[0], b: s.wins[1] })
        : t('seriesLine', { w: names[winner], a: s.wins[0], b: s.wins[1] })
      : `${t('reason_' + r.reason)} · ${t('time')} ${r.time.toFixed(1)}s`;
    const sc = $('#series-score');
    sc.classList.toggle('hidden', !s);
    sc.replaceChildren();
    if (s) {
      const big = document.createElement('b');
      big.textContent = t('seriesScore', { a: s.wins[0], b: s.wins[1] });
      sc.appendChild(big);
      s.rounds.forEach((x, i) => {
        const chip = document.createElement('span');
        chip.textContent = `${t('roundOf', { n: i + 1 })} ${x.winner === null ? t('draw') : names[x.winner]} · ${t('reason_' + x.reason)} ${x.time.toFixed(1)}s`;
        sc.appendChild(chip);
      });
    }
    const ul = $('#report');
    ul.replaceChildren();
    for (const text of this.reportTexts(r)) {
      const li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
    }
    const ms = $('#mini-stats');
    ms.replaceChildren();
    r.counters.forEach((c, i) => {
      const d = document.createElement('div');
      d.textContent = `${names[i]} — ${t('hits')} ${c.hits} · ${t('maxHit')} ${Math.round(c.maxHit)}`;
      ms.appendChild(d);
    });
    $('#seed').textContent = `${t('seed')}: ${r.seed}`;
  }

  private reportTexts(r: BattleResult): string[] {
    const lang = getLang();
    return buildReport(r).map((l) => reportLine(l.key, { a: r.names[l.a], b: l.b !== undefined ? r.names[l.b] : '', n: l.n, move: r.signatures[l.a].name[lang] }));
  }

  private backToSelect(): void {
    clearTimeout(this.roundTimer);
    this.series = null;
    this.sim = null;
    this.commentary.stop();
    this.arena.stopBattle();
    this.setPaused(false);
    this.showScreen('select');
  }

  private showScreen(s: Screen): void {
    this.screen = s;
    setAudioScene(s === 'select' ? 'menu' : s);
    $('#screen-select').classList.toggle('hidden', s !== 'select');
    $('#screen-battle').classList.toggle('hidden', s !== 'battle');
    $('#screen-result').classList.toggle('hidden', s !== 'result');
    const narrow = window.innerWidth <= 760;
    if (s === 'select') this.arena.setFocusOffset(0, narrow ? 0.2 : 0.1);
    else if (s === 'result') this.arena.setFocusOffset(narrow ? 0 : 0.2, narrow ? 0.2 : 0);
    else this.arena.setFocusOffset(0, 0);
  }

  /** One fun real event of the match (the first line after the finish line). */
  private highlightOf(r: BattleResult): ResultRecord['highlight'] {
    const lines = buildReport(r);
    const l = lines[1] ?? lines[0];
    return l ? { key: l.key, a: l.a, ...(l.n !== undefined ? { n: Math.round(l.n) } : {}) } : undefined;
  }

  /** The last bout's record; for a best-of-three the winner is the series winner. */
  private recordOf(r: BattleResult): ResultRecord {
    const s = this.seriesOf(r);
    const winner = s ? this.seriesWinner(s) : r.winner;
    const reason = s && winner === null ? 'draw' : s && r.winner === null ? 'timeup' : r.reason;
    return { winner, reason, time: Math.round(r.time * 10) / 10, hp: [Math.max(0, Math.round(r.hp[0])), Math.max(0, Math.round(r.hp[1]))], highlight: this.highlightOf(r) };
  }

  private seriesScoreOf(r: BattleResult): [number, number] | undefined {
    const s = this.seriesOf(r);
    return s ? [s.wins[0], s.wins[1]] : undefined;
  }

  private highlightText(rec: ResultRecord, names: [string, string], moves: [string, string]): string {
    const h = rec.highlight;
    if (!h) return '';
    const b = h.a === 0 ? 1 : 0;
    return reportLine(h.key, { a: names[h.a], b: names[b], n: h.n, move: moves[h.a] });
  }

  private resultHeadline(rec: ResultRecord, names: [string, string], series?: [number, number] | null): string {
    const head = rec.winner === null ? t('draw') : t('shareWin', { w: names[rec.winner] });
    return series ? `${head} ${t('seriesScore', { a: series[0], b: series[1] })}` : head;
  }

  private siteHost(): string {
    try {
      return new URL(SITE_URL || location.href).host;
    } catch {
      return location.host;
    }
  }

  private cardData(rec: ResultRecord, names: [string, string], moves: [string, string], hits: [number, number] | null): CardData {
    const w = rec.winner;
    return {
      title: t('title'),
      modeLabel: t('modeArena'),
      teams: [{ name: names[0], color: '#ff7aa2' }, { name: names[1], color: '#7cc8ff' }],
      headline: this.resultHeadline(rec, names, this.lastResult ? this.seriesScoreOf(this.lastResult) : null),
      detail: `${t('reason_' + rec.reason)} · ${rec.time.toFixed(1)}s`,
      score: t('hpScore', { a: rec.hp[0], b: rec.hp[1] }),
      mvp: w !== null ? { label: t('mvp'), text: t('mvpText', { w: names[w], move: moves[w], hits: hits ? hits[w] : '—' }) } : undefined,
      highlight: rec.highlight ? { label: t('highlight'), text: this.highlightText(rec, names, moves) } : undefined,
      footer: t('cardFooter', { site: this.siteHost() }),
      tag: t('shareTag'),
    };
  }

  private linkFor(rec: ResultRecord | null, seed: number | undefined, src: ShareSource): string {
    const r = this.lastResult!;
    const base = SHARE_BASE || (SITE_URL ? new URL(SITE_URL).toString() : undefined);
    const s = this.seriesOf(r);
    return buildLink(
      { mode: 'arena', a: r.names[0], b: r.names[1] },
      { seed, result: rec ?? undefined, source: src, lang: getLang(), base, bestOf: s ? 3 : this.bestOf, series: rec ? this.seriesScoreOf(r) : undefined },
    );
  }

  private async saveImage(): Promise<void> {
    if (!this.lastResult) return;
    playClip('ui_camera_shutter');
    const r = this.lastResult;
    const canvas = await renderCard(this.cardData(this.recordOf(r), r.names, [r.signatures[0].name[getLang()], r.signatures[1].name[getLang()]], [r.counters[0].hits, r.counters[1].hits]), this.arena.capture());
    const blob = await canvasToBlob(canvas);
    if (blob) {
      downloadBlob(blob, `glyph-rumble-${r.seed}.png`);
      track('share_image_download', { from: 'result' });
      this.toast(t('imageSaved'));
    }
  }

  private async share(): Promise<void> {
    if (!this.lastResult) return;
    const r = this.lastResult;
    const rec = this.recordOf(r);
    const lang = getLang();
    const moves: [string, string] = [r.signatures[0].name[lang], r.signatures[1].name[lang]];
    const shot = this.arena.capture();
    const a = clip(r.names[0]), b = clip(r.names[1]);
    const sc = this.seriesScoreOf(r);
    const res = (rec.winner === null ? t('shareDraw') : t('shareWin', { w: clip(r.names[rec.winner]) })) + (sc ? ` ${t('seriesScore', { a: sc[0], b: sc[1] })}` : '');
    await this.sharePanel.open({
      title: t('title'),
      text: `${t('sharePost', { a, b, res, detail: `${t('reason_' + rec.reason)} ${rec.time.toFixed(1)}s` })} ${t('shareTag')}`,
      resultUrl: (src) => this.linkFor(rec, this.seriesOf(r)?.seed ?? r.seed, src),
      challengeUrl: this.linkFor(null, undefined, 'challenge'),
      challengeText: `${t('shareChallenge', { a, b })} ${t('shareTag')}`,
      image: () => renderCard(this.cardData(rec, r.names, moves, [r.counters[0].hits, r.counters[1].hits]), shot),
      filename: `glyph-rumble-${r.seed}.png`,
    });
  }

  /** A result link: show what really happened (no re-simulation), offer a replay or a challenge. */
  private showSharedReport(link: ParsedLink): void {
    const rec = link.result!;
    const names: [string, string] = [link.lineup.a, link.lineup.b];
    const lang = getLang();
    const moves: [string, string] = [this.bundles[0]?.spec.signature.name[lang] ?? '', this.bundles[1]?.spec.signature.name[lang] ?? ''];
    const box = document.createElement('div');
    box.id = 'shared-report';
    box.className = 'shared-report';
    const add = (tag: string, cls: string, text: string) => {
      const e = document.createElement(tag);
      e.className = cls;
      e.textContent = text;
      box.appendChild(e);
      return e;
    };
    add('div', 'sr-title', t('reportTitle'));
    add('div', 'sr-names', `${names[0]}  VS  ${names[1]}`);
    add('div', 'sr-head', this.resultHeadline(rec, names, link.series));
    add('div', 'sr-detail', `${t('reason_' + rec.reason)} · ${rec.time.toFixed(1)}s · ${t('hpScore', { a: rec.hp[0], b: rec.hp[1] })}`);
    const hl = this.highlightText(rec, names, moves);
    if (hl) add('div', 'sr-hl', hl);
    add('div', 'sr-note', t('reportNote'));
    const row = document.createElement('div');
    row.className = 'sr-actions';
    const mk = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.onclick = fn;
      row.appendChild(b);
      return b;
    };
    const replay = mk(t('watchReplay'), 'primary', () => {
      this.pendingSeed = link.seed;
      this.bestOf = link.bestOf;
      this.renderFormat();
      this.fight();
    });
    replay.title = t('replayNote');
    replay.disabled = link.seed === null;
    mk(t('challengeMine'), 'secondary', () => {
      box.remove();
      this.pendingSeed = null;
      this.inputs[1].value = '';
      this.inputs[1].focus();
    });
    mk(t('closeBtn'), 'ghost', () => box.remove());
    box.appendChild(row);
    add('div', 'sr-note small', t('replayNote'));
    $('#screen-select').appendChild(box);
  }

  private toastTimer = 0;
  private toast(msg: string, ms = 1800): void {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
  }
}
