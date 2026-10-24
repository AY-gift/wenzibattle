/**
 * 文化技能图鉴: every entry of the culture pack straight from the registry the game uses
 * (shared/src/sports/cultureData.ts + MOVE_TABLE), so the catalog can never drift from the game.
 * Football teams and basketball pairs link to a game with that team.
 */
import { MOVE_TABLE, type MoveEntry } from '@shared/core/SignatureMoves';
import { BASKETBALL_COMBOS, SOCCER_COMBOS } from '@shared/sports/combos';
import {
  BASKETBALL_CULTURE, CULTURE_CHARACTER_ROWS, CULTURE_MATCHUPS, EXPANSION_CHARACTER_ROWS, SOCCER_CULTURE, TAG_TEXT, basketSummary, cultureSummary,
  type CultureCombo, type CultureTag,
} from '@shared/sports/culture';
import { sportSkillFor } from '@shared/sports/skills';
import { splitTeam } from '@shared/sports/team';
import { buildTeamLink } from '@shared/sports/teamLinks';
import { gameUrl } from '@shared/ui/GameSwitcher';
import { getLang, initLang, LANGS, setLang, skillKindName, type Lang } from './ui/i18n';
import './catalog.css';

type Tab = 'soccer' | 'basket' | 'chars' | 'matchups';
type Status = 'all' | 'new' | 'reused';

