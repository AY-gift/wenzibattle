/**
 * Glyph Soccer UI: team builder (one-word split / free pick, with the move each player brings
 * and the team combo), match HUD with commentary, result card and sharing. All player text is
 * written with textContent, never innerHTML.
 */
import { randomSeed } from '@shared/core/rng';
import type { MoveName } from '@shared/core/SignatureMoves';
import { buildFighter, release, retain, type FighterBundle } from '@shared/render/FighterFactory';
import { track } from '@shared/share/analytics';
import { canvasToBlob, downloadBlob, renderCard, type CardData } from '@shared/share/card';
import { stripSourceParam, type ShareSource } from '@shared/share/links';
import { SharePanel } from '@shared/share/SharePanel';
import { clip } from '@shared/share/sns';
import { comboFor, SOCCER_COMBOS } from '@shared/sports/combos';
import { cultureFor, cultureSummary, matchupFor, PRIM_WORD, TAG_TEXT } from '@shared/sports/culture';
import { kitsFor, type Kit } from '@shared/sports/kits';
import { sportSkillFor } from '@shared/sports/skills';
import { buildTeam, type TeamHow, type TeamInput } from '@shared/sports/team';
import { buildTeamLink, parseTeamLink, type ParsedTeamLink } from '@shared/sports/teamLinks';
import { buildReport, decodeResult, encodeResult, highlightOf, statLines, teamOfId, type ReportLine, type ResultCode } from '../report';
import type { SoccerRenderer } from '../render/SoccerRenderer';
import { Match } from '../sim/Match';
import { MATCH_TIME, TEAM_SIZE, type MatchEvent, type MatchResult } from '../sim/types';
import { COMMENTARY, type CrowdMood } from './commentaryText';
import { getLang, hasReportKey, LANGS, onLangChange, reportText, setLang, skillKindName, t, type Lang } from './i18n';
import { click, playClip, setAudioScene, setSfxEnabled, sfxEnabled, sfxForEvent, unlockAudio } from './Sfx';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const SITE_URL: string = import.meta.env?.VITE_SITE_URL || '';
const SHARE_BASE: string = import.meta.env?.VITE_SHARE_BASE || '';

export const IDIOMS = ['龙飞凤舞', '风平浪静', '火上浇油', '画蛇添足', '一鸣惊人', '虎头蛇尾', '四面楚歌', '天马行空', '鸡飞狗跳', '乱七八糟', '无法无天', '大吉大利'];
const EXAMPLES: [string | string[], string | string[]][] = [
  ['龙飞凤舞', '风平浪静'],
  ['火上浇油', '画蛇添足'],
  [['妈妈', '爸爸', '宝宝', '奶奶'], ['火', '水', '雷', '风']],
  ['四面楚歌', '鸡飞狗跳'],
  ['一鸣惊人', '大吉大利'],
  [['🐱', 'ねこ', '🗿', '404'], ['(・ω・)', 'ಠ_ಠ', '😂', '💀']],
  ['天马行空', '乱七八糟'],
];
const RANDOM_GLYPHS = Array.from('火水雷风山龙虎猫犬王鬼笑怒眠飞急逃屁金冰光爆愛神真假我你好菜辣甜梦一大口').concat(['😀', '💀', '🍣', '🔥', '👻', '🐱', '🍌', '💣', '🗿', '404', 'orz']);

type Screen = 'select' | 'match' | 'result';

interface TeamSlot {
  how: TeamHow;
  word: string;
  members: string[];
  name: string;
  input: TeamInput | null;
  bundles: FighterBundle[] | null;
  token: number;
  timer: number;
  el: HTMLElement;
}

export class App {
  private slots: [TeamSlot, TeamSlot];
  private match: Match | null = null;
  private screen: Screen = 'select';
  private pendingSeed: number | null = null;
  /** Seed of the next match, decided early so the team screen already shows its kit colours. */
  private nextSeed = randomSeed();
  private kits: [Kit, Kit] = kitsFor(this.nextSeed);
  private lastResult: MatchResult | null = null;
  private lastLineup: [TeamInput, TeamInput] | null = null;
  private sharePanel: SharePanel;
  private arrival: { src: ShareSource | null; kind: 'config' | 'result'; started: boolean } | null = null;
  private lines: { el: HTMLElement; until: number }[] = [];
  private queue: { speaker: 0 | 1; text: string }[] = [];
  private nextLineAt = 0;
  private lastLineAt = 0;
  private toastTimer = 0;
  private raf = 0;
  /** Speech bubbles over the stands. */
  private bubbles: { el: HTMLElement; idx: number; until: number }[] = [];
  private nextBubbleAt = 0;

