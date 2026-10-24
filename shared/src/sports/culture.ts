/**
 * Culture combos (文化连携): football teams from the culture pack and the V3 idiom table.
 * Each team is a small recipe — a trigger, 1–3 primitives and a backfire risk — run by the
 * game's combo engine (soccer/src/sim/culture.ts). The data is generated into cultureData.ts
 * from the design tables by shared/scripts/culture/classify.py (one registry for game + docs).
 * Basketball pairs use the same idea with a basketball vocabulary (BasketTrigger / BasketPrim /
 * BasketRisk), run by basketball/src/sim/culture.ts.
 */
import type { MoveName } from '../core/SignatureMoves';
import { BASKETBALL_CULTURE, CULTURE_CHARACTER_ROWS, CULTURE_MATCHUPS, EXPANSION_CHARACTER_ROWS, SOCCER_CULTURE } from './cultureData';
import type { TeamInput } from './team';

export type CultureTag = 'film' | 'anime' | 'myth' | 'idiom' | 'history' | 'society' | 'tech' | 'internet' | 'japanese' | 'english';

export type CultureTrigger =
  | 'attack' | 'midfield' | 'final3' | 'flank' | 'pressed'
  | 'defend' | 'danger' | 'loose' | 'lostBall'
  | 'kickoff' | 'behind' | 'lateBehind' | 'lateAhead' | 'late'
  | 'afterConcede' | 'afterShot' | 'afterSave' | 'afterTackle' | 'any';

export type CulturePrim =
  // on the ball
  | 'passChain' | 'throughBall' | 'lobPass' | 'longShot' | 'curveShot' | 'skyShot' | 'fakeShot' | 'boardPass' | 'switchPlay' | 'dribbleBurst'
  // team shape / timed team effects
  | 'sprint' | 'allOut' | 'retreat' | 'swapPositions' | 'chaosRun' | 'wallLine' | 'press' | 'keeperBoost' | 'calm' | 'grip' | 'tackleBoost'
  | 'accuracy' | 'recover' | 'heavyScreen' | 'celebrateBait' | 'playDead' | 'peace'
  // against the opponents / the pitch
  | 'markWrong' | 'spotlight' | 'slowZone' | 'pushWave' | 'stunCarrier' | 'scrambleOpp' | 'obstacle'
  // around shots
  | 'lucky' | 'extraKick';

export type CultureRisk = 'none' | 'trip' | 'crash' | 'wild' | 'tired' | 'gap' | 'celebrate' | 'boardCrash' | 'ownRisk';

export interface CultureCombo {
  key: string;
  /** Combo name (kept in its original language). */
  name: string;
  tag: CultureTag;
  source: 'culture' | 'v3';
  /** Original design description (Chinese). */
  desc: string;
  /** V3 note when both tables listed the same team. */
  v3?: string;
  trigger: CultureTrigger;
  prims: CulturePrim[];
  risk: CultureRisk;
  /** 'existing' = one of the 12 original idiom combos (kept as they are). */
  status: 'implemented' | 'existing';
  priority?: string;
}

export type BasketTrigger =
  | 'attack' | 'frontcourt' | 'paint' | 'perimeter' | 'pressed'
  | 'defend' | 'danger' | 'rebound' | 'afterMiss'
  | 'afterScore' | 'afterConcede' | 'afterSteal' | 'tipoff'
  | 'behind' | 'lateBehind' | 'lateAhead' | 'late' | 'any';

export type BasketPrim =
  // on the ball (real passes / shots / dunks)
  | 'alleyOop' | 'giveAndGo' | 'pickAndRoll' | 'backdoorCut' | 'crossover' | 'pumpFake' | 'highArc' | 'bankShot' | 'deepThree'
  | 'powerDunk' | 'curvePass' | 'fastBreak' | 'swapPass' | 'tipIn'
  // team effects
  | 'screen' | 'sprint' | 'swap' | 'doubleTeam' | 'paintWall' | 'blockBoost' | 'stealBoost' | 'reboundBoost' | 'lowGravity'
  | 'calm' | 'accuracy' | 'recover' | 'spotlight'
  // against the opponents / the court
  | 'markWrong' | 'decoyBall' | 'slowZone' | 'pushWave' | 'stunCarrier' | 'obstacle'
  // luck
  | 'lucky';

export type BasketRisk = 'none' | 'trip' | 'crash' | 'wild' | 'tired' | 'gap' | 'celebrate' | 'miscomm';