const TXT: Record<Lang, Record<string, string>> = {
  ja: {
    title: '文化技能図鑑', back: '← サッカーへ', intro: '四文字のチーム名・二文字ペア・一文字／単語・宿命の対決。すべてゲームと同じデータから表示しています。',
    soccer: 'サッカー連携', basket: 'バスケ2人組', chars: '一文字・単語', matchups: '宿命の対決', search: '検索（例：少林）', allTags: 'すべてのジャンル',
    sAll: 'すべての状態', sNew: '新規実装', sReused: '既存を流用', play: 'このチームで試合 ▶', playBasket: 'このコンビでバスケ ▶', new: '新規', reused: '既存', idiomPair: '熟語コンビ',
    count: '{n} 件', arena: 'リング必殺', pitch: 'ピッチでは', idiomKept: '元の四字熟語連携をそのまま使用', effect: '対決ルール',
    counter: '片方が連携を出すと、もう片方もすぐ反撃できる', chaos: '序盤から連携が頻繁に飛び交う', weather: '両陣に滑るエリアが出現（両チームとも減速）', spotlight: '序盤、相手はスターを集中マーク',
    risk: 'リスク', design: '原案',
  },
  zh: {
    title: '文化技能图鉴', back: '← 返回足球', intro: '四字队名、两字组合、单字/词语、宿敌对决——全部直接读取游戏使用的同一份数据。',
    soccer: '足球连携', basket: '篮球双人', chars: '单字·词语', matchups: '宿敌对决', search: '搜索（例：少林）', allTags: '全部类别',
    sAll: '全部状态', sNew: '新实现', sReused: '复用已有', play: '用这支队踢一场 ▶', playBasket: '用这对搭档打一场篮球 ▶', new: '新增', reused: '复用', idiomPair: '成语搭档',
    count: '{n} 条', arena: '擂台必杀', pitch: '球场上', idiomKept: '沿用原有的成语连携', effect: '对决规则',
    counter: '一方发动连携后，另一方可以立刻反击', chaos: '开场阶段连携频繁', weather: '双方半场出现减速区（两队都受影响）', spotlight: '开场对手集中盯防明星',
    risk: '风险', design: '原设计',
  },
  en: {
    title: 'Culture Skill Catalog', back: '← Back to football', intro: 'Four-glyph teams, two-glyph pairs, single glyphs and words, rivalries — all read from the same data the game uses.',
    soccer: 'Football combos', basket: 'Basketball pairs', chars: 'Glyphs & words', matchups: 'Rivalries', search: 'Search (e.g. 少林)', allTags: 'All genres',
    sAll: 'Any status', sNew: 'Newly implemented', sReused: 'Reused existing', play: 'Play with this team ▶', playBasket: 'Play basketball with this duo ▶', new: 'New', reused: 'Reused', idiomPair: 'Idiom pair',
    count: '{n} entries', arena: 'Arena move', pitch: 'On the pitch', idiomKept: 'Keeps the original idiom combo', effect: 'Duel rule',
    counter: 'when one side fires its combo, the other can answer at once', chaos: 'combos fly early and often', weather: 'slippery patches in both halves (both teams slow)', spotlight: 'early on, the opponents crowd the star',
    risk: 'Risk', design: 'Design note',
  },
};
const tx = (k: string) => TXT[getLang()][k] ?? k;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = (tag: string, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

let tab: Tab = (new URLSearchParams(location.search).get('tab') as Tab) || 'soccer';
const moveOf = (key: string): MoveEntry | undefined => MOVE_TABLE.find((e) => e.keys.includes(key));
const IDIOM = new Map(SOCCER_COMBOS.flatMap((c) => c.keys.map((k) => [k, c] as const)));
const BASKET_IDIOM = new Map(BASKETBALL_COMBOS.flatMap((c) => c.keys.map((k) => [k, c] as const)));

function playLink(key: string, vs?: string): string {
  const a = splitTeam(key, 4), b = splitTeam(vs ?? '风平浪静', 4);
  if (!a.ok || !b.ok) return './';
  return buildTeamLink({ mode: 'soccer', teams: [a, b] }, { base: new URL('./', location.href).href, lang: getLang() });
}

/** Basketball lives next door (…/basketball/, or its own dev port). */
function basketLink(key: string, vs?: string): string {
  const a = splitTeam(key, 2), b = splitTeam(vs ?? (key === '兄弟' ? '冰火' : '兄弟'), 2);
  if (!a.ok || !b.ok) return gameUrl('basketball', 'soccer');
  return buildTeamLink({ mode: 'basketball', teams: [a, b] }, { base: gameUrl('basketball', 'soccer'), lang: getLang() });
}

function badge(kind: 'new' | 'reused'): HTMLElement {
  return el('span', `badge ${kind}`, tx(kind));
}

function soccerCard(c: CultureCombo, lang: Lang): HTMLElement {
  const card = el('article', 'card');
  const head = el('div', 'head');
  head.append(el('b', 'key', c.key), el('span', 'name', `「${c.name}」`), el('span', 'tag', TAG_TEXT[c.tag][lang]), badge(c.status === 'existing' ? 'reused' : 'new'));
  card.append(head);
  const idiom = IDIOM.get(c.key);
  card.append(el('p', 'what', c.status === 'existing' && idiom ? `${tx('idiomKept')}「${idiom.name[lang]}」：${idiom.desc[lang]}` : cultureSummary(c, lang)));
  card.append(el('p', 'design', `${tx('design')}：${c.desc}`));
  const a = el('a', 'play', tx('play')) as HTMLAnchorElement;
  a.href = playLink(c.key);
  card.append(a);
  return card;
}

function render(): void {
  const lang = getLang();
  document.title = `${tx('title')} — Glyph Soccer`;
  $('title').textContent = tx('title');
  $('back').textContent = tx('back');
  $('intro').textContent = tx('intro');
  ($('q') as HTMLInputElement).placeholder = tx('search');
  const tabs = $('tabs');
  tabs.replaceChildren();
  for (const id of ['soccer', 'basket', 'chars', 'matchups'] as Tab[]) {
    const b = el('button', id === tab ? 'on' : '', tx(id));
    b.setAttribute('role', 'tab');
    b.onclick = () => {
      tab = id;
      render();
    };
    tabs.append(b);
  }
  // Filters (tag only for the football table).
  const tagSel = $('tag') as HTMLSelectElement;
  const keepTag = tagSel.value;
  tagSel.replaceChildren(new Option(tx('allTags'), ''));
  for (const t of Object.keys(TAG_TEXT) as CultureTag[]) tagSel.append(new Option(TAG_TEXT[t][lang], t));
  tagSel.value = keepTag;
  tagSel.hidden = tab !== 'soccer' && tab !== 'basket';
  const stSel = $('status') as HTMLSelectElement;
  const keepSt = stSel.value || 'all';
  stSel.replaceChildren(...(['all', 'new', 'reused'] as Status[]).map((s) => new Option(tx(`s${s[0].toUpperCase()}${s.slice(1)}`), s)));
  stSel.value = keepSt;
  const q = ($('q') as HTMLInputElement).value.trim().toLowerCase();
  const st = stSel.value as Status;
  const hit = (...xs: string[]) => !q || xs.some((x) => x.toLowerCase().includes(q));
  const list = $('list');
  list.replaceChildren();
  let n = 0;
  if (tab === 'soccer') {
    for (const c of SOCCER_CULTURE) {
      const s: Status = c.status === 'existing' ? 'reused' : 'new';
      if ((st !== 'all' && st !== s) || (tagSel.value && c.tag !== tagSel.value) || !hit(c.key, c.name, c.desc)) continue;
      list.append(soccerCard(c, lang));
      n++;
    }
  } else if (tab === 'basket') {
    for (const c of BASKETBALL_CULTURE) {
      const idiom = BASKET_IDIOM.get(c.key);
      if ((st !== 'all' && st !== 'new') || (tagSel.value && c.tag !== tagSel.value) || !hit(c.key, c.name, c.desc, idiom?.name[lang] ?? '')) continue;
      const card = el('article', 'card');
      const head = el('div', 'head');
      head.append(el('b', 'key', c.key), el('span', 'name', `「${idiom?.name[lang] ?? c.name}」`), el('span', 'tag', idiom ? tx('idiomPair') : TAG_TEXT[c.tag][lang]), badge('new'));
      card.append(head, el('p', 'what', basketSummary(c, lang)), el('p', 'design', `${tx('design')}：${c.desc}`));
      const a = el('a', 'play', tx('playBasket')) as HTMLAnchorElement;
      a.href = basketLink(c.key);
      card.append(a);
      list.append(card);
      n++;
    }
  } else if (tab === 'chars') {
    for (const r of [...CULTURE_CHARACTER_ROWS, ...EXPANSION_CHARACTER_ROWS]) {
      const e = moveOf(r.key);
      const s: Status = e?.pack === 'culture' || e?.pack === 'basketball' ? 'new' : 'reused';
      if ((st !== 'all' && st !== s) || !hit(r.key, r.name, r.desc, e?.name[lang] ?? '')) continue;
      const card = el('article', 'card');
      const head = el('div', 'head');
      head.append(el('b', 'key', r.key), el('span', 'name', `「${e?.name[lang] ?? r.name}」`), badge(s));
      card.append(head);
      if (e) {
        const sk = sportSkillFor({ kind: e.kind, name: e.name, key: r.key, opts: e.opts });
        card.append(el('p', 'what', `${tx('arena')}：${e.name[lang]}${e.opts?.prop ? ` ${e.opts.prop}` : ''} ／ ${tx('pitch')}：${skillKindName(sk.kind)}`));
      }
      if (r.basket) card.append(el('p', 'what', `🏀 ${r.basket}`));
      card.append(el('p', 'design', `${tx('design')}：${r.name} — ${r.desc}`));
      list.append(card);
      n++;
    }
  } else {
    for (const mu of CULTURE_MATCHUPS) {
      if ((st !== 'all' && st !== 'new') || !hit(mu.a, mu.b, mu.name, mu.desc)) continue;
      const card = el('article', 'card');
      const head = el('div', 'head');
      head.append(el('b', 'key', `${mu.a} ⚔ ${mu.b}`), el('span', 'name', `「${mu.name}」`), el('span', 'tag', mu.mode === 'soccer' ? '⚽' : '🏀'), badge('new'));
      card.append(head);
      if (mu.effect) card.append(el('p', 'what', `${tx('effect')}：${tx(mu.effect)}`));
      card.append(el('p', 'design', `${tx('design')}：${mu.desc}`));
      const a = el('a', 'play', tx(mu.mode === 'soccer' ? 'play' : 'playBasket')) as HTMLAnchorElement;
      a.href = mu.mode === 'soccer' ? playLink(mu.a, mu.b) : basketLink(mu.a, mu.b);
      card.append(a);
      list.append(card);
      n++;
    }
  }
  $('count').textContent = tx('count').replace('{n}', String(n));
}

initLang();
const langSel = $('lang') as HTMLSelectElement;
for (const l of LANGS) langSel.append(new Option(l.label, l.id));
langSel.value = getLang();
langSel.onchange = () => {
  setLang(langSel.value as Lang);
  render();
};
for (const id of ['q', 'tag', 'status']) $(id).addEventListener('input', render);
render();