  constructor(private view: SoccerRenderer) {
    const mk = (team: 0 | 1, how: TeamHow, word: string, members: string[]): TeamSlot => ({ how, word, members, name: '', input: null, bundles: null, token: 0, timer: 0, el: $(`.team[data-team="${team}"]`) });
    this.slots = [mk(0, 'split', '龙飞凤舞', ['', '', '', '']), mk(1, 'split', '风平浪静', ['', '', '', ''])];
    this.sharePanel = new SharePanel(
      $('#app'),
      () => ({ sharePanel: t('sharePanel'), shareNative: t('shareNative'), shareNativeImg: t('shareNativeImg'), shareX: t('shareX'), shareLine: t('shareLine'), shareBsky: t('shareBsky'), copyLink: t('copyLink'), saveCard: t('saveCard'), challengeLink: t('challengeLink'), shareHint: t('shareHint'), close: t('closeBtn') }),
      (msg) => this.toast(t(msg)),
    );
    view.labels = {
      move: (p) => p.spec.signature.name[getLang()],
      combo: (team) => this.teamComboName(team),
      word: (k) => t(`w_${k}`),
      prim: (k) => PRIM_WORD[k as keyof typeof PRIM_WORD]?.[getLang()] ?? '',
    };
    view.onEvent = (e) => this.onMatchEvent(e);
    view.onDone = (m) => this.showResult(m);
  }