export interface CultureBasketPair {
  key: string;
  name: string;
  tag: CultureTag;
  /** 'bx' = basketball expansion pack. */
  source: 'culture' | 'v3' | 'bx';
  desc: string;
  trigger: BasketTrigger;
  prims: BasketPrim[];
  risk: BasketRisk;
  status: 'implemented';
  /** One of the 13 pairs registered earlier as idiom combos (BASKETBALL_COMBOS keeps its name). */
  idiom?: boolean;
}

export interface CultureMatchup {
  mode: 'soccer' | 'basketball';
  a: string;
  b: string;
  name: string;
  desc: string;
  effect?: 'counter' | 'weather' | 'spotlight' | 'chaos';
  status: 'implemented';
  source?: 'bx';
}

export interface CultureCharacterRow {
  key: string;
  name: string;
  level: string;
  source: 'culture' | 'v3' | 'bx';
  desc: string;
  /** Expansion rows: how it plays in basketball, and whether a new move was added or an existing one kept. */
  basket?: string;
  status?: 'new' | 'existing';
}

export { BASKETBALL_CULTURE, CULTURE_CHARACTER_ROWS, CULTURE_MATCHUPS, EXPANSION_CHARACTER_ROWS, SOCCER_CULTURE };

const norm = (s: string) => s.normalize('NFC').toUpperCase();
const SOCCER_INDEX = new Map(SOCCER_CULTURE.filter((c) => c.status === 'implemented').map((c) => [norm(c.key), c]));

/** The culture combo a football team spells (split word, or the four free members in order). */
export function cultureFor(team: Pick<TeamInput, 'word' | 'members'>): CultureCombo | null {
  return SOCCER_INDEX.get(norm(team.word ?? team.members.join(''))) ?? null;
}

const BASKET_INDEX = new Map(BASKETBALL_CULTURE.map((c) => [norm(c.key), c]));

/** The culture pair a basketball team spells (split word, or the two free members in order). */
export function basketCultureFor(team: Pick<TeamInput, 'word' | 'members'>): CultureBasketPair | null {
  return BASKET_INDEX.get(norm(team.word ?? team.members.join(''))) ?? null;
}

/** A registered matchup between two teams of that sport (either order). */
export function matchupFor(a: Pick<TeamInput, 'word' | 'members'>, b: Pick<TeamInput, 'word' | 'members'>, mode: 'soccer' | 'basketball' = 'soccer'): (CultureMatchup & { swapped: boolean }) | null {
  const ka = norm(a.word ?? a.members.join('')), kb = norm(b.word ?? b.members.join(''));
  for (const m of CULTURE_MATCHUPS) {
    if (m.mode !== mode) continue;
    if (norm(m.a) === ka && norm(m.b) === kb) return { ...m, swapped: false };
    if (norm(m.a) === kb && norm(m.b) === ka) return { ...m, swapped: true };
  }
  return null;
}

// ---------------------------------------------------------------- player-facing descriptions

type L = MoveName;
const n = (ja: string, zh: string, en: string): L => ({ ja, zh, en });

export const TRIGGER_TEXT: Record<CultureTrigger, L> = {
  attack: n('攻撃の組み立て時', '组织进攻时', 'Building an attack'),
  midfield: n('中盤でボールを持った時', '中场持球时', 'On the ball in midfield'),
  final3: n('ゴール前で', '球门前', 'Near the goal'),
  flank: n('サイドでボールを持った時', '边路持球时', 'On the ball out wide'),
  pressed: n('囲まれた時', '被包夹时', 'When pressed'),
  defend: n('相手が自陣に来た時', '对手攻入本方半场时', 'When the opponents attack'),
  danger: n('ゴールの危機に', '球门告急时', 'When the goal is in danger'),
  loose: n('こぼれ球に', '争夺无主球时', 'On a loose ball'),
  lostBall: n('ボールを奪われた直後', '刚丢掉球权时', 'Right after losing the ball'),
  kickoff: n('キックオフ直後', '开球后', 'Right after kick-off'),
  behind: n('負けている時', '落后时', 'When behind'),
  lateBehind: n('終盤に負けている時', '最后阶段落后时', 'Behind, late on'),
  lateAhead: n('終盤に勝っている時', '最后阶段领先时', 'Ahead, late on'),
  late: n('試合終盤', '比赛最后阶段', 'Late in the match'),
  afterConcede: n('失点直後', '刚丢球后', 'Right after conceding'),
  afterShot: n('シュートの跳ね返りに', '射门弹出后', 'After a shot bounces out'),
  afterSave: n('シュートを止めた直後', '扑出射门后', 'Right after a save'),
  afterTackle: n('ボールを奪った直後', '刚抢断后', 'Right after winning the ball'),
  any: n('いつでも', '随时', 'Any time'),
};

export const PRIM_TEXT: Record<CulturePrim, L> = {
  passChain: n('ワンタッチの連続パスから最後にシュート', '连续一脚传球，最后射门', 'quick passing chain, then a shot'),
  throughBall: n('最前線へスルーパス、受け手がダッシュ', '直塞给最前面的队友并让他加速', 'through ball to the furthest runner'),
  lobPass: n('高いロングパスからボレー', '高吊传球后凌空射门', 'high lob, volleyed first time'),
  longShot: n('遠くから強烈なロングシュート', '远距离强力射门', 'thunderous long-range shot'),
  curveShot: n('ポストの外から曲がるシュート', '从门柱外绕进的弧线球', 'shot that curls in from outside the post'),
  skyShot: n('バーの下に落ちる超高弾道シュート', '超高弧线吊门', 'sky-high lob that drops under the bar'),
  fakeShot: n('シュートフェイントでキーパーを倒し逆サイドへパス', '假射骗倒门将再横传', 'fake shot sends the keeper the wrong way, then a pass'),
  boardPass: n('フェンスに当てて味方へパス', '打围板反弹传给队友', 'pass off the boards to a teammate'),
  switchPlay: n('逆サイドへ大きく展開', '转移到另一侧', 'switch play to the far side'),
  dribbleBurst: n('タックルを弾くドリブル突破', '不怕铲的强行带球突破', 'tackle-proof dribbling burst'),
  sprint: n('チーム全員がスピードアップ', '全队提速', 'whole team speeds up'),
  allOut: n('全員攻撃（キーパーも上がる）', '全员压上（没人守门）', 'all-out attack (no keeper)'),
  retreat: n('全員がゴール前に戻る', '全员回防门前', 'everyone drops back to defend'),
  swapPositions: n('味方同士が瞬時にポジションチェンジ', '队友瞬间互换位置', 'teammates swap places'),
  chaosRun: n('予測不能な走り回り', '满场乱跑', 'unpredictable running'),
  wallLine: n('ボールとゴールの間に壁を作る', '在球与球门之间排成人墙', 'forms a wall between ball and goal'),
  press: n('ボール保持者を囲む', '围抢持球者', 'surrounds the ball carrier'),
  keeperBoost: n('キーパーが鉄壁になる', '门将变成铁壁', 'keeper becomes an iron wall'),
  calm: n('倒されない・止められない', '不会被撞倒或定身', 'cannot be knocked down or stunned'),
  grip: n('ボールを奪われにくい', '控球不易被抢', 'harder to tackle'),
  tackleBoost: n('タックルが強くなる', '抢断更强', 'stronger tackles'),
  accuracy: n('パスとシュートが正確になる', '传射更精准', 'more accurate passes and shots'),
  recover: n('倒れた味方がすぐ起き上がる', '倒地队友立刻起身', 'fallen teammates get straight up'),
  heavyScreen: n('一番重い選手が相手をブロック', '最重的队员卡住对手', 'the heaviest player screens a defender'),
  celebrateBait: n('みんなで一休み（その後元気に）', '全队先停下来（之后满血）', 'the team stops for a moment, then comes back energised'),
  playDead: n('全員で死んだふり、近くの相手が戸惑う', '全队装死，附近对手发愣', 'whole team plays dead; nearby opponents hesitate'),
  peace: n('両チームとも乱闘とタックルが減る', '双方都减少乱斗和铲抢', 'both sides fight and tackle less'),
  markWrong: n('相手のマーカーが惑わされる', '对手盯防被误导', 'opponents’ markers are fooled'),
  spotlight: n('スターに注目を集め、他の味方がフリーに', '吸引对手盯防明星，其他人跑出空位', 'draws defenders to one star, freeing the others'),
  slowZone: n('相手の周りに滑る・粘るゾーン', '在对手脚下制造减速区', 'slow zone under the opponents'),
  pushWave: n('衝撃波で周りの相手を吹き飛ばす', '冲击波推开附近对手', 'shockwave knocks nearby opponents back'),
  stunCarrier: n('相手のボール保持者を足止め', '定住对手持球人', 'stuns the opposing carrier'),
  scrambleOpp: n('相手の配置をシャッフル', '打乱对手站位', 'shuffles the opponents’ positions'),
  obstacle: n('ピッチに箱が滑り込みボールの進路を変える', '纸箱滑进场改变球路', 'a box slides onto the pitch and deflects the ball'),
  lucky: n('一度だけ幸運なバウンド', '一次幸运反弹', 'one lucky bounce'),
  extraKick: n('こぼれ球に追加の一蹴り', '弹出后补一脚', 'bonus kick at the rebound'),
};