  async init(): Promise<void> {
    this.buildLangSelect();
    for (const team of [0, 1] as const) this.buildTeamPanel(team);
    this.buildExamples();
    $('#btn-kickoff').addEventListener('click', () => {
      unlockAudio();
      click();
      this.kickoff();
    });
    $('#btn-random-match').addEventListener('click', () => void this.randomMatch());
    $('#btn-random2').addEventListener('click', () => void this.randomMatch());
    $('#btn-again').addEventListener('click', () => this.kickoff());
    $('#btn-change').addEventListener('click', () => this.backToSelect());
    $('#btn-pause').addEventListener('click', () => this.setPaused(true));
    $('#btn-resume').addEventListener('click', () => this.setPaused(false));
    $('#btn-restart').addEventListener('click', () => this.kickoff());
    $('#btn-pause-change').addEventListener('click', () => this.backToSelect());
    $('#btn-speed').addEventListener('click', () => {
      this.view.speed = this.view.speed === 1 ? 2 : 1;
      $('#btn-speed').textContent = `×${this.view.speed}`;
    });
    $('#btn-save').addEventListener('click', () => void this.saveImage());
    $('#btn-share').addEventListener('click', () => void this.share());
    $('#btn-quality').addEventListener('click', () => {
      this.view.setQuality(this.view.quality === 'high' ? 'low' : 'high');
      this.updateTools();
    });
    $('#btn-sound').addEventListener('click', () => {
      unlockAudio();
      setSfxEnabled(!sfxEnabled());
      this.updateTools();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.screen === 'match') this.setPaused(!this.view.paused);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'match' && this.match?.phase !== 'done') this.setPaused(true);
    });
    onLangChange(() => this.applyI18n());
    this.applyKits(kitsFor(this.nextSeed));
    this.applyI18n();
    this.showScreen('select');

    const link = parseTeamLink(location.search, 'soccer', TEAM_SIZE);
    if (link) {
      link.lineup.teams.forEach((tm, i) => this.fillSlot(i as 0 | 1, tm));
      this.pendingSeed = link.seed;
      if (link.seed !== null) this.applyKits(kitsFor(link.seed));
      this.arrival = { src: link.source, kind: link.r ? 'result' : 'config', started: false };
      track('challenge_link_open', { src: link.source ?? 'direct', kind: this.arrival.kind });
      stripSourceParam();
    }
    await Promise.all([this.rebuild(0), this.rebuild(1)]);
    const res = link?.r ? decodeResult(link.r, hasReportKey) : null;
    if (link && res) this.showSharedReport(link, res);
    else if (link) this.toast(t('challengeBanner'), 4000);
    void this.view.stadium.populate(randomSeed());
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.tickHud();
    };
    tick();
  }

  // ---------------------------------------------------------------- team builder

  private buildTeamPanel(team: 0 | 1): void {
    const s = this.slots[team];
    const el = s.el;
    el.replaceChildren();
    const head = div('team-head');
    const label = div('team-label');
    label.dataset.k = team ? 'away' : 'home';
    const dice = document.createElement('button');
    dice.className = 'dice';
    dice.type = 'button';
    dice.textContent = '🎲';
    dice.setAttribute('aria-label', 'random');
    dice.onclick = () => {
      click();
      this.randomTeam(team);
    };
    head.append(label, dice);
    const tabs = div('tabs');
    for (const how of ['split', 'free'] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.how = how;
      b.onclick = () => {
        if (s.how === how) return;
        // Carry the text over sensibly: split word ↔ four boxes.
        if (how === 'free' && s.word) s.members = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s.word.replace(/\s/g, '')), (x) => x.segment).slice(0, 4);
        if (how === 'split' && s.members.every((m) => Array.from(m).length === 1)) s.word = s.members.join('');
        s.how = how;
        this.renderPanel(team);
        this.schedule(team);
      };
      tabs.append(b);
    }
    const split = div('how-split');
    const word = document.createElement('input');
    word.className = 'word';
    word.maxLength = 20;
    word.autocomplete = 'off';
    word.spellcheck = false;
    word.oninput = () => {
      s.word = word.value;
      this.schedule(team);
    };
    split.append(word);
    const free = div('how-free');
    const grid = div('free-grid');
    for (let i = 0; i < TEAM_SIZE; i++) {
      const inp = document.createElement('input');
      inp.className = 'm';
      inp.maxLength = 30;
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      inp.oninput = () => {
        s.members[i] = inp.value;
        this.schedule(team);
      };
      grid.append(inp);
    }
    const tname = document.createElement('input');
    tname.className = 'tname';
    tname.maxLength = 30;
    tname.oninput = () => {
      s.name = tname.value;
      this.schedule(team);
    };
    free.append(grid, tname);
    const roster = document.createElement('ul');
    roster.className = 'roster';
    el.append(head, tabs, split, free, div('hint'), div('err'), roster, div('combo'));
    this.renderPanel(team);
  }

  /** Reflect a slot's state into its inputs (without stealing focus). */
  private renderPanel(team: 0 | 1): void {
    const s = this.slots[team];
    const el = s.el;
    $('.team-label', el).textContent = `${t(team ? 'away' : 'home')} · ${this.kits[team].name[getLang()]}`;
    el.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
      b.classList.toggle('on', b.dataset.how === s.how);
      b.textContent = t(b.dataset.how === 'split' ? 'howSplit' : 'howFree');
    });
    $('.how-split', el).classList.toggle('hidden', s.how !== 'split');
    $('.how-free', el).classList.toggle('hidden', s.how !== 'free');
    const word = $<HTMLInputElement>('.word', el);
    if (document.activeElement !== word) word.value = s.word;
    word.placeholder = t('splitPh');
    el.querySelectorAll<HTMLInputElement>('.free-grid input').forEach((inp, i) => {
      if (document.activeElement !== inp) inp.value = s.members[i] ?? '';
      inp.placeholder = t('memberPh', { n: i + 1 });
    });
    const tname = $<HTMLInputElement>('.tname', el);
    if (document.activeElement !== tname) tname.value = s.name;
    tname.placeholder = t('teamNamePh');
    $('.hint', el).textContent = t(s.how === 'split' ? 'howSplitHint' : 'howFreeHint');
    this.renderRoster(team);
  }

  private renderRoster(team: 0 | 1): void {
    const s = this.slots[team];
    const el = s.el;
    const roster = $('.roster', el);
    roster.replaceChildren();
    const lang = getLang();
    for (const b of s.bundles ?? []) {
      const li = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = b.spec.name;
      const mv = document.createElement('span');
      mv.className = 'mv';
      mv.textContent = b.spec.signature.name[lang];
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = skillKindName(sportSkillFor(b.spec.signature).kind);
      li.append(name, mv, kind);
      roster.append(li);
    }
    const combo = $('.combo', el);
    const entry = s.input ? comboFor(SOCCER_COMBOS, s.input) : null;
    combo.replaceChildren();
    combo.classList.toggle('none', !entry);
    combo.classList.toggle('hidden', !s.input);
    // The 12 idiom combos first; otherwise a culture combo (文化连携) the four glyphs spell.
    const cult = !entry && s.input ? cultureFor(s.input) : null;
    combo.classList.toggle('none', !entry && !cult);
    if (entry) {
      const b = document.createElement('b');
      b.textContent = `${t('combo')}「${entry.name[lang]}」`;
      combo.append(b, document.createTextNode(` ${entry.desc[lang]}`));
    } else if (cult) {
      const b = document.createElement('b');
      b.textContent = `${t('cultureCombo')}「${cult.name}」`;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = TAG_TEXT[cult.tag][lang];
      combo.append(b, tag, document.createTextNode(` ${cultureSummary(cult, lang)}`));
    } else combo.textContent = t('noCombo');
    // Both teams registered as rivals: say so under the away team.
    const [a, bIn] = [this.slots[0].input, this.slots[1].input];
    const mu = a && bIn ? matchupFor(a, bIn) : null;
    if (mu && team === 1) combo.append(div('rival', `⚔ ${t('rivalry')}「${mu.name}」`));
  }

  /** Combo shown for a team: an idiom combo (translated) or a culture combo (kept as written). */
  private teamComboName(team: 0 | 1): string {
    const ts = this.match?.teams[team];
    return ts?.combo?.name[getLang()] ?? ts?.culture?.name ?? '';
  }

  private fillSlot(team: 0 | 1, tm: TeamInput): void {
    const s = this.slots[team];
    s.how = tm.how;
    s.word = tm.how === 'split' ? (tm.word ?? tm.name) : '';
    s.members = tm.how === 'free' ? tm.members.slice() : ['', '', '', ''];
    s.name = tm.how === 'free' && tm.name !== tm.members.join('・') ? tm.name : '';
    this.renderPanel(team);
  }

  private schedule(team: 0 | 1): void {
    const s = this.slots[team];
    clearTimeout(s.timer);
    s.timer = window.setTimeout(() => void this.rebuild(team), 280);
  }

  private async rebuild(team: 0 | 1): Promise<void> {
    const s = this.slots[team];
    const token = ++s.token;
    const err = $('.err', s.el);
    const res = buildTeam(s.how, s.how === 'split' ? s.word : s.members, TEAM_SIZE, s.name);
    if (!res.ok) {
      err.textContent = res.reason === 'count' ? t('errCount', { n: res.n }) : res.reason === 'empty' ? t('errEmpty') : t('errMember', { n: res.index + 1 });
      this.setBundles(team, null, null);
      return;
    }
    err.textContent = '';
    const built = await Promise.all(res.members.map((m) => buildFighter(m)));
    if (token !== s.token) return;
    const bad = built.findIndex((b) => !b.ok);
    if (bad >= 0) {
      err.textContent = t('errMember', { n: bad + 1 });
      this.setBundles(team, null, null);
      return;
    }
    this.setBundles(team, { how: res.how, name: res.name, members: res.members, word: res.word }, built.map((b) => (b as { ok: true; bundle: FighterBundle }).bundle));
  }

  private setBundles(team: 0 | 1, input: TeamInput | null, bundles: FighterBundle[] | null): void {
    const s = this.slots[team];
    s.bundles?.forEach(release);
    bundles?.forEach(retain);
    s.input = input;
    s.bundles = bundles;
    this.renderRoster(team);
    if (team === 0) this.renderRoster(1); // the rivalry note lives on the away card
    ($('#btn-kickoff') as HTMLButtonElement).disabled = !this.slots.every((x) => x.input && x.bundles);
    if (this.screen === 'select') this.view.setTeams([this.slots[0].bundles, this.slots[1].bundles]);
    const props: string[] = [];
    for (const b of bundles ?? []) {
      const o = b.spec.signature.opts;
      if (o?.prop) props.push(o.prop);
      if (o?.props) props.push(...o.props);
    }
    if (props.length) void this.view.loadProps(props);
  }

  private randomTeam(team: 0 | 1): void {
    const s = this.slots[team];
    if (Math.random() < 0.6) {
      s.how = 'split';
      s.word = IDIOMS[Math.floor(Math.random() * IDIOMS.length)];
    } else {
      s.how = 'free';
      s.members = Array.from({ length: TEAM_SIZE }, () => RANDOM_GLYPHS[Math.floor(Math.random() * RANDOM_GLYPHS.length)]);
      s.name = '';
    }
    this.renderPanel(team);
    void this.rebuild(team);
  }

  private async randomMatch(): Promise<void> {
    unlockAudio();
    playClip('ui_dice_roll');
    this.randomTeam(0);
    this.randomTeam(1);
    await Promise.all([this.rebuild(0), this.rebuild(1)]);
    this.kickoff();
  }

  private buildExamples(): void {
    const box = $('#examples');
    box.replaceChildren();
    for (const [a, b] of EXAMPLES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const label = (v: string | string[]) => (Array.isArray(v) ? v.join('・') : v);
      btn.textContent = `${label(a)} vs ${label(b)}`;
      btn.onclick = () => {
        click();
        ([a, b] as const).forEach((v, i) => {
          const s = this.slots[i];
          if (Array.isArray(v)) {
            s.how = 'free';
            s.members = v.slice();
            s.name = '';
          } else {
            s.how = 'split';
            s.word = v;
          }
          this.renderPanel(i as 0 | 1);
          void this.rebuild(i as 0 | 1);
        });
      };
      box.append(btn);
    }
  }

  // ---------------------------------------------------------------- match

  private kickoff(): void {
    const [a, b] = this.slots;
    if (!a.input || !b.input || !a.bundles || !b.bundles) return;
    unlockAudio();
    $('#shared-report')?.remove();
    const seed = this.pendingSeed ?? this.nextSeed;
    this.pendingSeed = null;
    this.nextSeed = randomSeed();
    this.applyKits(kitsFor(seed));
    if (this.arrival && !this.arrival.started) {
      this.arrival.started = true;
      track('challenge_match_started', { src: this.arrival.src ?? 'direct', kind: this.arrival.kind });
    }
    this.lastLineup = [a.input, b.input];
    this.view.setTeams([a.bundles, b.bundles]);
    void this.view.stadium.populate(seed);
    this.view.stadium.setBoardText([a.input.name, b.input.name, t('title'), '字形', 'GLYPH']);
    this.match = new Match([a.bundles.map((x) => x.spec), b.bundles.map((x) => x.spec)], [a.input, b.input], seed);
    this.view.start(this.match);
    this.setPaused(false);
    this.clearCommentary();
    this.sharePanel.close();
    for (const team of [0, 1] as const) {
      const el = $(`.sb-team[data-team="${team}"] .sb-name`);
      el.textContent = this.slots[team].input!.name;
    }
    this.showScreen('match');
    const pack = COMMENTARY[getLang()];
    this.say(0, pack.events.kickoff.p![0].replace('{team}', a.input.name));
  }

  /** Team colours for the 3D players and every piece of UI that names a team. */
  private applyKits(kits: [Kit, Kit]): void {
    this.kits = kits;
    this.view.setKits(kits);
    const st = $('#app').style;
    kits.forEach((k, i) => {
      const side = i ? 'b' : 'a';
      st.setProperty(`--team-${side}`, k.css);
      st.setProperty(`--team-${side}-on`, k.on);
      st.setProperty(`--team-${side}-ink`, k.ink);
    });
    for (const team of [0, 1] as const) {
      const label = this.slots[team].el.querySelector('.team-label');
      if (label) label.textContent = `${t(team ? 'away' : 'home')} · ${kits[team].name[getLang()]}`;
    }
  }

  private setPaused(p: boolean): void {
    this.view.paused = p;
    $('#pause-overlay').classList.toggle('hidden', !p);
  }

  private tickHud(): void {
    this.tickBubbles();
    const m = this.match;
    if (!m || this.screen !== 'match') return;
    $('#sb-score').textContent = `${m.score[0]} - ${m.score[1]}`;
    const clock = $('#sb-clock');
    const tt = Math.max(0, Math.min(m.clock, m.goldenGoal ? Infinity : MATCH_TIME));
    const mm = Math.floor(tt / 60), ss = Math.floor(tt % 60);
    clock.textContent = m.goldenGoal ? `${t('goldenGoal')} ${mm}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
    clock.classList.toggle('golden', m.goldenGoal);
    // Commentary queue.
    const now = performance.now() / 1000;
    if (!this.view.paused && this.queue.length && now >= this.nextLineAt) {
      const l = this.queue.shift()!;
      this.say(l.speaker, l.text);
    } else if (!this.view.paused && !this.queue.length && now - this.lastLineAt > 7 && m.phase === 'play') {
      const idle = COMMENTARY[getLang()].idle;
      this.queue.push({ speaker: 1, text: idle[Math.floor(Math.random() * idle.length)] });
    }
    for (const l of this.lines) l.el.classList.toggle('old', now > l.until);
  }

  private onMatchEvent(e: MatchEvent): void {
    sfxForEvent(e);
    const m = this.match;
    if (!m) return;
    const pack = COMMENTARY[getLang()];
    const lang = getLang();
    const name = (id: number | undefined) => (id !== undefined && id >= 0 ? m.players[id].spec.name : '');
    const fill = (s: string) =>
      s
        .replace(/\{p\}/g, name(e.a))
        .replace(/\{o\}/g, name(e.b))
        .replace(/\{team\}/g, m.teams[e.team].input.name)
        .replace(/\{move\}/g, e.a >= 0 ? m.players[e.a].spec.signature.name[lang] : '')
        .replace(/\{combo\}/g, this.teamComboName(e.team))
        .replace(/\{label\}/g, e.label ?? '')
        .replace(/\{s\}/g, `${m.score[0]}-${m.score[1]}`);
    const pick = (a?: string[]) => (a && a.length ? a[Math.floor(Math.random() * a.length)] : '');
    let key: string = e.type;
    if (e.type === 'goal' && e.kind === 'combo') key = 'comboGoal';
    else if (e.type === 'goal' && e.kind && e.kind !== 'normal' && e.kind !== 'bonus') key = 'skillGoal';
    if (e.type === 'finish' && e.v === -1) key = 'draw';
    if (e.type === 'combo' && e.kind === 'culture') key = 'culture';
    if (e.type === 'prim') key = e.kind?.startsWith('risk:') ? 'backfire' : '';
    const lines = pack.events[key];
    const important = ['goal', 'ownGoal', 'combo', 'skill', 'finish', 'goldenGoal', 'timeUp', 'brawl', 'rivalry'].includes(e.type) || (e.type === 'fight' && Math.random() < 0.5);
    if (lines && (important || Math.random() < 0.35)) {
      if (important) this.queue = [];
      if (lines.p?.length) this.queue.push({ speaker: 0, text: fill(pick(lines.p)) });
      if (lines.c?.length && (important || Math.random() < 0.4)) this.queue.push({ speaker: 1, text: fill(pick(lines.c)) });
      if (important) this.nextLineAt = 0;
    }
    if (e.type === 'goal' || e.type === 'ownGoal') this.banner(t(e.type === 'goal' ? 'w_goal' : 'w_ownGoal'));
    if (e.type === 'goldenGoal') this.banner(t('goldenGoal').toUpperCase(), true);
    // The stands react.
    const other = (e.team === 0 ? 1 : 0) as 0 | 1;
    const pl = e.a >= 0 ? m.players[e.a].spec.name : '';
    switch (e.type) {
      case 'goal':
        for (let i = 0; i < 3; i++) this.crowdBubble('goal', e.team, pl);
        this.crowdBubble('conceded', other, pl);
        break;
      case 'ownGoal':
        this.crowdBubble('goal', e.team, pl);
        this.crowdBubble('conceded', other, pl);
        break;
      case 'save':
        this.crowdBubble('save', e.team, pl);
        break;
      case 'shot':
        if (Math.random() < 0.35) this.crowdBubble('shot', e.team, pl);
        break;
      case 'skill':
        this.crowdBubble('skill', e.team, pl);
        break;
      case 'combo':
        this.crowdBubble(e.kind === 'culture' ? 'culture' : 'combo', e.team, pl);
        break;
      case 'rivalry':
        if (e.label) this.banner(`⚔ ${e.label}`, true);
        for (let i = 0; i < 3; i++) this.crowdBubble('rivalry', i % 2 ? 1 : 0, pl);
        break;
      case 'knockdown':
        if (Math.random() < 0.3) this.crowdBubble('knock', undefined, pl);
        break;
      case 'post':
        this.crowdBubble('post', undefined, pl);
        break;
      case 'fight':
        if (Math.random() < 0.5) this.crowdBubble('brawl', undefined, pl);
        break;
      case 'brawl':
        this.banner(t('w_brawl'));
        for (let i = 0; i < 3; i++) this.crowdBubble('brawl', undefined, pl);
        break;
      case 'finish':
        if (e.v === -1) for (let i = 0; i < 2; i++) this.crowdBubble('draw');
        else {
          for (let i = 0; i < 3; i++) this.crowdBubble('win', e.team);
          this.crowdBubble('lose', other);
        }
        break;
    }
  }

  // ---------------------------------------------------------------- crowd bubbles

  /** A spectator (of `team`, or anyone) shouts a line in a speech bubble above their head. */
  private crowdBubble(mood: CrowdMood, team?: 0 | 1, player = ''): void {
    const n = this.view.stadium.fanCount;
    if (!n || this.bubbles.length >= 7) return;
    const lines = COMMENTARY[getLang()].crowd[mood];
    let idx = -1;
    for (let tries = 0; tries < 24; tries++) {
      const i = Math.floor(Math.random() * n);
      if (team !== undefined && this.view.stadium.fanTeam(i) !== team) continue;
      if (this.bubbles.some((b) => b.idx === i) || !this.view.fanScreen(i).visible) continue;
      idx = i;
      break;
    }
    if (idx < 0) return;
    const fanTeam = this.view.stadium.fanTeam(idx);
    const teamName = this.slots[fanTeam].input?.name ?? '';
    const text = lines[Math.floor(Math.random() * lines.length)].replace(/\{team\}/g, clip(teamName, 8)).replace(/\{p\}/g, clip(player, 8));
    const el = div(`crowd-bubble t${fanTeam}`, text);
    $('#bubbles').append(el);
    this.bubbles.push({ el, idx, until: performance.now() / 1000 + 2.4 + Math.min(1.5, text.length * 0.05) });
  }

  private tickBubbles(): void {
    const now = performance.now() / 1000;
    if (now >= this.nextBubbleAt && !this.view.paused) {
      const playing = this.screen === 'match' && this.match?.phase === 'play';
      this.nextBubbleAt = now + (playing ? 0.7 + Math.random() * 1.0 : 1.4 + Math.random() * 1.6);
      if (this.screen === 'select') this.crowdBubble('pre', Math.random() < 0.5 ? 0 : 1);
      else if (playing) this.crowdBubble('idle', Math.random() < 0.5 ? 0 : 1);
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const p = this.view.fanScreen(b.idx);
      if (now > b.until || !p.visible) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      b.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      b.el.classList.toggle('fade', now > b.until - 0.4);
    }
  }

  private say(speaker: 0 | 1, text: string): void {
    if (!text) return;
    const box = $('#commentary');
    const row = div(`line s${speaker}`);
    const who = document.createElement('b');
    who.textContent = COMMENTARY[getLang()].speakers[speaker];
    const msg = document.createElement('span');
    msg.textContent = text;
    row.append(who, msg);
    box.append(row);
    const now = performance.now() / 1000;
    this.lines.push({ el: row, until: now + 4 });
    while (this.lines.length > 3) this.lines.shift()!.el.remove();
    this.lastLineAt = now;
    this.nextLineAt = now + Math.min(3.2, 1.4 + text.length * 0.04);
  }

  private clearCommentary(): void {
    this.queue = [];
    this.lines.forEach((l) => l.el.remove());
    this.lines = [];
  }

  private banner(text: string, small = false): void {
    const el = $('#banner');
    el.textContent = text;
    el.classList.toggle('small', small);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ---------------------------------------------------------------- result

  private showResult(m: Match): void {
    if (m !== this.match || !m.result) return;
    this.lastResult = m.result;
    this.renderResult(m.result, m);
    this.showScreen('result');
  }

  private playerName(id: number, teams: [TeamInput, TeamInput]): string {
    return id >= 0 ? teams[teamOfId(id)].members[id % TEAM_SIZE] : '';
  }

  private moveName(id: number): string {
    const s = this.slots[teamOfId(id)];
    return id >= 0 ? s.bundles?.[id % TEAM_SIZE]?.spec.signature.name[getLang()] ?? '' : '';
  }

  private comboName(team: 0 | 1, teams: [TeamInput, TeamInput]): string {
    return comboFor(SOCCER_COMBOS, teams[team])?.name[getLang()] ?? cultureFor(teams[team])?.name ?? '';
  }

  private lineText(l: ReportLine, teams: [TeamInput, TeamInput]): string {
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const assist = l.a !== undefined && l.a >= 0 ? reportText('assist', { a: this.playerName(l.a, teams) }) : '';
    return reportText(l.key, { min: l.t !== undefined ? mmss(l.t) : '', p: this.playerName(l.p, teams), assist, move: this.moveName(l.p), team: teams[l.team].name, combo: this.comboName(l.team, teams), n: l.n });
  }

  private renderResult(r: MatchResult, m: Match): void {
    const teams = r.teams;
    const sc = $('#res-score');
    sc.replaceChildren();
    const a = div('tn a', teams[0].name), n = div('n', `${r.score[0]} - ${r.score[1]}`), b = div('tn b', teams[1].name);
    sc.append(a, n, b);
    $('#res-winner').textContent = (r.winner === null ? t('drawText') : t('winText', { w: teams[r.winner].name })) + (r.goldenGoal ? ` (${t('goldenGoal')})` : '');
    const mvp = m.players[r.mvp];
    $('#res-mvp').textContent = `${t('mvp')}: ${t('mvpText', { p: mvp.spec.name, goals: mvp.stats.goals, move: mvp.spec.signature.name[getLang()] })}`;
    const ul = $('#report');
    ul.replaceChildren();
    for (const l of [...buildReport(r), ...statLines(r)].slice(0, 18)) {
      const li = document.createElement('li');
      li.textContent = this.lineText(l, teams);
      if (l.key.startsWith('goal')) li.className = l.team ? 'goal-b' : 'goal-a';
      ul.append(li);
    }
  }

  private resultCode(r: MatchResult): ResultCode {
    return { score: r.score, golden: r.goldenGoal, time: r.time, mvp: r.mvp, highlight: highlightOf(r) };
  }

  private cardData(code: ResultCode, teams: [TeamInput, TeamInput], mvpName: string, mvpGoals: number, mvpMove: string): CardData {
    const [sa, sb] = code.score;
    const winner = sa === sb ? null : sa > sb ? 0 : 1;
    return {
      title: t('title'),
      modeLabel: t('modeSoccer'),
      teams: [{ name: `${sa}  ${teams[0].name}`, color: cardColor(this.kits[0]) }, { name: `${sb}  ${teams[1].name}`, color: cardColor(this.kits[1]) }],
      headline: winner === null ? t('drawText') : t('winText', { w: teams[winner].name }),
      detail: `${t('modeSoccer')}${code.golden ? ` · ${t('goldenGoal')}` : ''}`,
      mvp: { label: t('mvp'), text: t('mvpText', { p: mvpName, goals: mvpGoals, move: mvpMove }) },
      highlight: code.highlight ? { label: t('highlight'), text: this.lineText(code.highlight, teams) } : undefined,
      footer: t('cardFooter', { site: this.siteHost() }),
      tag: t('shareTag'),
    };
  }

  private siteHost(): string {
    try {
      return new URL(SITE_URL || location.href).host;
    } catch {
      return location.host;
    }
  }

  private link(r: string | undefined, seed: number | undefined, src: ShareSource): string {
    const base = SHARE_BASE || (SITE_URL ? new URL(SITE_URL).toString() : undefined);
    return buildTeamLink({ mode: 'soccer', teams: this.lastLineup! }, { seed, r, source: src, lang: getLang(), base });
  }

  private async saveImage(): Promise<void> {
    const r = this.lastResult, m = this.match;
    if (!r || !m) return;
    playClip('ui_camera_shutter');
    const mvp = m.players[r.mvp];
    const canvas = await renderCard(this.cardData(this.resultCode(r), r.teams, mvp.spec.name, mvp.stats.goals, mvp.spec.signature.name[getLang()]), this.view.capture());
    const blob = await canvasToBlob(canvas);
    if (blob) {
      downloadBlob(blob, `glyph-soccer-${r.seed}.png`);
      track('share_image_download', { from: 'result' });
      this.toast(t('imageSaved'));
    }
  }

  private async share(): Promise<void> {
    const r = this.lastResult, m = this.match;
    if (!r || !m) return;
    const code = this.resultCode(r);
    const mvp = m.players[r.mvp];
    const shot = this.view.capture();
    const a = clip(r.teams[0].name), b = clip(r.teams[1].name);
    const res = r.winner === null ? t('drawText') : t('winText', { w: clip(r.teams[r.winner].name) });
    const rc = encodeResult(code);
    await this.sharePanel.open({
      title: t('title'),
      text: `${t('sharePost', { a, b, sa: r.score[0], sb: r.score[1], res })} ${t('shareTag')}`,
      resultUrl: (src) => this.link(rc, r.seed, src),
      challengeUrl: this.link(undefined, undefined, 'challenge'),
      challengeText: `${t('shareChallenge', { a, b })} ${t('shareTag')}`,
      image: () => renderCard(this.cardData(code, r.teams, mvp.spec.name, mvp.stats.goals, mvp.spec.signature.name[getLang()]), shot),
      filename: `glyph-soccer-${r.seed}.png`,
    });
  }

  /** A result link: show what really happened (never re-simulated as if it were the original). */
  private showSharedReport(link: ParsedTeamLink, code: ResultCode): void {
    const teams = link.lineup.teams;
    this.lastLineup = teams;
    const box = div('shared-report');
    box.id = 'shared-report';
    const [sa, sb] = code.score;
    const winner = sa === sb ? null : sa > sb ? 0 : 1;
    box.append(div('sr-title', t('reportTitle')), div('sr-names', `${teams[0].name}  ${sa} - ${sb}  ${teams[1].name}`), div('sr-head', winner === null ? t('drawText') : t('winText', { w: teams[winner].name })));
    const mvpName = this.playerName(code.mvp, teams);
    box.append(div('sr-detail', `${t('mvp')}: ${mvpName}${code.golden ? ` · ${t('goldenGoal')}` : ''}`));
    if (code.highlight) box.append(div('sr-hl', this.lineText(code.highlight, teams)));
    box.append(div('sr-note', t('reportNote')));
    const row = div('sr-actions');
    const mk = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.onclick = fn;
      row.append(b);
      return b;
    };
    const replay = mk(t('watchReplay'), 'primary', () => {
      this.pendingSeed = link.seed;
      this.kickoff();
    });
    replay.disabled = link.seed === null;
    mk(t('challengeMine'), 'secondary', () => {
      box.remove();
      this.pendingSeed = null;
      this.randomTeam(1);
    });
    mk(t('closeBtn'), 'ghost', () => box.remove());
    box.append(row, div('sr-note small', t('replayNote')));
    $('#screen-select').append(box);
  }

  private backToSelect(): void {
    this.match = null;
    this.applyKits(kitsFor(this.nextSeed));
    this.view.stop();
    this.setPaused(false);
    this.clearCommentary();
    this.view.setTeams([this.slots[0].bundles, this.slots[1].bundles]);
    this.showScreen('select');
  }

  private showScreen(s: Screen): void {
    this.screen = s;
    setAudioScene(s === 'select' ? 'menu' : s);
    $('#screen-select').classList.toggle('hidden', s !== 'select');
    $('#screen-match').classList.toggle('hidden', s !== 'match');
    $('#screen-result').classList.toggle('hidden', s !== 'result');
    const narrow = window.innerWidth <= 760;
    if (s === 'select') this.view.setFocusOffset(0, narrow ? 0.25 : 0.12);
    else if (s === 'result') this.view.setFocusOffset(narrow ? 0 : 0.2, narrow ? 0.25 : 0);
    else this.view.setFocusOffset(0, 0);
  }

  // ---------------------------------------------------------------- misc

  private buildLangSelect(): void {
    const sel = $<HTMLSelectElement>('#lang');
    sel.replaceChildren();
    for (const l of LANGS) {
      const o = document.createElement('option');
      o.value = l.id;
      o.textContent = l.label;
      sel.append(o);
    }
    sel.value = getLang();
    sel.onchange = () => setLang(sel.value as Lang);
  }

  private applyI18n(): void {
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
    document.title = `${t('title')} — Glyph Soccer`;
    for (const team of [0, 1] as const) this.renderPanel(team);
    this.updateTools();
    if (this.screen === 'result' && this.lastResult && this.match) this.renderResult(this.lastResult, this.match);
  }

  private updateTools(): void {
    $('#btn-quality').textContent = `${t('quality')}: ${t(this.view.quality)}`;
    $('#btn-sound').textContent = `${t('sound')}: ${t(sfxEnabled() ? 'on' : 'off')}`;
  }

  private toast(msg: string, ms = 1800): void {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  get debug(): { match: Match | null; raf: number; name: (n: MoveName) => string } {
    return { match: this.match, raf: this.raf, name: (n) => n[getLang()] };
  }
}

/** Team colour on the dark report card (black would vanish). */
const cardColor = (k: Kit) => (k.id === 'black' ? '#c8c8d8' : k.css);

function div(cls: string, text?: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}