export const RISK_TEXT: Record<CultureRisk, L> = {
  none: n('', '', ''),
  trip: n('味方が転ぶことも', '可能有队友摔倒', 'a teammate may trip'),
  crash: n('味方同士がぶつかることも', '队友可能互撞', 'teammates may collide'),
  wild: n('大きく外れることも', '可能踢飞', 'it can go wildly off'),
  tired: n('その後しばらく足が重い', '之后会累得变慢', 'tired and slower afterwards'),
  gap: n('守りがガラ空きになる', '后防会空出来', 'leaves the defence open'),
  celebrate: n('早すぎるお祝いで足が止まる', '提前庆祝，原地发呆', 'celebrates too early and stands still'),
  boardCrash: n('勢い余ってフェンスに激突', '冲过头撞上围板', 'can crash into the boards'),
  ownRisk: n('オウンゴールの危険', '有乌龙风险', 'own-goal danger'),
};

/** Short on-pitch word for each primitive / backfire (floats above the player). */
export const PRIM_WORD: Record<CulturePrim | `risk:${Exclude<CultureRisk, 'none'>}`, L> = {
  passChain: n('ワンタッチ連携！', '一脚连传！', 'One-touch chain!'),
  throughBall: n('スルーパス！', '直塞！', 'Through ball!'),
  lobPass: n('ロブ！', '高吊！', 'Lob!'),
  longShot: n('ロングシュート！', '远射！', 'From distance!'),
  curveShot: n('曲がる！', '弧线！', 'Curler!'),
  skyShot: n('天空シュート！', '天外飞仙！', 'Sky shot!'),
  fakeShot: n('フェイント！', '假射！', 'Dummy!'),
  boardPass: n('壁パス！', '撞墙传球！', 'Off the boards!'),
  switchPlay: n('サイドチェンジ！', '大转移！', 'Switch!'),
  dribbleBurst: n('突破！', '强突！', 'Breakaway!'),
  sprint: n('全員ダッシュ！', '全员加速！', 'Sprint!'),
  allOut: n('全員攻撃！', '全员压上！', 'All out!'),
  retreat: n('全員戻れ！', '全员回防！', 'Fall back!'),
  swapPositions: n('入れ替わり！', '换位！', 'Swap!'),
  chaosRun: n('カオス！', '乱跑！', 'Chaos!'),
  wallLine: n('人間の壁！', '人墙！', 'Wall!'),
  press: n('包囲！', '包夹！', 'Press!'),
  keeperBoost: n('鉄壁！', '铁壁！', 'Iron keeper!'),
  calm: n('不動心！', '稳如泰山！', 'Unshakeable!'),
  grip: n('キープ！', '护球！', 'Shielding!'),
  tackleBoost: n('猛タックル！', '狂铲！', 'Hard tackles!'),
  accuracy: n('精密！', '精准！', 'Pinpoint!'),
  recover: n('復活！', '满血复活！', 'Back up!'),
  heavyScreen: n('ブロック！', '卡位！', 'Screen!'),
  celebrateBait: n('ちょっと休憩', '先歇会儿', 'Snack break'),
  playDead: n('死んだふり', '装死', 'Playing dead'),
  peace: n('平和！', '和平！', 'Peace!'),
  markWrong: n('マーク違い！', '盯错人了！', 'Wrong man!'),
  spotlight: n('スポットライト！', '聚光灯！', 'Spotlight!'),
  slowZone: n('ネバネバ地帯！', '减速区！', 'Sticky zone!'),
  pushWave: n('衝撃波！', '冲击波！', 'Shockwave!'),
  stunCarrier: n('足止め！', '定身！', 'Stunned!'),
  scrambleOpp: n('シャッフル！', '站位大乱！', 'Scrambled!'),
  obstacle: n('箱が来た！', '纸箱来了！', 'Box incoming!'),
  lucky: n('ラッキー！', '好运！', 'Lucky!'),
  extraKick: n('もう一発！', '补射！', 'Again!'),
  'risk:trip': n('コケた！', '摔了！', 'Tripped!'),
  'risk:crash': n('ゴツン！', '撞一起了！', 'Bonk!'),
  'risk:wild': n('ふかした！', '踢飞了！', 'Skied it!'),
  'risk:tired': n('バテた…', '累了…', 'Exhausted…'),
  'risk:gap': n('ガラ空き！', '后防空了！', 'Wide open!'),
  'risk:celebrate': n('祝うの早い！', '庆祝太早！', 'Too early!'),
  'risk:boardCrash': n('フェンス激突！', '撞板了！', 'Into the boards!'),
  'risk:ownRisk': n('逆方向！', '踢反了！', 'Wrong way!'),
};

export const TAG_TEXT: Record<CultureTag, L> = {
  film: n('映画', '电影', 'Film'),
  anime: n('アニメ・漫画', '动漫', 'Anime'),
  myth: n('神話・伝説', '神话传说', 'Myth'),
  idiom: n('四字熟語', '成语', 'Idiom'),
  history: n('歴史', '历史', 'History'),
  society: n('社会・日常', '社会日常', 'Everyday'),
  tech: n('テクノロジー', '科技', 'Tech'),
  internet: n('ネット', '网络', 'Internet'),
  japanese: n('日本語', '日语', 'Japanese'),
  english: n('英語', '英语', 'English'),
};

/** One-line description of what a culture combo does, in the current language. */
export function cultureSummary(c: CultureCombo, lang: keyof L): string {
  const sep = lang === 'en' ? '; ' : '、';
  const body = c.prims.map((p) => PRIM_TEXT[p][lang]).join(sep);
  const risk = c.risk !== 'none' ? (lang === 'en' ? ` Risk: ${RISK_TEXT[c.risk].en}.` : `（${lang === 'ja' ? 'リスク' : '风险'}：${RISK_TEXT[c.risk][lang]}）`) : '';
  return lang === 'en' ? `${TRIGGER_TEXT[c.trigger].en}: ${body}.${risk}` : `${TRIGGER_TEXT[c.trigger][lang]}：${body}${risk}`;
}

// ---------------------------------------------------------------- basketball descriptions

export const BASKET_TRIGGER_TEXT: Record<BasketTrigger, L> = {
  attack: n('攻め上がる時', '推进时', 'Bringing the ball up'),
  frontcourt: n('敵陣でボールを持った時', '前场持球时', 'On the ball in the frontcourt'),
  paint: n('ゴール下で', '篮下', 'In the paint'),
  perimeter: n('スリーポイントライン付近で', '三分线附近', 'Out on the perimeter'),
  pressed: n('ぴったりマークされた時', '被贴身防守时', 'When tightly guarded'),
  defend: n('相手が攻めてきた時', '对手进攻时', 'When the opponents attack'),
  danger: n('ゴール下のピンチに', '篮下告急时', 'When the rim is in danger'),
  rebound: n('リバウンド争いで', '争抢篮板时', 'Fighting for a rebound'),
  afterMiss: n('シュートが外れた直後', '投篮不中后', 'Right after a miss'),
  afterScore: n('得点した直後', '得分后', 'Right after scoring'),
  afterConcede: n('失点直後', '失分后', 'Right after conceding'),
  afterSteal: n('スティール直後', '抢断后', 'Right after a steal'),
  tipoff: n('ティップオフ直後', '跳球后', 'Right after the tip-off'),
  behind: n('負けている時', '落后时', 'When behind'),
  lateBehind: n('終盤に負けている時', '最后阶段落后时', 'Behind, late on'),
  lateAhead: n('終盤に勝っている時', '最后阶段领先时', 'Ahead, late on'),
  late: n('試合終盤', '比赛最后阶段', 'Late in the game'),
  any: n('いつでも', '随时', 'Any time'),
};

export const BASKET_PRIM_TEXT: Record<BasketPrim, L> = {
  alleyOop: n('ロブパスから空中でダンク', '高抛传球接空中扣篮', 'lob pass into a mid-air dunk'),
  giveAndGo: n('パス＆ゴーでリターンを受けてレイアップ', '传切配合，回传上篮', 'give-and-go, return pass, layup'),
  pickAndRoll: n('味方のスクリーンを使ってドライブ', '借队友掩护突破', 'drives off a teammate’s screen'),
  backdoorCut: n('裏へのカットにバウンドパス', '反跑空切接击地传球', 'backdoor cut and bounce pass'),
  crossover: n('クロスオーバーで抜き去る', '变向突破晃倒防守', 'crossover that shakes the defender'),
  pumpFake: n('シュートフェイントで相手を跳ばせる', '假投骗防守起跳', 'pump fake sends the defender flying'),
  highArc: n('ブロックできない超高弾道シュート', '盖不到的超高弧线投篮', 'sky-high arc, hard to block'),
  bankShot: n('ボードに当てるシュート', '打板投篮', 'bank shot off the glass'),
  deepThree: n('超ロングスリー', '超远三分', 'deep three'),
  powerDunk: n('相手を吹き飛ばすパワーダンク', '撞飞对手的暴力扣篮', 'power dunk that bowls people over'),
  curvePass: n('ディフェンスを避けて曲がるパス', '绕开防守的弧线传球', 'pass that curves around a defender'),
  fastBreak: n('二人で速攻、ロングパス', '两人快攻长传', 'two-man fast break with a long pass'),
  swapPass: n('瞬時のポジション交換からパス', '瞬间换位后传球', 'swap places, then pass'),
  tipIn: n('こぼれ球をすぐタップイン', '补篮', 'tip-in on the rebound'),
  screen: n('重い方がディフェンスを止める', '重的队员卡住防守', 'the heavier one screens a defender'),
  sprint: n('二人ともスピードアップ', '两人提速', 'both speed up'),
  swap: n('二人が瞬時に入れ替わる', '两人瞬间换位', 'the two swap places'),
  doubleTeam: n('ボール保持者をダブルチーム', '包夹持球人', 'double-teams the ball carrier'),
  paintWall: n('二人でゴール下を固める', '两人守住篮下', 'both wall off the rim'),
  blockBoost: n('ブロックが強くなる', '盖帽更强', 'better shot blocking'),
  stealBoost: n('スティールが強くなる', '抢断更强', 'better steals'),
  reboundBoost: n('リバウンドの読みとジャンプが上がる', '篮板判断和弹跳提升', 'better rebounding'),
  lowGravity: n('ふわっと長くジャンプ', '低重力，滞空更久', 'low-gravity hang time'),
  calm: n('倒されない・止められない', '不会被撞倒或定身', 'cannot be knocked down or stunned'),
  accuracy: n('シュートとパスが正確に', '投传更精准', 'more accurate shots and passes'),
  recover: n('倒れた味方がすぐ起き上がる', '倒地队友立刻起身', 'fallen teammates get straight up'),
  spotlight: n('相手がスターに集中、もう一人がフリー', '对手盯住明星，另一人空位', 'defenders crowd the star, the other one is free'),
  markWrong: n('相手のマークが惑わされる', '对手盯防被误导', 'defenders are fooled'),
  decoyBall: n('偽のボールの幻影で相手を釣る', '假球幻影诱骗防守', 'a ghost ball lures the defence'),
  slowZone: n('相手の足元を滑りやすく', '对手脚下变滑', 'slippery floor under the opponents'),
  pushWave: n('衝撃波で周りを吹き飛ばす', '冲击波推开附近对手', 'shockwave knocks people back'),
  stunCarrier: n('相手のボール保持者を足止め', '定住对手持球人', 'stuns the opposing carrier'),
  obstacle: n('コートに障害物が出現', '场上出现障碍物', 'an obstacle appears on court'),
  lucky: n('一度だけリングが味方する', '篮筐帮一次忙', 'the rim is kind once'),
};

export const BASKET_RISK_TEXT: Record<BasketRisk, L> = {
  none: n('', '', ''),
  trip: n('転ぶことも', '可能摔倒', 'someone may trip'),
  crash: n('二人がぶつかることも', '两人可能相撞', 'the two may collide'),
  wild: n('とんでもない所へ飛ぶことも', '可能投出三不沾', 'it can fly way off'),
  tired: n('その後しばらく足が重い', '之后会累得变慢', 'tired and slower afterwards'),
  gap: n('外がガラ空きに', '外线会空出来', 'leaves the perimeter open'),
  celebrate: n('祝うのが早すぎて戻りが遅れる', '提前庆祝，回防慢', 'celebrates too early'),
  miscomm: n('パスが合わないことも', '可能配合失误', 'the pass may go astray'),
};

export const BASKET_PRIM_WORD: Record<BasketPrim | `risk:${Exclude<BasketRisk, 'none'>}`, L> = {
  alleyOop: n('アリウープ！', '空中接力！', 'Alley-oop!'),
  giveAndGo: n('パス＆ゴー！', '传切！', 'Give and go!'),
  pickAndRoll: n('ピック＆ロール！', '挡拆！', 'Pick and roll!'),
  backdoorCut: n('バックドア！', '反跑！', 'Backdoor!'),
  crossover: n('クロスオーバー！', '变向！', 'Crossover!'),
  pumpFake: n('フェイク！', '假投！', 'Pump fake!'),
  highArc: n('レインボー！', '彩虹弧线！', 'Rainbow!'),
  bankShot: n('バンク！', '打板！', 'Off the glass!'),
  deepThree: n('ディープスリー！', '超远三分！', 'From downtown!'),
  powerDunk: n('パワーダンク！', '暴扣！', 'Power dunk!'),
  curvePass: n('曲がるパス！', '弧线传球！', 'Curving pass!'),
  fastBreak: n('速攻！', '快攻！', 'Fast break!'),
  swapPass: n('入れ替わり！', '换位传球！', 'Swap!'),
  tipIn: n('タップイン！', '补篮！', 'Tip-in!'),
  screen: n('スクリーン！', '掩护！', 'Screen!'),
  sprint: n('ダッシュ！', '加速！', 'Sprint!'),
  swap: n('チェンジ！', '换位！', 'Switch!'),
  doubleTeam: n('ダブルチーム！', '包夹！', 'Double team!'),
  paintWall: n('ゴール下の壁！', '篮下铁壁！', 'Wall in the paint!'),
  blockBoost: n('ブロック準備！', '准备盖帽！', 'Block party!'),
  stealBoost: n('スティール狙い！', '准备抢断！', 'Hands up!'),
  reboundBoost: n('リバウンド！', '抢篮板！', 'Board man!'),
  lowGravity: n('低重力！', '低重力！', 'Low gravity!'),
  calm: n('不動心！', '稳如泰山！', 'Unshakeable!'),
  accuracy: n('集中！', '专注！', 'Locked in!'),
  recover: n('復活！', '满血复活！', 'Back up!'),
  spotlight: n('スポットライト！', '聚光灯！', 'Spotlight!'),
  markWrong: n('マーク違い！', '盯错人了！', 'Wrong man!'),
  decoyBall: n('偽ボール！', '假球！', 'Ghost ball!'),
  slowZone: n('ツルツル！', '地板好滑！', 'Slippery!'),
  pushWave: n('衝撃波！', '冲击波！', 'Shockwave!'),
  stunCarrier: n('足止め！', '定身！', 'Stunned!'),
  obstacle: n('障害物！', '障碍物！', 'Obstacle!'),
  lucky: n('ラッキー！', '好运！', 'Lucky!'),
  'risk:trip': n('コケた！', '摔了！', 'Tripped!'),
  'risk:crash': n('ゴツン！', '撞一起了！', 'Bonk!'),
  'risk:wild': n('エアボール！', '三不沾！', 'Airball!'),
  'risk:tired': n('バテた…', '累了…', 'Exhausted…'),
  'risk:gap': n('外がガラ空き！', '外线空了！', 'Wide open!'),
  'risk:celebrate': n('祝うの早い！', '庆祝太早！', 'Too early!'),
  'risk:miscomm': n('息が合わない！', '配合失误！', 'Miscommunication!'),
};

/** One-line description of what a basketball pair does, in the current language. */
export function basketSummary(c: CultureBasketPair, lang: keyof L): string {
  const sep = lang === 'en' ? '; ' : '、';
  const body = c.prims.map((p) => BASKET_PRIM_TEXT[p][lang]).join(sep);
  const risk = c.risk !== 'none' ? (lang === 'en' ? ` Risk: ${BASKET_RISK_TEXT[c.risk].en}.` : `（${lang === 'ja' ? 'リスク' : '风险'}：${BASKET_RISK_TEXT[c.risk][lang]}）`) : '';
  return lang === 'en' ? `${BASKET_TRIGGER_TEXT[c.trigger].en}: ${body}.${risk}` : `${BASKET_TRIGGER_TEXT[c.trigger][lang]}：${body}${risk}`;
}
