/**
 * Signature moves (必殺技 / 必杀技). Common characters, words and internet slang get a move
 * that fits their meaning; everything else gets a generic move chosen from its strongest
 * stat, so every fighter has one. Mechanics live in the simulator; this file is data +
 * selection only (and the source for the generated docs in docs/skills/).
 */
import type { BehaviorTag } from './BehaviorResolver';
import type { Stats } from './StatGenerator';
import { EXPANSION_MOVES } from './movesExpansion';

export type MoveKind =
  | 'barrage' | 'uppercut' | 'quake' | 'beam' | 'whirlwind' | 'charge' | 'giant' | 'freeze' | 'heal'
  | 'meteor' | 'kick' | 'throw' | 'shield' | 'roar' | 'magnet' | 'poison' | 'bribe' | 'lecture'
  | 'chomp' | 'joke' | 'confuse'
  // batch 2 (design list): mostly combinations of existing actions
  | 'sweep' | 'giantFall' | 'swallow' | 'mountain' | 'fireCharge' | 'laughQuake' | 'lazy' | 'feint'
  | 'fishSlap' | 'blame' | 'drop' | 'vanish' | 'topple' | 'random' | 'glare' | 'rage'
  // batch 3 (daily vocabulary pack)
  | 'clones';

/** Per-entry tuning for moves that share one mechanic (props, finales, visual flavour). */
export interface MoveOpts {
  /** Text/emoji built into a 3D prop (dropped, thrown or swung). */
  prop?: string;
  /** How many props fall. */
  count?: number;
  /** Prop is thrown from the fighter in an arc instead of falling from the sky. */
  arc?: boolean;
  /** The fighter falls over at the end (comedy finale). */
  selfFall?: boolean;
  /** Springs up into a surprise attack when the move ends. */
  counter?: boolean;
  /** Visual flavour for reused mechanics. */
  fx?: 'water' | 'gas' | 'paper' | 'heart' | 'ice' | 'wind';
  // ---- batch 3 (daily vocabulary) ----
  /** Show `prop` held next to the fighter for the whole move (bento, umbrella, coffee…). */
  hold?: boolean;
  /** Visual only: `prop` drops onto the fighter / flies at the opponent when the move starts. */
  propAt?: 'self' | 'opponent';
  /** Several different props for a drop (cycled). */
  props?: string[];
  /** Status applied when a dropped prop hits. */
  onHit?: 'freeze' | 'confuse' | 'sleep';
  /** Drop props (count × prop) on the opponent when the move ends. */
  finaleDrop?: boolean;
  /** 熊孩子拆家: the last prop lands on the fighter itself. */
  chaos?: boolean;
  /** Tuning for dropped props. */
  dmgScale?: number;
  kbScale?: number;
  upScale?: number;
  /** Roar after a 1-2-3 countdown (我数到三！). */
  countdown?: boolean;
  /** Roar several times, getting stronger (哇——！). */
  pulses?: number;
  /** Finale: the fighter dozes off / gets dizzy. */
  selfSleep?: boolean;
  selfStun?: boolean;
  /** 一键关灯: the arena goes dark and the opponent loses its bearings. */
  darkness?: boolean;
  /** Size boost while the move lasts (肉弹战车). */
  grow?: number;
  /** Keep the fighter's normal width during a sweep (a held broom does the sweeping). */
  noStretch?: boolean;
  /** Override the move's duration (seconds). */
  duration?: number;
  // ---- V2 ----
  /** Move-specific clip (audio manifest id) played when the move starts, on top of the usual cue. */
  sfx?: string;
}

export type KeyLang = 'zh' | 'ja' | 'en' | 'other';

export interface MoveName {
  ja: string;
  zh: string;
  en: string;
}

export interface Signature {
  kind: MoveKind;
  name: MoveName;
  /** The character / word that granted it (empty for shape-based moves). */
  key: string;
  opts?: MoveOpts;
  /** Passive traits that give the text its everyday fighting style (平时怎么打). */
  normal?: BehaviorTag[];
}

export interface MoveEntry {
  keys: string[];
  kind: MoveKind;
  name: MoveName;
  opts?: MoveOpts;
  /** Passive traits for the everyday fighting style (merged into the fighter's behaviour tags). */
  normal?: BehaviorTag[];
  /** ★ = first-priority item from the design list. */
  star?: boolean;
  /** Language folder of the text keys (emoji/symbol keys are always 'other'). Omitted = classify per key. */
  lang?: KeyLang;
  /** Design pack that added the entry (for reports): the culture pack or the basketball expansion. */
  pack?: 'culture' | 'basketball';
}

const n = (ja: string, zh: string, en: string): MoveName => ({ ja, zh, en });

// Single characters match any grapheme; longer keys match as substrings (latin keys
// case-insensitively and only as whole words). At the same position the longest key wins,
// so 牛逼 beats 牛 and 草泥马 beats 草.
export const MOVE_TABLE: MoveEntry[] = [
  // ======== Batch 6: basketball expansion characters (generated, shared/docs/design/basketball-expansion) ========
  ...EXPANSION_MOVES,
  // ======== Batch 5: culture pack characters & words (docs/design/culture-pack) ========
  // Each one is an existing arena mechanic with its own prop / name; on the football pitch the
  // same move becomes the matching sport skill (shared/src/sports/skills.ts).
  // ---- 中文 物件 ----
  { pack: 'culture', lang: 'zh', keys: ['伞', '傘'], kind: 'shield', name: n('逆さ傘ガード', '反向撑伞', 'Inside-Out Umbrella'), opts: { prop: '☂️', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['镜', '鏡'], kind: 'feint', name: n('鏡の見間違い', '镜面误判', 'Mirror Misread'), opts: { prop: '🪞', propAt: 'self' }, normal: ['ghost'] },
  { pack: 'culture', lang: 'zh', keys: ['鞋'], kind: 'sweep', name: n('靴ひもトラップ', '鞋带陷阱', 'Shoelace Trap'), opts: { prop: '👟', hold: true, noStretch: true } },
  { pack: 'culture', lang: 'zh', keys: ['袜', '襪'], kind: 'drop', name: n('くさい靴下ブーメラン', '臭袜回旋', 'Stinky Sock Boomerang'), opts: { prop: '🧦', arc: true, onHit: 'confuse' } },
  { pack: 'culture', lang: 'zh', keys: ['锅', '鍋'], kind: 'uppercut', name: n('中華鍋で打ち上げ', '翻锅起飞', 'Wok Toss Launch'), opts: { prop: '🍳', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['筷'], kind: 'freeze', name: n('お箸でつまむ', '筷子夹夹乐', 'Chopstick Pinch'), opts: { prop: '🥢', propAt: 'opponent' } },
  { pack: 'culture', lang: 'zh', keys: ['勺'], kind: 'uppercut', name: n('ひとすくいで天まで', '一勺上天', 'One Scoop to the Sky'), opts: { prop: '🥄', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['纸', '紙'], kind: 'charge', name: n('紙飛行機アタック', '纸飞机突袭', 'Paper Plane Raid'), opts: { prop: '✈️', hold: true, fx: 'paper' } },
  { pack: 'culture', lang: 'zh', keys: ['笔', '筆'], kind: 'beam', name: n('神の一筆', '神来一笔', 'Stroke of Genius'), opts: { prop: '🖊️', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['胶', '膠'], kind: 'drop', name: n('超強力ボンド', '超级黏胶', 'Super Glue'), opts: { prop: '🧴', onHit: 'freeze' } },
  { pack: 'culture', lang: 'zh', keys: ['糖'], kind: 'charge', name: n('シュガーラッシュ', '糖分爆发', 'Sugar Rush'), opts: { prop: '🍭', hold: true, selfStun: true }, normal: ['hasty'] },
  { pack: 'culture', lang: 'zh', keys: ['灯', '燈'], kind: 'confuse', name: n('チカチカ点滅', '一闪一闪', 'Twinkle Twinkle'), opts: { prop: '💡', propAt: 'opponent' } },
  { pack: 'culture', lang: 'zh', keys: ['钟', '鐘'], kind: 'roar', name: n('鐘の大音響', '钟声震天', 'Bell Toll Blast'), opts: { prop: '🔔', hold: true, pulses: 2 } },
  { pack: 'culture', lang: 'zh', keys: ['铃', '鈴'], kind: 'magnet', name: n('チリンチリンの罠', '叮铃陷阱', 'Jingle Lure'), opts: { prop: '🎐', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['叉'], kind: 'shield', name: n('クロスブロック', '交叉拦截', 'Cross Block'), opts: { prop: '❌', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['轮', '輪'], kind: 'whirlwind', name: n('風火輪', '风火轮', 'Wind-Fire Wheels'), opts: { prop: '🛞', hold: true }, normal: ['spinner'] },
  { pack: 'culture', lang: 'zh', keys: ['轴', '軸'], kind: 'whirlwind', name: n('軸足ターン', '中心旋转', 'Pivot Spin'), normal: ['spinner'] },
  { pack: 'culture', lang: 'zh', keys: ['针', '針'], kind: 'beam', name: n('針の穴を通す', '细针穿线', 'Thread the Needle'), opts: { prop: '🪡', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['网', '網'], kind: 'freeze', name: n('天網恢恢', '天罗地网', 'Net of Heaven'), opts: { prop: '🕸️', propAt: 'opponent' } },
  { pack: 'culture', lang: 'zh', keys: ['笼', '籠'], kind: 'drop', name: n('檻の中の獣', '笼中困兽', 'Caged Beast'), opts: { prop: '🪤', onHit: 'freeze' } },
  { pack: 'culture', lang: 'zh', keys: ['票'], kind: 'drop', name: n('チケットどこ？', '门票在哪', 'Where’s My Ticket?'), opts: { prop: '🎫', count: 3, onHit: 'confuse' } },
  { pack: 'culture', lang: 'zh', keys: ['箱'], kind: 'drop', name: n('びっくり箱', '惊喜开箱', 'Surprise Box'), opts: { prop: '📦', arc: true, kbScale: 1.6 } },
  { pack: 'culture', lang: 'zh', keys: ['钥', '鑰'], kind: 'beam', name: n('マスターキー', '万能钥匙', 'Master Key'), opts: { prop: '🗝️', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['碗'], kind: 'drop', name: n('お椀かぶせ', '倒扣饭碗', 'Upturned Bowl'), opts: { prop: '🥣', onHit: 'confuse' } },
  { pack: 'culture', lang: 'zh', keys: ['剪'], kind: 'barrage', name: n('チョキチョキ', '咔嚓剪断', 'Snip Snip'), opts: { prop: '✂️', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['盐', '鹽'], kind: 'poison', name: n('塩でくしゃみ', '盐雾大喷嚏', 'Salty Sneeze Mist'), opts: { prop: '🧂', hold: true } },
  // ---- 中文 身体·形状 ----
  { pack: 'culture', lang: 'zh', keys: ['瘦'], kind: 'vanish', name: n('線になるほど細い', '薄到只剩线', 'Thin as a Line'), normal: ['tiny'] },
  { pack: 'culture', lang: 'zh', keys: ['歪'], kind: 'random', name: n('まぐれ当たり', '歪打正着', 'Lucky Miss'), opts: { prop: '🎯', propAt: 'self' }, normal: ['chaos'] },
  { pack: 'culture', lang: 'zh', keys: ['影'], kind: 'clones', name: n('影が主役を奪う', '影子抢镜', 'Shadow Steals the Scene'), normal: ['ghost'] },
  { pack: 'culture', lang: 'zh', keys: ['舌'], kind: 'magnet', name: n('ベロ伸ばし', '长舌鞭击', 'Long-Tongue Lash'), opts: { prop: '👅', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['肩'], kind: 'charge', name: n('鉄の肩で道を開く', '铁肩开路', 'Iron Shoulder'), normal: ['heavy'] },
  { pack: 'culture', lang: 'zh', keys: ['肚'], kind: 'shield', name: n('おなかバウンド', '肚皮弹球', 'Belly Bounce'), opts: { grow: 1.25 }, normal: ['bouncy'] },
  // ---- 中文 建筑·交通 ----
  { pack: 'culture', lang: 'zh', keys: ['桥', '橋'], kind: 'kick', name: n('ひとっ飛び橋渡し', '一桥飞渡', 'Bridge Leap'), opts: { prop: '🌉', propAt: 'self' } },
  { pack: 'culture', lang: 'zh', keys: ['塔'], kind: 'giant', name: n('タワーディフェンス', '高塔防守', 'Tower Defense'), opts: { prop: '🗼', propAt: 'self' } },
  { pack: 'culture', lang: 'zh', keys: ['弓'], kind: 'beam', name: n('満月の一矢', '满弓远射', 'Full-Draw Shot'), opts: { prop: '🏹', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['锚', '錨'], kind: 'shield', name: n('いかりを下ろす', '抛锚停车', 'Drop Anchor'), opts: { prop: '⚓', hold: true }, normal: ['heavy'] },
  { pack: 'culture', lang: 'zh', keys: ['帆'], kind: 'charge', name: n('追い風で出航', '顺风起航', 'Set Sail Downwind'), opts: { prop: '⛵', hold: true, fx: 'wind' } },
  { pack: 'culture', lang: 'zh', keys: ['船'], kind: 'charge', name: n('陸の船', '旱地行船', 'Boat on Dry Land'), opts: { prop: '🚣', hold: true, grow: 1.3 } },
  // ---- 中文 天象·自然 ----
  { pack: 'culture', lang: 'zh', keys: ['月'], kind: 'drop', name: n('三日月ブーメラン', '弯月回旋', 'Crescent Boomerang'), opts: { prop: '🌙', arc: true } },
  { pack: 'culture', lang: 'zh', keys: ['云', '雲'], kind: 'poison', name: n('暗雲たちこめる', '乌云盖顶', 'Looming Cloud'), opts: { prop: '☁️', propAt: 'self', fx: 'gas' } },
  { pack: 'culture', lang: 'zh', keys: ['雾', '霧'], kind: 'confuse', name: n('霧の森', '迷雾森林', 'Fog Forest'), opts: { darkness: true } },
  { pack: 'culture', lang: 'zh', keys: ['沙'], kind: 'whirlwind', name: n('砂嵐', '黄沙漫天', 'Sandstorm'), opts: { prop: '🏜️', propAt: 'self', fx: 'wind' } },
  { pack: 'culture', lang: 'zh', keys: ['泥'], kind: 'drop', name: n('ぬかるみの罠', '泥地陷阱', 'Mud Trap'), opts: { prop: '🟫', onHit: 'freeze', dmgScale: 0.6 } },
  { pack: 'culture', lang: 'zh', keys: ['泡'], kind: 'drop', name: n('ぷかぷか泡', '泡泡弹弹', 'Bouncy Bubbles'), opts: { prop: '🫧', count: 4, upScale: 2 }, normal: ['bouncy'] },
  // ---- 中文 家庭·日常 ----
  { pack: 'culture', lang: 'zh', keys: ['爷爷', '爺爺'], kind: 'lecture', name: n('昔はなあ…', '想当年啊', 'Back in My Day'), opts: { prop: '📷', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['开会', '開會'], kind: 'shield', name: n('緊急会議', '紧急会议', 'Emergency Meeting'), opts: { prop: '🗂️', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['闹钟', '鬧鐘'], kind: 'roar', name: n('あと五分だけ', '再睡五分钟', 'Five More Minutes'), opts: { prop: '⏰', hold: true, pulses: 3, selfSleep: true }, normal: ['sleepy'] },
  { pack: 'culture', lang: 'zh', keys: ['堵车', '塞车', '塞車'], kind: 'drop', name: n('大渋滞', '全线堵塞', 'Total Gridlock'), opts: { props: ['🚗', '🚙', '🚕'], count: 3 } },
  { pack: 'culture', lang: 'zh', keys: ['地铁', '地鐵'], kind: 'charge', name: n('終電が来たぞ', '末班车来啦', 'Last Train!'), opts: { prop: '🚇', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['电梯', '電梯'], kind: 'uppercut', name: n('定員オーバー上昇', '超载上升', 'Overloaded Lift'), opts: { prop: '🛗', propAt: 'self' } },
  { pack: 'culture', lang: 'zh', keys: ['迷路'], kind: 'confuse', name: n('ルート再検索中', '导航重规划', 'Recalculating Route'), opts: { prop: '🧭', propAt: 'opponent' } },
  { pack: 'culture', lang: 'zh', keys: ['退款'], kind: 'shield', name: n('返金されました', '钱退回来', 'Refund Bounce'), opts: { prop: '💸', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['排队', '排隊'], kind: 'shield', name: n('順番にお並びください', '请按顺序', 'Please Queue Up'), opts: { prop: '🚧', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['插队', '插隊'], kind: 'vanish', name: n('ちょっと失礼', '不好意思借过', 'Excuse Me, Coming Through') },
  { pack: 'culture', lang: 'zh', keys: ['打喷嚏', '打噴嚏'], kind: 'roar', name: n('くしゃみ大砲', '阿嚏大炮', 'Sneeze Cannon'), opts: { prop: '🤧', propAt: 'self', fx: 'wind' } },
  { pack: 'culture', lang: 'zh', keys: ['翻车', '翻車'], kind: 'topple', name: n('全員横転', '全员翻车', 'Total Wipeout'), opts: { prop: '🛒', propAt: 'self' }, normal: ['slip'] },
  { pack: 'culture', lang: 'zh', keys: ['再说', '再說'], kind: 'lazy', name: n('また今度', '以后再说', 'Let’s Talk Later'), opts: { counter: true } },
  { pack: 'culture', lang: 'zh', keys: ['导航', '導航'], kind: 'charge', name: n('その先、左です！', '前方左转！', 'Turn Left Ahead!'), opts: { prop: '↩️', hold: true } },
  { pack: 'culture', lang: 'zh', keys: ['打折'], kind: 'drop', name: n('全品半額', '全场五折', 'Half-Price Sale'), opts: { prop: '🏷️', count: 2, onHit: 'confuse' } },
  { pack: 'culture', lang: 'zh', keys: ['包邮', '包郵'], kind: 'drop', name: n('送料無料', '包邮到家', 'Free Shipping'), opts: { prop: '📦', counter: true } },
  { pack: 'culture', lang: 'zh', keys: ['关机', '關機'], kind: 'lazy', name: n('長押しで電源オフ', '长按关机', 'Hold to Power Off'), opts: { counter: true, darkness: true } },
  { pack: 'culture', lang: 'zh', keys: ['口香糖'], kind: 'drop', name: n('噛むほどネバネバ', '越嚼越黏', 'Chewier and Stickier'), opts: { prop: '🫧', onHit: 'freeze' } },
  { pack: 'culture', lang: 'zh', keys: ['没事', '沒事'], kind: 'lazy', name: n('大丈夫です！', '我没事！', 'I’m Fine!'), opts: { counter: true, prop: '🪧', hold: true } },
  // ---- 中文 文化·网络 ----
  { pack: 'culture', lang: 'zh', keys: ['少林'], kind: 'kick', name: n('カンフー稽古', '功夫练习', 'Kung Fu Practice') },
  { pack: 'culture', lang: 'zh', keys: ['热血', '熱血'], kind: 'rage', name: n('青春燃焼', '青春燃烧', 'Burning Youth'), normal: ['angry'] },
  { pack: 'culture', lang: 'zh', keys: ['电影', '電影'], kind: 'freeze', name: n('アクション！', '开拍！', 'Action!'), opts: { prop: '🎬', propAt: 'opponent' } },
  { pack: 'culture', lang: 'zh', keys: ['动画', '動畫'], kind: 'clones', name: n('コマ送り変身', '逐帧变身', 'Frame-by-Frame Transform') },
  { pack: 'culture', lang: 'zh', keys: ['武功'], kind: 'throw', name: n('柔よく剛を制す', '借力打力', 'Use Their Force') },
  { pack: 'culture', lang: 'zh', keys: ['冠军', '冠軍'], kind: 'drop', name: n('早すぎる優勝祝い', '冠军提前庆祝', 'Celebrating Too Soon'), opts: { prop: '🏆', arc: true, selfFall: true }, normal: ['royal'] },
  { pack: 'culture', lang: 'zh', keys: ['乌龙', '烏龍'], kind: 'kick', name: n('オウンゴール名人', '乌龙球大师', 'Own-Goal Master'), opts: { selfFall: true }, normal: ['slip'] },
  { pack: 'culture', lang: 'zh', keys: ['考古'], kind: 'drop', name: n('出土品ドーン', '古物出土', 'Dig-Site Surprise'), opts: { prop: '⚱️', upScale: 2.2 } },
  { pack: 'culture', lang: 'zh', keys: ['量子'], kind: 'vanish', name: n('量子の重ね合わせ', '量子误读', 'Quantum Misread'), normal: ['ghost'] },
  { pack: 'culture', lang: 'zh', keys: ['股市'], kind: 'uppercut', name: n('乱高下チャート', '红绿波动', 'Market Rollercoaster'), opts: { prop: '📈', propAt: 'self' } },
  // ---- 中文 动作 ----
  { pack: 'culture', lang: 'zh', keys: ['反'], kind: 'feint', name: n('逆転の発想', '反向思考', 'Reverse Psychology') },
  // ======== Batch 4: high-frequency inputs V2 (docs/design/daily-vocab-v2) ========
  // ---- 中文 代词·情绪·形容 ----
  { lang: 'zh', keys: ['我'], kind: 'magnet', name: n('主人公オーラ', '主角光环', 'Main Character Aura'), opts: { prop: '🌟', hold: true, selfStun: true }, normal: ['royal'] },
  { lang: 'zh', keys: ['你'], kind: 'charge', name: n('お前だ！', '就是你！', 'It’s YOU!'), opts: { prop: '👉', propAt: 'opponent' } },
  { lang: 'zh', keys: ['他', '她'], kind: 'blame', name: n('全部あいつのせい', '都是他的错', 'All Their Fault'), opts: { prop: '👉' }, normal: ['coward'] },
  { lang: 'zh', keys: ['恨'], kind: 'rage', name: n('恨み帳', '小本本记仇', 'Grudge Notebook'), opts: { prop: '📒', hold: true }, normal: ['angry'] },
  { lang: 'zh', keys: ['穷', '窮'], kind: 'drop', name: n('残高不足', '余额不足', 'Insufficient Funds'), opts: { sfx: 'move_payment_fail', prop: '🏺', upScale: 2.2 }, normal: ['coward'] },
  { lang: 'zh', keys: ['赢', '贏'], kind: 'drop', name: n('早すぎる祝杯', '半场开香槟', 'Popping Champagne Early'), opts: { sfx: 'move_champagne_pop', prop: '🍾', arc: true, selfFall: true }, normal: ['royal'] },
  { lang: 'zh', keys: ['输', '輸'], kind: 'lazy', name: n('負けず嫌い', '败者不服', 'Sore Loser'), opts: { counter: true, prop: '🏳️', hold: true }, normal: ['coward'] },
  { lang: 'zh', keys: ['神'], kind: 'drop', name: n('神の一手', '神之一手', 'Hand of God'), opts: { prop: '✋', kbScale: 1.5 }, normal: ['royal'] },
  { lang: 'zh', keys: ['菜'], kind: 'drop', name: n('ヘタすぎて発光', '菜到发光', 'So Bad It Glows'), opts: { prop: '🥬', arc: true, onHit: 'confuse' }, normal: ['slip'] },
  { lang: 'zh', keys: ['帅', '帥'], kind: 'confuse', name: n('イケメン反射光', '帅到反光', 'Blinding Good Looks'), opts: { prop: '✨', propAt: 'opponent' }, normal: ['charm'] },
  { lang: 'zh', keys: ['丑', '醜'], kind: 'roar', name: n('びっくり変顔', '惊吓暴击', 'Scary Face Crit'), opts: { prop: '👹', propAt: 'opponent' } },
  { lang: 'zh', keys: ['酸'], kind: 'confuse', name: n('酸っぱすぎて歪む', '酸到扭曲', 'Sour Face Twist'), opts: { prop: '🍋', propAt: 'opponent' } },
  { lang: 'zh', keys: ['甜'], kind: 'drop', name: n('あまあまネバネバ弾', '甜蜜黏黏弹', 'Sticky Sweet Bomb'), opts: { prop: '🍬', onHit: 'freeze' }, normal: ['charm'] },
  { lang: 'zh', keys: ['辣'], kind: 'fireCharge', name: n('辛すぎて火を噴く', '辣到喷火', 'Too Spicy, Breathing Fire'), opts: { prop: '🌶️', hold: true }, normal: ['hasty', 'fire'] },
  { lang: 'zh', keys: ['香'], kind: 'magnet', name: n('いい匂いにつられて', '闻香而来', 'Follow the Smell'), opts: { prop: '🍲', hold: true } },
  { lang: 'zh', keys: ['黑', '黒'], kind: 'charge', name: n('全画面ブラックアウト', '全场黑屏', 'Total Blackout'), opts: { darkness: true }, normal: ['ghost'] },
  { lang: 'zh', keys: ['白'], kind: 'whirlwind', name: n('真っ白', '白茫茫', 'Whiteout'), opts: { sfx: 'move_paper_flurry', prop: '📄', count: 3, finaleDrop: true } },
  { lang: 'zh', keys: ['左'], kind: 'whirlwind', name: n('左折し続ける', '左转到底', 'Keep Turning Left'), opts: { prop: '⬅️', hold: true }, normal: ['spinner'] },
  { lang: 'zh', keys: ['右'], kind: 'whirlwind', name: n('右折し続ける', '右转到底', 'Keep Turning Right'), opts: { prop: '➡️', hold: true }, normal: ['spinner'] },
  { lang: 'zh', keys: ['下'], kind: 'quake', name: n('どこまでも沈む', '一沉到底', 'All the Way Down'), opts: { prop: '⬇️', propAt: 'self' }, normal: ['heavy'] },
  { lang: 'zh', keys: ['停'], kind: 'freeze', name: n('急ブレーキ！', '急刹车！', 'Emergency Brake!'), opts: { prop: '🛑', propAt: 'opponent' } },
  { lang: 'zh', keys: ['开', '開'], kind: 'roar', name: n('開けゴマ', '芝麻开门', 'Open Sesame'), opts: { sfx: 'move_door_slam', prop: '🚪', propAt: 'opponent', fx: 'wind' } },
  { lang: 'zh', keys: ['关', '關'], kind: 'drop', name: n('閉店ガラガラ', '关门大吉', 'Closing Time'), opts: { sfx: 'move_door_slam', prop: '🚪', onHit: 'freeze' } },
  { lang: 'zh', keys: ['锁', '鎖'], kind: 'freeze', name: n('カチッと施錠', '咔哒上锁', 'Click, Locked'), opts: { sfx: 'move_lock_click', prop: '🔒', propAt: 'opponent' } },
  { lang: 'zh', keys: ['真'], kind: 'beam', name: n('真実はいつもひとつ', '真相只有一个', 'Only One Truth'), opts: { prop: '🔍', hold: true } },
  { lang: 'zh', keys: ['假'], kind: 'feint', name: n('本物はどっち', '真假难辨', 'Spot the Fake'), opts: { prop: '🪧', propAt: 'self' }, normal: ['ghost'] },
  { lang: 'zh', keys: ['乐', '樂'], kind: 'roar', name: n('ハッピーマーチ', '欢乐进行曲', 'Happy March'), opts: { pulses: 3, prop: '🎵', hold: true }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['惨', '慘'], kind: 'drop', name: n('踏んだり蹴ったり', '惨上加惨', 'From Bad to Worse'), opts: { props: ['🪣', '🧱', '🛋️'], count: 3, chaos: true, dmgScale: 0.8 }, normal: ['slip'] },
  { lang: 'zh', keys: ['好'], kind: 'drop', name: n('いいね×3！', '好好好！', 'Good Good Good!'), opts: { sfx: 'move_like_pop', prop: '👍', count: 3, kbScale: 1.3 }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['坏', '壞'], kind: 'kick', name: n('悪だくみ', '坏主意', 'Bad Idea'), opts: { prop: '🍌', propAt: 'opponent', selfFall: true }, normal: ['chaos'] },
  { lang: 'zh', keys: ['新'], kind: 'shield', name: n('新品出荷', '全新出厂', 'Factory Fresh'), opts: { prop: '🎁', hold: true } },
  { lang: 'zh', keys: ['鼻'], kind: 'roar', name: n('特大くしゃみ', '惊天喷嚏', 'Mega Sneeze'), opts: { sfx: 'move_sneeze', prop: '🤧', hold: true, fx: 'wind' } },
  { lang: 'zh', keys: ['脑', '腦'], kind: 'quake', name: n('発想が爆発', '脑洞大开', 'Mind Blown'), opts: { prop: '💡', propAt: 'self' } },
  // ---- 中文 动物 ----
  { lang: 'zh', keys: ['鸭', '鴨'], kind: 'clones', name: n('ガーガー大行進', '嘎嘎大游行', 'Quack Parade'), opts: { sfx: 'move_quack' }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['鹅', '鵝'], kind: 'barrage', name: n('ガチョウの追撃', '大鹅追杀', 'Goose Chase'), opts: { sfx: 'move_goose_honk', prop: '🪶', count: 2 }, normal: ['angry', 'pounce'] },
  { lang: 'zh', keys: ['兔'], kind: 'kick', name: n('ウサギキック', '兔子蹬腿', 'Bunny Kick'), opts: { prop: '🥕', propAt: 'opponent' }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['鼠'], kind: 'vanish', name: n('ネズミの穴掘り', '老鼠打洞', 'Mouse Tunnel'), normal: ['tiny', 'hasty'] },
  { lang: 'zh', keys: ['猴'], kind: 'drop', name: n('桃泥棒', '猴子偷桃', 'Peach Thief'), opts: { prop: '🍑', arc: true }, normal: ['bouncy', 'chaos'] },
  { lang: 'zh', keys: ['虫', '蟲'], kind: 'clones', name: n('ムシムシ軍団', '虫虫军团', 'Bug Brigade'), normal: ['tiny'] },
  { lang: 'zh', keys: ['魔'], kind: 'swallow', name: n('手品失敗', '魔术失误', 'Magic Trick Gone Wrong'), opts: { prop: '🎩', hold: true }, normal: ['chaos'] },
  // ---- 中文 语气词 ----
  { lang: 'zh', keys: ['啊'], kind: 'roar', name: n('あああああ！', '啊啊啊啊！', 'AAAAAH!'), opts: { pulses: 3, selfStun: true } },
  { lang: 'zh', keys: ['嗯'], kind: 'drop', name: n('うーん……？', '嗯……？', 'Hmm……?'), opts: { prop: '❓', count: 2 } },
  { lang: 'zh', keys: ['哦'], kind: 'charge', name: n('なるほど！', '原来如此！', 'Oh, I Get It!'), opts: { prop: '💡', propAt: 'self' } },
  { lang: 'zh', keys: ['唉'], kind: 'roar', name: n('ため息ひとつ', '一声叹息', 'One Long Sigh'), opts: { fx: 'wind' }, normal: ['sleepy'] },
  { lang: 'zh', keys: ['哼'], kind: 'feint', name: n('ふん！知らない', '哼！不理你', 'Hmph! Ignoring You'), opts: { prop: '💨', propAt: 'self' }, normal: ['angry'] },
  { lang: 'zh', keys: ['滚', '滾'], kind: 'charge', name: n('地球から出てけ', '滚出地球', 'Roll Off the Planet'), opts: { grow: 1.4 }, normal: ['spinner'] },
  { lang: 'zh', keys: ['赞', '讚'], kind: 'drop', name: n('いいね連打', '疯狂点赞', 'Like Spam'), opts: { sfx: 'move_like_pop', prop: '👍', count: 4, upScale: 1.6 }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['点赞', '點讚'], kind: 'drop', name: n('いいね振り切れ', '赞到爆表', 'Off-the-Charts Likes'), opts: { sfx: 'move_like_pop', prop: '👍', count: 4, upScale: 2 }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['踩'], kind: 'drop', name: n('ペシャンコ踏み', '一脚踩扁', 'Stomped Flat'), opts: { prop: '👟', upScale: 1.8 }, normal: ['heavy'] },
  // ---- 中文 恋爱 ----
  { lang: 'zh', keys: ['爱你', '愛你', '我爱你', '我愛你'], kind: 'drop', name: n('三千回愛してる', '爱你三千遍', 'Love You 3000'), opts: { sfx: 'move_heart_pop', prop: '💗', count: 3, arc: true }, normal: ['charm'] },
  { lang: 'zh', keys: ['想你'], kind: 'drop', name: n('想いの速達便', '想念快递', 'Missing-You Express'), opts: { prop: '✈️', arc: true }, normal: ['charm'] },
  { lang: 'zh', keys: ['单身', '單身'], kind: 'shield', name: n('独身バリア', '单身狗护盾', 'Single Dog Shield'), opts: { prop: '🐶', hold: true }, normal: ['coward'] },
  { lang: 'zh', keys: ['分手'], kind: 'roar', name: n('それぞれの道へ', '分道扬镳', 'Going Separate Ways'), opts: { prop: '💔', propAt: 'opponent', fx: 'wind' } },
  { lang: 'zh', keys: ['结婚', '結婚'], kind: 'drop', name: n('ウェディングマーチ', '婚礼进行曲', 'Wedding March'), opts: { prop: '💐', arc: true }, normal: ['charm'] },
  { lang: 'zh', keys: ['表白'], kind: 'drop', name: n('告白クリティカル', '告白暴击', 'Confession Crit'), opts: { sfx: 'move_heart_pop', prop: '🌹', arc: true, onHit: 'freeze' }, normal: ['charm'] },
  // ---- 中文 钱与工作 ----
  { lang: 'zh', keys: ['红包', '紅包'], kind: 'bribe', name: n('お年玉爆撃', '红包轰炸', 'Red Envelope Bombing'), opts: { prop: '🧧', count: 3, finaleDrop: true } },
  { lang: 'zh', keys: ['发财', '發財'], kind: 'drop', name: n('金運上昇', '财运亨通', 'Fortune Rolls In'), opts: { prop: '🪙', count: 4 }, normal: ['royal'] },
  { lang: 'zh', keys: ['破产', '破產'], kind: 'drop', name: n('やけっぱち', '破罐子破摔', 'Nothing Left to Lose'), opts: { sfx: 'move_payment_fail', prop: '🐷', arc: true, selfStun: true } },
  { lang: 'zh', keys: ['工资', '工資'], kind: 'sweep', name: n('給料振込！', '工资到账！', 'Payday!'), opts: { prop: '🧾', hold: true, noStretch: true } },
  { lang: 'zh', keys: ['奖金', '獎金'], kind: 'drop', name: n('年末ボーナス', '年终大奖', 'Year-End Bonus'), opts: { prop: '🏆', selfStun: true } },
  { lang: 'zh', keys: ['房租'], kind: 'drop', name: n('家賃の督促', '房租催缴', 'Rent Is Due'), opts: { prop: '🧾', onHit: 'freeze', upScale: 0.5 }, normal: ['heavy'] },
  { lang: 'zh', keys: ['老板', '老闆'], kind: 'drop', name: n('会議を始めます', '现在开会', 'URGENT MEETING'), opts: { prop: '┳━┳', arc: true, onHit: 'freeze' }, normal: ['royal', 'heavy'] },
  { lang: 'zh', keys: ['同事'], kind: 'drop', name: n('その責任よろしく', '这锅你来背', 'You Take the Blame'), opts: { prop: '🍳', onHit: 'confuse' } },
  { lang: 'zh', keys: ['请假', '請假'], kind: 'vanish', name: n('今日は休みます', '今天不来了', 'Not Coming In Today'), normal: ['sleepy'] },
  // ---- 中文 学校 ----
  { lang: 'zh', keys: ['考试', '考試'], kind: 'drop', name: n('抜き打ちテスト', '突击小测', 'POP QUIZ'), opts: { sfx: 'move_paper_flurry', props: ['A', 'B', 'C', 'D'], count: 4 } },
  { lang: 'zh', keys: ['满分', '滿分'], kind: 'drop', name: n('満点答案', '满分答卷', 'Perfect Score'), opts: { prop: '💯', arc: true }, normal: ['royal'] },
  { lang: 'zh', keys: ['零分'], kind: 'charge', name: n('零点からの逆転', '零分逆袭', 'Zero to Hero'), opts: { prop: '0', propAt: 'self' } },
  { lang: 'zh', keys: ['作业', '作業'], kind: 'drop', name: n('宿題の山', '作业山崩', 'Homework Avalanche'), opts: { sfx: 'move_paper_flurry', prop: '📚', count: 3 }, normal: ['heavy'] },
  { lang: 'zh', keys: ['老师', '老師'], kind: 'roar', name: n('はい、静かに！', '全体起立！', 'Everybody Stand Up!'), opts: { sfx: 'move_microphone', prop: '📢', hold: true } },
  { lang: 'zh', keys: ['学生', '學生'], kind: 'charge', name: n('チャイムが鳴った！', '下课铃响！', 'LAST BELL'), opts: { sfx: 'move_school_bell', prop: '🔔', propAt: 'self' }, normal: ['hasty'] },
  { lang: 'zh', keys: ['校长', '校長'], kind: 'lecture', name: n('校長先生のお話', '校长讲话', 'The Principal’s Speech'), opts: { sfx: 'move_microphone', prop: '🎤', hold: true }, normal: ['heavy'] },
  { lang: 'zh', keys: ['毕业', '畢業'], kind: 'drop', name: n('卒業帽投げ', '毕业抛帽', 'Cap Toss'), opts: { prop: '🎓', count: 3 } },
  { lang: 'zh', keys: ['数学', '數學'], kind: 'drop', name: n('計算どおり', '算你厉害', 'You Do the Math'), opts: { props: ['+', '−', '='], count: 3 } },
  // ---- 中文 网络与手机 ----
  { lang: 'zh', keys: ['断网', '斷網'], kind: 'feint', name: n('ネットワーク接続エラー', '网络连接失败', 'NO CONNECTION'), opts: { sfx: 'move_error_beep', prop: '❌', propAt: 'self' } },
  { lang: 'zh', keys: ['密码', '密碼'], kind: 'drop', name: n('パスワード3回ミス', '密码错误三次', 'ACCESS DENIED'), opts: { sfx: 'move_error_beep', props: ['❌', '❌', '🔒'], count: 3, onHit: 'freeze' } },
  { lang: 'zh', keys: ['验证码', '驗證碼'], kind: 'confuse', name: n('信号機をすべて選択', '选出所有红绿灯', 'Select All Traffic Lights'), opts: { prop: '🚦', propAt: 'opponent' } },
  { lang: 'zh', keys: ['加载中', '載入中', '加載中'], kind: 'quake', name: n('99%で止まる', '99% 卡住', 'STUCK AT 99%'), opts: { sfx: 'move_loading_spin', prop: '⏳', hold: true }, normal: ['sleepy'] },
  { lang: 'zh', keys: ['已读不回', '已讀不回'], kind: 'drop', name: n('既読なのに！', '消息撤回失败', 'Left on Read'), opts: { prop: '💬', arc: true, onHit: 'confuse' }, normal: ['coward'] },
  { lang: 'zh', keys: ['评论', '評論'], kind: 'drop', name: n('コメント欄大戦争', '评论区大战', 'Comment Section War'), opts: { prop: '💬', count: 3, kbScale: 1.4 }, normal: ['chaos'] },
  { lang: 'zh', keys: ['关注', '關注'], kind: 'drop', name: n('いいね・投げ銭・お気に入り', '一键三连', 'Like, Coin, Favorite'), opts: { sfx: 'move_like_pop', props: ['👍', '🪙', '⭐'], count: 3, upScale: 1.6 } },
  { lang: 'zh', keys: ['删除', '刪除'], kind: 'swallow', name: n('ゴミ箱へ移動', '移到回收站', 'MOVE TO TRASH'), opts: { prop: '🗑️', hold: true } },
  { lang: 'zh', keys: ['截图', '截圖'], kind: 'freeze', name: n('カシャッと静止', '咔嚓定格', 'Snap, Frozen'), opts: { sfx: 'ui_camera_shutter', prop: '📸', propAt: 'opponent' } },
  { lang: 'zh', keys: ['复制', '複製'], kind: 'clones', name: n('コピペ', '复制粘贴', 'Copy-Paste') },
  { lang: 'zh', keys: ['粘贴', '粘貼'], kind: 'drop', name: n('貼り付け成功', '粘贴成功', 'Pasted!'), opts: { prop: '📝', arc: true, onHit: 'freeze' } },
  { lang: 'zh', keys: ['重启', '重啟'], kind: 'heal', name: n('再起動', '重新启动', 'Reboot'), opts: { prop: '🔄', propAt: 'self' } },
  { lang: 'zh', keys: ['蓝屏', '藍屏'], kind: 'drop', name: n('システムクラッシュ', '系统崩溃', 'System Crash'), opts: { sfx: 'move_error_beep', prop: '🟦', kbScale: 1.3 } },
  // ---- 中文 食物 ----
  { lang: 'zh', keys: ['汉堡', '漢堡'], kind: 'drop', name: n('超トッピング', '超级加料', 'Extra Toppings'), opts: { prop: '🍔', onHit: 'freeze' }, normal: ['heavy'] },
  { lang: 'zh', keys: ['薯条', '薯條'], kind: 'drop', name: n('ポテトの雨', '薯条暴雨', 'French Fry Storm'), opts: { prop: '🍟', count: 4, dmgScale: 0.7 } },
  { lang: 'zh', keys: ['可乐', '可樂'], kind: 'uppercut', name: n('振ったコーラ', '摇过的可乐', 'Shaken Cola'), opts: { sfx: 'move_cola_fizz', prop: '🥤', propAt: 'self' }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['冰淇淋', '冰激凌'], kind: 'drop', name: n('コーン崩落', '甜筒塌方', 'Cone Collapse'), opts: { prop: '🍦', onHit: 'freeze' }, normal: ['slippery'] },
  { lang: 'zh', keys: ['蛋糕'], kind: 'drop', name: n('バースデーケーキ顔面', '生日蛋糕糊脸', 'Birthday Cake to the Face'), opts: { sfx: 'move_cream_splat', prop: '🎂', arc: true, onHit: 'confuse' } },
  { lang: 'zh', keys: ['巧克力'], kind: 'drop', name: n('チョコとろけ', '巧克力融化', 'Chocolate Meltdown'), opts: { prop: '🍫', onHit: 'freeze' }, normal: ['slippery'] },
  { lang: 'zh', keys: ['西瓜'], kind: 'drop', name: n('スイカ割り', '西瓜开花', 'Watermelon Splash'), opts: { sfx: 'move_cream_splat', prop: '🍉', upScale: 1.6, kbScale: 1.3 }, normal: ['heavy'] },
  { lang: 'zh', keys: ['苹果', '蘋果'], kind: 'drop', name: n('ニュートン来たる', '牛顿来啦', 'Newton’s Here'), opts: { prop: '🍎', count: 3 } },
  { lang: 'zh', keys: ['草莓'], kind: 'drop', name: n('イチゴ果汁爆発', '草莓爆浆', 'Strawberry Burst'), opts: { sfx: 'move_cream_splat', prop: '🍓', onHit: 'freeze' } },
  // ---- 日本語 ----
  { lang: 'ja', keys: ['好き'], kind: 'magnet', name: n('好きすぎアタック', '太喜欢了攻击', 'Too-Much-Love Attack'), opts: { sfx: 'move_heart_pop', prop: '💕', hold: true }, normal: ['charm'] },
  { lang: 'ja', keys: ['大好き'], kind: 'whirlwind', name: n('大好き大爆発', '超喜欢大爆发', 'Love Explosion'), opts: { sfx: 'move_heart_pop', prop: '💖', hold: true }, normal: ['charm'] },
  { lang: 'ja', keys: ['嫌い', 'きらい'], kind: 'roar', name: n('近づかないで！', '别靠近我！', 'Stay Away!'), opts: { prop: '🙅', hold: true, fx: 'wind' }, normal: ['coward'] },
  { lang: 'ja', keys: ['お金'], kind: 'drop', name: n('お金の雨', '金钱雨', 'Money Rain'), opts: { prop: '🪙', count: 4 } },
  { lang: 'ja', keys: ['給料'], kind: 'drop', name: n('給料日だ！', '发工资啦！', 'Payday!'), opts: { prop: '💴', count: 3, onHit: 'confuse' } },
  { lang: 'ja', keys: ['社長'], kind: 'drop', name: n('会議を始めます', '现在开会', 'URGENT MEETING'), opts: { prop: '┳━┳', arc: true, onHit: 'freeze' }, normal: ['royal', 'heavy'] },
  { lang: 'ja', keys: ['休み'], kind: 'lazy', name: n('今日は休み！', '今天休息！', 'Day Off!'), opts: { prop: '🧺', propAt: 'self' }, normal: ['sleepy'] },
  { lang: 'ja', keys: ['遅刻'], kind: 'charge', name: n('もう間に合わない！', '来不及了！', 'Too Late Now!'), opts: { prop: '⏰', hold: true, selfStun: true }, normal: ['hasty'] },
  { lang: 'ja', keys: ['試験'], kind: 'drop', name: n('抜き打ちテスト', '突击小测', 'POP QUIZ'), opts: { sfx: 'move_paper_flurry', props: ['ア', 'イ', 'ウ', 'エ'], count: 4 } },
  { lang: 'ja', keys: ['先生'], kind: 'roar', name: n('はい、静かに！', '安静！', 'Quiet, Everyone!'), opts: { sfx: 'move_microphone', prop: '📢', hold: true } },
  { lang: 'ja', keys: ['宿題'], kind: 'drop', name: n('宿題の山', '作业山崩', 'Homework Avalanche'), opts: { sfx: 'move_paper_flurry', prop: '📚', count: 3 }, normal: ['heavy'] },
  { lang: 'ja', keys: ['合格'], kind: 'drop', name: n('合格発表！', '放榜啦！', 'Results Are In!'), opts: { prop: '💮', upScale: 0.6, kbScale: 1.4 } },
  { lang: 'ja', keys: ['うそ', '嘘'], kind: 'feint', name: n('うそでしょ！？', '不会吧！？', 'No Way!?'), opts: { prop: '👈', propAt: 'self' } },
  { lang: 'ja', keys: ['了解', 'りょうかい'], kind: 'charge', name: n('ラジャー！', '收到！', 'Roger!'), opts: { prop: '✅', propAt: 'self' } },
  { lang: 'ja', keys: ['最高'], kind: 'drop', name: n('最高すぎる！', '太棒了！', 'The Absolute Best!'), opts: { prop: '🎉', count: 3, kbScale: 1.3 }, normal: ['bouncy'] },
  { lang: 'ja', keys: ['最悪'], kind: 'drop', name: n('今日は最悪', '今天糟透了', 'Worst Day Ever'), opts: { props: ['🍌', '🪣', '🧱'], count: 3, chaos: true, dmgScale: 0.8 }, normal: ['slip'] },
  { lang: 'ja', keys: ['天才'], kind: 'quake', name: n('ひらめいた！', '灵光一闪！', 'Eureka!'), opts: { prop: '💡', propAt: 'self' } },
  { lang: 'ja', keys: ['ぼっち'], kind: 'shield', name: n('ひとりが一番', '一个人最好', 'Better Alone'), opts: { prop: '🫥', hold: true }, normal: ['coward'] },
  { lang: 'ja', keys: ['彼女'], kind: 'freeze', name: n('写真撮って！', '帮我拍照！', 'Take My Picture!'), opts: { sfx: 'ui_camera_shutter', prop: '📸', propAt: 'opponent' }, normal: ['charm'] },
  { lang: 'ja', keys: ['めんどくさい', 'めんどい'], kind: 'lazy', name: n('めんどくさーい', '好麻烦——', 'Ugh, Too Much Work'), opts: { counter: true }, normal: ['sleepy'] },
  { lang: 'ja', keys: ['ガチャ'], kind: 'random', name: n('何が出るかな', '会抽到什么呢', 'What Will I Get?'), opts: { sfx: 'move_gacha', prop: '🎰', propAt: 'self' }, normal: ['chaos'] },
  { lang: 'ja', keys: ['既読スルー', '既読無視'], kind: 'drop', name: n('既読なのに！', '已读不回！', 'Left on Read!'), opts: { prop: '💬', arc: true, onHit: 'confuse' }, normal: ['coward'] },
  { lang: 'ja', keys: ['プリン'], kind: 'quake', name: n('ぷるぷる地震', '布丁地震', 'Pudding Quake'), opts: { prop: '🍮', hold: true }, normal: ['bouncy'] },
  { lang: 'ja', keys: ['ラーメン'], kind: 'whirlwind', name: n('麺リボン旋風', '面条丝带旋风', 'Noodle Ribbon Twister'), opts: { prop: '🍜', hold: true }, normal: ['spinner'] },
  { lang: 'ja', keys: ['満員電車'], kind: 'charge', name: n('押さないで！', '别挤了！', 'Stop Pushing!'), opts: { prop: '🚃', propAt: 'self', grow: 1.3 }, normal: ['heavy'] },
  // ---- English ----
  { lang: 'en', keys: ['hate'], kind: 'rage', name: n('恨みモード', '记仇模式', 'GRUDGE MODE'), opts: { prop: '📒', hold: true }, normal: ['angry'] },
  { lang: 'en', keys: ['broke'], kind: 'drop', name: n('残高不足', '余额不足', 'INSUFFICIENT FUNDS'), opts: { sfx: 'move_payment_fail', prop: '🧾', upScale: 2.2 }, normal: ['coward'] },
  { lang: 'en', keys: ['boss'], kind: 'drop', name: n('会議を始めます', '现在开会', 'URGENT MEETING'), opts: { prop: '┳━┳', arc: true, onHit: 'freeze' }, normal: ['royal', 'heavy'] },
  { lang: 'en', keys: ['salary', 'payday'], kind: 'drop', name: n('給料日！', '发工资啦！', 'PAYDAY!'), opts: { prop: '💵', count: 3, onHit: 'confuse' } },
  { lang: 'en', keys: ['rent'], kind: 'drop', name: n('家賃の期限', '房租到期', 'RENT IS DUE'), opts: { prop: '🧾', onHit: 'freeze', upScale: 0.5 }, normal: ['heavy'] },
  { lang: 'en', keys: ['exam', 'test', 'quiz'], kind: 'drop', name: n('抜き打ちテスト', '突击小测', 'POP QUIZ'), opts: { sfx: 'move_paper_flurry', props: ['A', 'B', 'C', 'D'], count: 4 } },
  { lang: 'en', keys: ['teacher'], kind: 'roar', name: n('授業終わり！', '下课！', 'CLASS DISMISSED!'), opts: { sfx: 'move_school_bell', prop: '🔔', hold: true } },
  { lang: 'en', keys: ['student'], kind: 'charge', name: n('チャイムが鳴った！', '下课铃响！', 'LAST BELL'), opts: { sfx: 'move_school_bell', prop: '🎒', propAt: 'self' }, normal: ['hasty'] },
  { lang: 'en', keys: ['wifi', 'wi-fi'], kind: 'roar', name: n('電波バリ3', '信号满格', 'FULL BARS'), opts: { prop: '📶', hold: true }, normal: ['electric'] },
  { lang: 'en', keys: ['password'], kind: 'drop', name: n('アクセス拒否', '拒绝访问', 'ACCESS DENIED'), opts: { sfx: 'move_error_beep', props: ['❌', '❌', '🔒'], count: 3, onHit: 'freeze' } },
  { lang: 'en', keys: ['offline'], kind: 'feint', name: n('接続なし', '无网络连接', 'NO CONNECTION'), opts: { sfx: 'move_error_beep', prop: '❌', propAt: 'self' } },
  { lang: 'en', keys: ['loading'], kind: 'quake', name: n('99%で止まる', '卡在 99%', 'STUCK AT 99%'), opts: { sfx: 'move_loading_spin', prop: '⏳', hold: true }, normal: ['sleepy'] },
  { lang: 'en', keys: ['delete'], kind: 'swallow', name: n('ゴミ箱へ移動', '移到回收站', 'MOVE TO TRASH'), opts: { prop: '🗑️', hold: true } },
  { lang: 'en', keys: ['brb'], kind: 'vanish', name: n('すぐ戻る', '马上回来', 'BE RIGHT BACK') },
  { lang: 'en', keys: ['idk'], kind: 'drop', name: n('わかんない', '我不知道', "I DON'T KNOW"), opts: { prop: '❓', count: 3, dmgScale: 0.7 } },
  { lang: 'en', keys: ['npc'], kind: 'shield', name: n('いつものセリフ', '默认台词', 'DEFAULT DIALOGUE'), opts: { prop: '💬', hold: true } },
  { lang: 'en', keys: ['skill issue'], kind: 'drop', name: n('練習してこい', '菜就多练', 'GIT GUD'), opts: { prop: '⬇️', chaos: true, count: 2 } },
  { lang: 'en', keys: ['touch grass'], kind: 'uppercut', name: n('草のお届け', '草坪快递', 'GRASS DELIVERY'), opts: { prop: '🌱', propAt: 'self' } },
  { lang: 'en', keys: ['cookie'], kind: 'drop', name: n('クッキー崩し', '曲奇碎碎', 'COOKIE CRUMBLE'), opts: { prop: '🍪', count: 3 } },
  { lang: 'en', keys: ['burger'], kind: 'drop', name: n('ダブルスタック', '双层叠叠', 'DOUBLE STACK'), opts: { prop: '🍔', count: 2, onHit: 'freeze' }, normal: ['heavy'] },
  { lang: 'en', keys: ['ice cream'], kind: 'drop', name: n('頭キーン', '冻脑壳', 'BRAIN FREEZE'), opts: { prop: '🍦', onHit: 'freeze' }, normal: ['slippery'] },
  { lang: 'en', keys: ['cake'], kind: 'drop', name: n('パイ投げ', '蛋糕糊脸', 'PIE IN THE FACE'), opts: { sfx: 'move_cream_splat', prop: '🥧', arc: true, onHit: 'confuse' } },
  // ---- 其他: emoji, kaomoji, numbers ----
  { keys: ['🫡'], kind: 'charge', name: n('敬礼ストライク', '敬礼冲锋', 'SALUTE STRIKE'), opts: { prop: '🚩', hold: true }, normal: ['loyal'] },
  { keys: ['🥲'], kind: 'roar', name: n('笑顔で耐える', '含泪微笑', 'SMILE THROUGH PAIN'), opts: { fx: 'water' } },
  { keys: ['🙃'], kind: 'topple', name: n('さかさま', '颠倒世界', 'UPSIDE DOWN') },
  { keys: ['🥶'], kind: 'freeze', name: n('ブルブル！', '冻僵了！', 'BRRR!'), opts: { prop: '🧊', propAt: 'opponent' } },
  { keys: ['🥵'], kind: 'roar', name: n('オーバーヒート', '过热', 'OVERHEAT'), opts: { prop: '💦', hold: true, fx: 'wind' }, normal: ['fire'] },
  { keys: ['🧠'], kind: 'topple', name: n('ビッグブレイン', '大聪明', 'BIG BRAIN MOVE'), opts: { prop: '💡', propAt: 'self' } },
  { keys: ['💸'], kind: 'kick', name: n('さよならお金', '钱飞走了', 'BYE BYE MONEY'), opts: { prop: '💵', propAt: 'opponent' } },
  { keys: ['📉'], kind: 'quake', name: n('株価暴落', '股市崩盘', 'MARKET CRASH'), opts: { prop: '📉', propAt: 'self' } },
  { keys: ['📈'], kind: 'uppercut', name: n('月まで行け', '冲上月球', 'TO THE MOON'), opts: { sfx: 'move_rocket', prop: '📈', propAt: 'self' } },
  { keys: ['🍔'], kind: 'drop', name: n('スーパースタック', '超级叠叠', 'SUPER STACK'), opts: { prop: '🍔', count: 2, onHit: 'freeze' }, normal: ['heavy'] },
  { keys: ['🍟'], kind: 'drop', name: n('ポテト噴水', '薯条喷泉', 'FRIES FOUNTAIN'), opts: { prop: '🍟', count: 4, dmgScale: 0.7 } },
  { keys: ['🦆'], kind: 'clones', name: n('ガーガーパレード', '鸭鸭游行', 'QUACK PARADE'), opts: { sfx: 'move_quack' }, normal: ['bouncy'] },
  { keys: ['🐸'], kind: 'magnet', name: n('カエルの舌', '青蛙舌头', 'FROG TONGUE'), normal: ['bouncy'] },
  { keys: ['🦀'], kind: 'barrage', name: n('カニ歩きハサミ', '螃蟹横行', 'CRAB SIDE STEP'), normal: ['pounce'] },
  { keys: ['🚀'], kind: 'giantFall', name: n('ロケット発射', '火箭发射', 'ROCKET LAUNCH'), opts: { sfx: 'move_rocket' }, normal: ['flyer'] },
  { keys: ['🔒'], kind: 'freeze', name: n('ロックダウン', '锁死', 'LOCKDOWN'), opts: { sfx: 'move_lock_click', prop: '🔒', propAt: 'opponent' } },
  { keys: ['🔋'], kind: 'roar', name: n('バッテリー残りわずか', '电量不足', 'LOW BATTERY'), opts: { pulses: 3, selfStun: true }, normal: ['electric'] },
  { keys: ['🧻'], kind: 'whirlwind', name: n('エンドレスロール', '无尽卷纸', 'ENDLESS ROLL'), opts: { prop: '🧻', count: 2, finaleDrop: true }, normal: ['spinner'] },
  { lang: 'other', keys: ['(¬_¬)'], kind: 'glare', name: n('ジト目', '斜眼看你', 'SIDE EYE') },
  { lang: 'other', keys: ['(⊙_⊙)'], kind: 'roar', name: n('目が点', '瞪大眼睛', 'WIDE EYED'), opts: { prop: '👀', propAt: 'opponent' } },
  { lang: 'other', keys: ['(づ｡◕‿‿◕｡)づ'], kind: 'throw', name: n('ハグアタック', '熊抱攻击', 'HUG ATTACK'), normal: ['charm'] },
  { lang: 'other', keys: ['(☞ﾟヮﾟ)☞'], kind: 'feint', name: n('あっち見て', '看那边', 'LOOK OVER THERE'), opts: { prop: '👉', propAt: 'self' } },
  { lang: 'other', keys: ['┬─┬ノ( º _ ºノ)', '┬─┬ノ(º_ºノ)', '┬─┬'], kind: 'shield', name: n('元に戻して', '把桌子放回去', 'PUT IT BACK'), opts: { prop: '┬─┬', hold: true }, normal: ['loyal'] },
  { lang: 'other', keys: ['520'], kind: 'drop', name: n('愛してる！', '我爱你！', 'I LOVE YOU!'), opts: { sfx: 'move_heart_pop', prop: '💗', count: 5, arc: true, dmgScale: 0.6 }, normal: ['charm'] },
  { lang: 'other', keys: ['886'], kind: 'vanish', name: n('バイバイ', '溜了溜了', 'GOTTA GO'), normal: ['coward'] },
  { lang: 'other', keys: ['2333'], kind: 'laughQuake', name: n('笑い転げる', '笑到转圈', 'LAUGHING IN CIRCLES'), normal: ['laugh'] },

  // ---- V2: the rest of the design rows that map onto existing actions ----
  { lang: 'zh', keys: ['破'], kind: 'drop', name: n('やけくそ', '破罐破摔', 'Break It All'), opts: { props: ['🧩', '🧩', '🧩'], count: 3, chaos: true }, normal: ['chaos'] },
  { lang: 'zh', keys: ['怕'], kind: 'kick', name: n('びっくりジャンプ', '吓到弹射', 'Scared Into Orbit'), opts: { prop: '😱', propAt: 'self' }, normal: ['coward'] },
  { lang: 'zh', keys: ['旧', '舊'], kind: 'quake', name: n('骨董品の覚醒', '老古董觉醒', 'Antique Awakens'), opts: { prop: '⚙️', propAt: 'self' }, normal: ['heavy'] },
  { lang: 'zh', keys: ['耳'], kind: 'roar', name: n('地獄耳', '顺风耳', 'Super Hearing'), opts: { prop: '👂', hold: true } },
  { lang: 'zh', keys: ['脸', '臉'], kind: 'confuse', name: n('百面相', '变脸大师', 'Face-Changing Master'), opts: { prop: '🎭', propAt: 'opponent' } },
  { lang: 'zh', keys: ['怪'], kind: 'random', name: n('なんか変！', '怪怪的！', 'Something’s Off!'), normal: ['chaos'] },
  { lang: 'zh', keys: ['前任'], kind: 'clones', name: n('元恋人フラッシュバック', '前任闪回', 'Ex Flashback') },
  { lang: 'zh', keys: ['暗恋', '暗戀'], kind: 'vanish', name: n('こっそり好き', '偷偷喜欢你', 'Secret Crush'), normal: ['charm'] },
  { lang: 'zh', keys: ['客户', '客戶'], kind: 'drop', name: n('もう一回修正で', '再来一版', 'One More Revision'), opts: { prop: '📋', count: 3 } },
  { lang: 'zh', keys: ['辞职', '辭職'], kind: 'sweep', name: n('もう辞めてやる', '老子不干了', 'I Quit!'), opts: { prop: '🪪', hold: true, noStretch: true } },
  { lang: 'zh', keys: ['撤回'], kind: 'feint', name: n('送信取り消し', '撤回上一句', 'Unsend That'), opts: { prop: '↩️', propAt: 'self' } },
  { lang: 'ja', keys: ['失敗'], kind: 'lazy', name: n('失敗は成功のもと', '失败是成功之母', 'Failure Breeds Success'), opts: { counter: true, duration: 1.2 }, normal: ['slip'] },
  { lang: 'ja', keys: ['彼氏'], kind: 'kick', name: n('カッコつけすぎ', '太爱耍帅', 'Trying Too Hard'), opts: { prop: '💐', hold: true, selfFall: true }, normal: ['charm'] },
  { lang: 'ja', keys: ['仕事'], kind: 'drop', name: n('仕事モード', '工作模式', 'Work Mode'), opts: { sfx: 'move_paper_flurry', prop: '📄', count: 3, arc: true } },
  { lang: 'ja', keys: ['無課金'], kind: 'charge', name: n('無料の底力', '零氪的底气', 'Free-to-Play Grit'), opts: { prop: '📦', propAt: 'self', grow: 1.3 } },
  { lang: 'en', keys: ['retry'], kind: 'drop', name: n('もう一回！', '再试一次！', 'TRY AGAIN!'), opts: { prop: '🔁', count: 2 } },
  { lang: 'en', keys: ['W'], kind: 'drop', name: n('早すぎる勝利宣言', '提前庆祝', 'VICTORY EARLY'), opts: { sfx: 'move_champagne_pop', prop: '🏆', selfFall: true } },
  { lang: 'en', keys: ['L'], kind: 'drop', name: n('このLを持ってて', '这个L给你', 'HOLD THIS L'), opts: { prop: 'L', arc: true, onHit: 'confuse' } },

  // ======== Batch 3: daily vocabulary pack, priority S (docs/design/daily-vocab) ========
  // ---- 中文 家庭 ----
  { lang: 'zh', keys: ['妈', '媽'], kind: 'drop', name: n('上着を着なさい！', '快把外套穿上！', 'Put Your Coat On!'), opts: { prop: '🧥', arc: true, onHit: 'freeze', selfFall: true }, normal: ['loyal'] },
  { lang: 'zh', keys: ['妈妈', '媽媽'], kind: 'magnet', name: n('ごはんだよ！', '吃饭啦！', 'Dinner Time!'), opts: { prop: '🍚', hold: true }, normal: ['hasty'] },
  { lang: 'zh', keys: ['爸'], kind: 'roar', name: n('3つ数えるぞ！', '我数到三！', 'I’m Counting to Three!'), opts: { countdown: true }, normal: ['heavy'] },
  { lang: 'zh', keys: ['爸爸'], kind: 'drop', name: n('リモコンどこ？', '遥控器在哪？', 'Where’s the Remote?'), opts: { prop: '📺', onHit: 'freeze' } },
  { lang: 'zh', keys: ['奶奶'], kind: 'drop', name: n('もう一口！', '再吃一口！', 'One More Bite!'), opts: { prop: '🥟', count: 3, onHit: 'freeze' }, normal: ['heavy'] },
  { lang: 'zh', keys: ['孩子', '熊孩子'], kind: 'drop', name: n('やんちゃ大暴れ', '熊孩子拆家', 'Little Wrecking Crew'), opts: { props: ['🧸', '📚', '🪴'], count: 3, chaos: true }, normal: ['chaos', 'bouncy'] },
  { lang: 'zh', keys: ['宝宝', '寶寶'], kind: 'roar', name: n('オギャーッ！', '哇——！', 'WAAAH!'), opts: { pulses: 3, selfSleep: true, prop: '🍼', hold: true }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['一家人'], kind: 'clones', name: n('家族総出！', '全家出动！', 'The Whole Family!') },
  // ---- 中文 寒暄 ----
  { lang: 'zh', keys: ['你好'], kind: 'throw', name: n('熱烈すぎる握手', '热情过头', 'Over-Friendly Handshake'), opts: { prop: '🤝', hold: true } },
  { lang: 'zh', keys: ['早安', '早上好'], kind: 'laughQuake', name: n('起きろーっ！', '起床啦！', 'Wakey Wakey!'), opts: { prop: '⏰', hold: true }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['晚安'], kind: 'lazy', name: n('ワンタッチ消灯', '一键关灯', 'Lights Out'), opts: { darkness: true }, normal: ['sleepy'] },
  { lang: 'zh', keys: ['谢谢', '謝謝'], kind: 'topple', name: n('感謝のお辞儀しすぎ', '感谢到鞠躬过猛', 'Over-Grateful Bow') },
  { lang: 'zh', keys: ['对不起', '對不起'], kind: 'lazy', name: n('90度の謝罪', '九十度道歉', '90° Apology'), opts: { counter: true, duration: 1.0 }, normal: ['coward'] },
  { lang: 'zh', keys: ['不要'], kind: 'roar', name: n('断固拒否！', '坚决拒绝！', 'Firmly Refused!'), opts: { prop: '❌', propAt: 'opponent' }, normal: ['chaos'] },
  { lang: 'zh', keys: ['等一下', '等一等'], kind: 'freeze', name: n('ちょ——っと待った！', '等——一下！', 'Wait——a Second!'), opts: { prop: '✋', propAt: 'opponent' } },
  { lang: 'zh', keys: ['拜拜', '再见', '再見'], kind: 'roar', name: n('お見送り！', '送客！', 'Show You Out!'), opts: { prop: '🚪', propAt: 'self', fx: 'wind' }, normal: ['coward'] },
  { lang: 'zh', keys: ['救命'], kind: 'shield', name: n('誰か助けて！', '谁来救救我！', 'Somebody Help Me!'), opts: { prop: '🛟', hold: true }, normal: ['coward'] },
  { lang: 'zh', keys: ['哎呀', '哎哟'], kind: 'kick', name: n('あっ、転んだ', '哎呀摔倒了', 'Whoops, I Fell'), opts: { selfFall: true }, normal: ['slip'] },
  // ---- 中文 动作与状态 ----
  { lang: 'zh', keys: ['坐'], kind: 'quake', name: n('座れ！', '坐下！', 'Sit Down!'), opts: { prop: '🪑', propAt: 'self' }, normal: ['heavy'] },
  { lang: 'zh', keys: ['洗'], kind: 'whirlwind', name: n('ゴシゴシ洗い！', '洗刷刷！', 'Scrub-a-Dub!'), opts: { prop: '🫧', hold: true }, normal: ['spinner'] },
  { lang: 'zh', keys: ['饿', '餓'], kind: 'kick', name: n('飢えた狼の突撃', '饿狼扑食', 'Hungry Wolf Pounce'), opts: { prop: '🥪', propAt: 'opponent' }, normal: ['loyal'] },
  { lang: 'zh', keys: ['胖', '肥'], kind: 'charge', name: n('肉弾戦車', '肉弹战车', 'Meatball Tank'), opts: { grow: 1.35 }, normal: ['heavy'] },
  // ---- 中文 日常物品 ----
  { lang: 'zh', keys: ['手机', '手機'], kind: 'roar', name: n('バッテリー残量わずか', '低电量警告', 'Low Battery Warning'), opts: { prop: '🔋', hold: true, selfStun: true }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['电脑', '電腦'], kind: 'confuse', name: n('ブルースクリーン！', '蓝屏了！', 'Blue Screen!'), opts: { prop: '💻', propAt: 'opponent' } },
  { lang: 'zh', keys: ['冰箱'], kind: 'roar', name: n('冷蔵庫が開いた', '冰箱门开了', 'Fridge Door Open'), opts: { fx: 'ice', prop: '🧊', propAt: 'opponent' }, normal: ['heavy', 'slippery'] },
  { lang: 'zh', keys: ['洗衣机', '洗衣機'], kind: 'whirlwind', name: n('脱水モード', '脱水模式', 'Spin Cycle'), opts: { prop: '🧦', count: 3, finaleDrop: true }, normal: ['spinner'] },
  { lang: 'zh', keys: ['拖鞋'], kind: 'drop', name: n('スリッパ・ミサイル', '拖鞋飞弹', 'Slipper Missile'), opts: { prop: '🩴', arc: true }, normal: ['slippery'] },
  { lang: 'zh', keys: ['枕头', '枕頭'], kind: 'drop', name: n('まくら投げ', '枕头大战', 'Pillow Fight'), opts: { prop: '☁️', count: 3, dmgScale: 0.5, kbScale: 1.8 }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['钱包', '錢包'], kind: 'drop', name: n('財布が空っぽ！', '钱包空了！', 'Wallet’s Empty!'), opts: { prop: '🪙' } },
  { lang: 'zh', keys: ['雨伞', '雨傘'], kind: 'shield', name: n('傘バリア反射', '伞面弹射', 'Umbrella Bounce'), opts: { prop: '☂️', hold: true } },
  { lang: 'zh', keys: ['扫把', '掃把', '扫帚'], kind: 'sweep', name: n('一掃千軍', '横扫千军', 'Sweep Them All'), opts: { prop: '🧹', hold: true, noStretch: true }, normal: ['spinner'] },
  // ---- 中文 食物与生活 ----
  { lang: 'zh', keys: ['饭', '飯'], kind: 'drop', name: n('ごはんですよ！', '开饭！', 'Food’s Up!'), opts: { prop: '🍚', kbScale: 1.6 } },
  { lang: 'zh', keys: ['面', '麵'], kind: 'magnet', name: n('無限に伸びる麺', '面条无限长', 'Infinite Noodle'), opts: { prop: '🍜', hold: true } },
  { lang: 'zh', keys: ['咖啡'], kind: 'rage', name: n('カフェイン過剰', '咖啡因过量', 'Caffeine Overdose'), opts: { selfStun: true, prop: '☕', hold: true }, normal: ['hasty', 'angry'] },
  { lang: 'zh', keys: ['披萨', '披薩', '比萨'], kind: 'drop', name: n('ピザ・フリスビー', '披萨飞盘', 'Pizza Frisbee'), opts: { prop: '🍕', arc: true }, normal: ['spinner'] },
  { lang: 'zh', keys: ['外卖', '外賣'], kind: 'charge', name: n('出前お待たせしました！', '您的外卖到了！', 'Your Delivery’s Here!'), opts: { prop: '🥡', finaleDrop: true }, normal: ['hasty'] },
  { lang: 'zh', keys: ['快递', '快遞'], kind: 'drop', name: n('びっくり開封', '惊喜开箱', 'Surprise Unboxing'), opts: { prop: '📦', upScale: 2 } },
  { lang: 'zh', keys: ['放假'], kind: 'kick', name: n('はっちゃけ休暇', '放飞自我', 'Vacation Mode'), opts: { prop: '🧳', hold: true }, normal: ['bouncy'] },
  { lang: 'zh', keys: ['周一', '星期一', '週一'], kind: 'drop', name: n('月曜日の絶望', '星期一的绝望', 'Monday Despair'), opts: { prop: '⏰', count: 3, onHit: 'freeze' }, normal: ['heavy'] },
  { lang: 'zh', keys: ['周末', '週末'], kind: 'lazy', name: n('邪魔しないで！', '不许打扰我！', 'Do Not Disturb!'), opts: { prop: '🛋️', propAt: 'self' }, normal: ['sleepy'] },
  // ---- 日本語 ----
  { lang: 'ja', keys: ['お母さん', 'おかあさん', 'かあさん'], kind: 'swallow', name: n('ごはんできたよ！', '饭做好了！', 'Lunch Is Ready!'), opts: { prop: '🍱', hold: true }, normal: ['loyal'] },
  { lang: 'ja', keys: ['ママ'], kind: 'drop', name: n('早く寝なさい！', '快去睡觉！', 'Go to Bed!'), opts: { prop: '☁️', count: 3, onHit: 'sleep' } },
  { lang: 'ja', keys: ['お父さん', 'おとうさん', 'とうさん'], kind: 'confuse', name: n('リモコンどこ？', '遥控器呢？', 'Remote? Anyone?'), opts: { prop: '📺', propAt: 'opponent' } },
  { lang: 'ja', keys: ['パパ'], kind: 'drop', name: n('任せろ！', '交给我！', 'Leave It to Me!'), opts: { props: ['🔧', '🔨', '🪛'], count: 3 } },
  { lang: 'ja', keys: ['おはよう'], kind: 'roar', name: n('起きて！', '快起来！', 'Wake Up!'), opts: { countdown: true, prop: '⏰', hold: true }, normal: ['bouncy'] },
  { lang: 'ja', keys: ['おやすみ'], kind: 'lazy', name: n('消灯！', '熄灯！', 'Lights Off!'), opts: { darkness: true, prop: '🌙', finaleDrop: true }, normal: ['sleepy'] },
  { lang: 'ja', keys: ['ありがとう'], kind: 'topple', name: n('感謝しすぎ！', '谢太多了！', 'Too Much Gratitude!') },
  { lang: 'ja', keys: ['ごめんなさい', 'ごめん'], kind: 'quake', name: n('土下座クラッシュ', '土下座冲击', 'Groveling Crash'), normal: ['coward'] },
  { lang: 'ja', keys: ['いただきます'], kind: 'throw', name: n('いただきまーす！', '开动啦！', 'Let’s Eat!'), opts: { prop: '🥢', hold: true } },
  { lang: 'ja', keys: ['ちょっと待って', 'ちょっとまって'], kind: 'freeze', name: n('ちょっと待って！', '稍等一下！', 'Hold Up!'), opts: { prop: '✋', propAt: 'opponent' } },
  { lang: 'ja', keys: ['スマホ'], kind: 'roar', name: n('充電1%！', '电量1%！', '1% Charge!'), opts: { prop: '🔋', hold: true, selfStun: true } },
  // ---- English ----
  { lang: 'en', keys: ['mom', 'mum'], kind: 'magnet', name: n('ごはんですよ！', '开饭了！', 'Dinner is Ready!'), opts: { prop: '🍽️', hold: true }, normal: ['loyal'] },
  { lang: 'en', keys: ['dad'], kind: 'confuse', name: n('リモコンどこ？！', '遥控器去哪了？！', "Where's the Remote?!"), opts: { prop: '📺', propAt: 'opponent' } },
  { lang: 'en', keys: ['grandma', 'granny'], kind: 'drop', name: n('もっと食べなさい！', '多吃点！', 'Eat More!'), opts: { prop: '🍪', count: 3 }, normal: ['heavy'] },
  { lang: 'en', keys: ['baby'], kind: 'roar', name: n('ベビー大泣き', '小婴儿大哭', 'WAAAH!'), opts: { pulses: 3, selfSleep: true, prop: '🍼', hold: true }, normal: ['bouncy'] },
  { lang: 'en', keys: ['hello', 'hi', 'hey'], kind: 'throw', name: n('スーパー握手', '超级握手', 'Super Handshake'), opts: { prop: '🤝', hold: true } },
  { lang: 'en', keys: ['bye', 'goodbye'], kind: 'roar', name: n('バイバイ！', '拜拜！', 'Bye-Bye!'), opts: { prop: '👋', propAt: 'opponent', fx: 'wind' }, normal: ['coward'] },
  { lang: 'en', keys: ['sorry'], kind: 'shield', name: n('ごめんなさいシール', '对不起贴纸', 'SORRY!'), opts: { prop: 'SORRY', hold: true }, normal: ['coward'] },
  { lang: 'en', keys: ['ok', 'okay'], kind: 'roar', name: n('オールクリア！', '全部搞定！', 'All Clear!'), opts: { prop: '✅', propAt: 'opponent' } },
  { lang: 'en', keys: ['wait', 'hold on'], kind: 'freeze', name: n('ちょっと待った！', '先等等！', 'HOLD ON!'), opts: { prop: '✋', propAt: 'opponent' } },
  { lang: 'en', keys: ['run'], kind: 'charge', name: n('逃げろーっ！', '快跑啊！', 'RUN FOR IT!'), normal: ['hasty'] },
  { lang: 'en', keys: ['coffee'], kind: 'rage', name: n('カフェイン限界突破', '咖啡因爆表', 'CAFFEINE OVERLOAD'), opts: { selfStun: true, prop: '☕', hold: true }, normal: ['hasty', 'angry'] },
  { lang: 'en', keys: ['pizza'], kind: 'drop', name: n('ピザ配達', '披萨外送', 'PIZZA DELIVERY'), opts: { prop: '🍕', arc: true }, normal: ['spinner'] },
  { lang: 'en', keys: ['oops'], kind: 'kick', name: n('偶然の勝利', '意外的胜利', 'ACCIDENTAL VICTORY'), opts: { selfFall: true }, normal: ['slip'] },
  // ---- 其他: emoji & kaomoji ----
  { keys: ['👩‍👧'], kind: 'drop', name: n('ママが来た！', '妈妈来了！', 'Mom’s Here!'), opts: { prop: '🍱', arc: true }, normal: ['loyal'] },
  { keys: ['👶'], kind: 'roar', name: n('赤ちゃんが泣いた', '宝宝哭了', 'Baby’s Crying'), opts: { pulses: 3, selfSleep: true, prop: '🍼', hold: true }, normal: ['bouncy'] },
  { keys: ['🛏️', '🛏'], kind: 'uppercut', name: n('寝かせて！', '别吵我睡觉', 'Let Me Sleep'), opts: { prop: '🛏️', propAt: 'self' }, normal: ['sleepy'] },
  { keys: ['🍳'], kind: 'throw', name: n('フライパン返し！', '开锅！', 'Pan Flip!'), opts: { prop: '🍳', hold: true } },
  { lang: 'other', keys: ['(^_^)', '(^^)'], kind: 'roar', name: n('スマイル衝撃', '微笑冲击', 'Smile Shock'), opts: { prop: '😊', propAt: 'opponent' }, normal: ['bouncy'] },
  { lang: 'other', keys: ['(T_T)', 'T_T'], kind: 'roar', name: n('涙の大洪水', '眼泪大洪水', 'Flood of Tears'), opts: { fx: 'water', pulses: 3 } },
  { lang: 'other', keys: ['orz', 'OTL'], kind: 'lazy', name: n('土下座重撃', '土下座重击', 'Grovel Smash'), opts: { counter: true, prop: '!', finaleDrop: true } },

  // ======== Batch 2: design list (docs/skills). ★ = first priority ========
  // ---- 中文 单字 ----
  { star: true, keys: ['一'], kind: 'sweep', name: n('一刀両断', '一刀两断', 'One-Stroke Sweep') },
  { keys: ['二'], kind: 'barrage', name: n('二連絶殺', '二连绝杀', 'Double Trouble') },
  { keys: ['人'], kind: 'roar', name: n('人の字開脚', '人字劈叉', 'Human Split') },
  { star: true, keys: ['大'], kind: 'giantFall', name: n('デカすぎ注意', '大到离谱', 'Way Too Big') },
  { keys: ['小'], kind: 'vanish', name: n('こびと奇襲', '小人偷袭', 'Tiny Ambush') },
  { star: true, keys: ['口'], kind: 'swallow', name: n('ひと口でパクッ', '一口吞掉', 'Swallowed Whole') },
  { star: true, keys: ['山', '石', '!', '！', '象', '熊', '🐘', '🐻'], kind: 'mountain', name: n('泰山圧頂', '泰山压顶', 'Mountain Drop') },
  { keys: ['川'], kind: 'charge', name: n('三川奔流', '三川奔流', 'Three Rivers Rush') },
  { keys: ['木'], kind: 'topple', name: n('倒木アタック', '倒树攻击', 'Timber!') },
  { keys: ['林'], kind: 'magnet', name: n('森の挟み撃ち', '森林夹击', 'Forest Pincer') },
  { keys: ['森'], kind: 'whirlwind', name: n('森林暴走', '森林暴走', 'Runaway Forest') },
  { star: true, keys: ['火'], kind: 'fireCharge', name: n('自爆炎上', '引火烧身', 'Set Myself on Fire') },
  { keys: ['刀'], kind: 'kick', name: n('ブーメラン飛刀', '回旋飞刀', 'Boomerang Blade') },
  { keys: ['哭'], kind: 'roar', name: n('涙腺崩壊', '泪崩', 'Tear Flood'), opts: { fx: 'water' } },
  { star: true, keys: ['笑', 'lol'], kind: 'laughQuake', name: n('爆笑地震', '笑到地震', 'Laughing Out Loud'), opts: { selfFall: true } },
  { star: true, keys: ['懒', '懶'], kind: 'lazy', name: n('もうやる気ない', '懒得打了', 'Can’t Be Bothered') },
  { keys: ['急'], kind: 'rage', name: n('急げ急げ！', '急急急！', 'Hurry Hurry Hurry!') },
  { star: true, keys: ['逃'], kind: 'feint', name: n('逃げ足マスター', '逃跑大师', 'Escape Artist') },
  { keys: ['鱼', '魚', '🐟', '🐠'], kind: 'kick', name: n('干物の大逆転', '咸鱼翻身', 'Dead Fish Flip') },
  { keys: ['龟', '龜'], kind: 'whirlwind', name: n('カメ戦車', '乌龟战车', 'Turtle Tank Spin') },
  { keys: ['屎'], kind: 'confuse', name: n('悪臭バリア', '臭不可挡', 'Unstoppable Stink'), opts: { fx: 'gas' } },
  // ---- 中文 词语 / 梗 ----
  { star: true, lang: 'zh', keys: ['摸鱼', '摸魚'], kind: 'fishSlap', name: n('サボり魚ビンタ', '摸鱼大师', 'Slacker Fish Slap'), opts: { prop: '🐟' } },
  { star: true, lang: 'zh', keys: ['打工'], kind: 'barrage', name: n('打工人の怒り', '打工人的怒火', 'Wage Slave Fury'), opts: { prop: '📄', count: 3, fx: 'paper' } },
  { lang: 'zh', keys: ['下班'], kind: 'charge', name: n('定時ダッシュ', '下班冲刺', 'Clock-Out Dash') },
  { lang: 'zh', keys: ['迟到', '遲到'], kind: 'rage', name: n('ラスト1分', '最后一分钟', 'Last Minute'), opts: { selfFall: true } },
  { lang: 'zh', keys: ['社恐'], kind: 'roar', name: n('近寄らないで！', '不要靠近我！', 'Personal Space!') },
  { lang: 'zh', keys: ['社牛'], kind: 'magnet', name: n('強制チームビルディング', '强制团建', 'Mandatory Team Building') },
  { star: true, lang: 'zh', keys: ['甩锅', '甩鍋'], kind: 'blame', name: n('私のせいじゃない', '这不是我的锅', 'Not My Fault'), opts: { prop: '🍳' } },
  { lang: 'zh', keys: ['画饼', '畫餅'], kind: 'drop', name: n('超特大の絵に描いた餅', '超级大饼', 'Giant Empty Promise'), opts: { prop: '🥞' } },
  { star: true, lang: 'zh', keys: ['键盘侠', '鍵盤俠'], kind: 'drop', name: n('ネット暴撃', '网络暴击', 'Keyboard Warrior'), opts: { prop: '⌨️' } },
  { lang: 'zh', keys: ['真香'], kind: 'heal', name: n('やっぱりうまい', '大型真香现场', 'Actually Delicious') },
  { lang: 'zh', keys: ['咕咕咕', '鸽子', '鴿子'], kind: 'feint', name: n('ドタキャン', '放鸽子', 'Stood You Up') },
  { lang: 'zh', keys: ['螺蛳粉', '螺螄粉'], kind: 'poison', name: n('臭気フィールド', '臭气领域', 'Stink Zone') },
  { lang: 'zh', keys: ['火锅', '火鍋'], kind: 'uppercut', name: n('沸騰火鍋', '沸腾火锅', 'Boiling Hot Pot') },
  { lang: 'zh', keys: ['奶茶'], kind: 'drop', name: n('タピオカ大暴走', '珍珠大暴走', 'Boba Barrage'), opts: { prop: '🧋', count: 3 } },
  { lang: 'zh', keys: ['随便', '隨便'], kind: 'random', name: n('なんでもいい！', '随便啦！', 'Whatever!') },
  { lang: 'zh', keys: ['甲方'], kind: 'confuse', name: n('修正百億回', '再改亿版', 'Revision #1,000,000') },
  { lang: 'zh', keys: ['乙方'], kind: 'drop', name: n('締め切り', '最后期限', 'Deadline'), opts: { prop: '📄', count: 4 } },
  { lang: 'zh', keys: ['躺赢', '躺贏'], kind: 'lazy', name: n('何もしてない', '我什么都没做', 'I Did Nothing') },
  // ---- 日本語 ----
  { lang: 'ja', keys: ['あ'], kind: 'roar', name: n('ああああ！', '啊啊啊啊！', 'AAAAAH!') },
  { lang: 'ja', keys: ['の'], kind: 'whirlwind', name: n('ののの回転', '之之之回转', 'No-No-No Spin') },
  { lang: 'ja', keys: ['し'], kind: 'magnet', name: n('しっぽフック', '尾巴钩', 'Tail Hook') },
  { lang: 'ja', keys: ['く'], kind: 'charge', name: n('くの字アタック', '弯角冲撞', 'Bent-Corner Attack') },
  { lang: 'ja', keys: ['ぬ'], kind: 'freeze', name: n('ぐるぐる縛り', '缠缠捆绑', 'Loop-de-Loop Bind') },
  { lang: 'ja', keys: ['ツ'], kind: 'barrage', name: n('ツインスマッシュ', '双点重击', 'Twin Smash') },
  { lang: 'ja', keys: ['シ'], kind: 'kick', name: n('シューッ！', '嗖——！', 'Swoosh!') },
  { star: true, lang: 'ja', keys: ['ぴえん', 'ぱおん'], kind: 'roar', name: n('ぴえん超えてぱおん', '哭到喷泉', 'Beyond Pien: Paon'), opts: { fx: 'water' } },
  { lang: 'ja', keys: ['おつ', 'お疲れ'], kind: 'roar', name: n('お疲れ様でした', '辛苦了（请离场）', 'Thanks for Your Hard Work') },
  { lang: 'ja', keys: ['知らんけど'], kind: 'drop', name: n('知らんけど！', '我也不知道啦！', 'Dunno Tho!'), opts: { prop: '❓', count: 2 } },
  { lang: 'ja', keys: ['それな'], kind: 'random', name: n('完全同意', '完全同意', 'Totally Agree') },
  { lang: 'ja', keys: ['ドンマイ'], kind: 'barrage', name: n('慰めアタック', '安慰连击', 'Don’t-Mind Slaps') },
  { lang: 'ja', keys: ['寝落ち'], kind: 'lazy', name: n('突然寝落ち', '突然睡着', 'Sudden Nap') },
  { lang: 'ja', keys: ['かわいい', 'カワイイ'], kind: 'magnet', name: n('かわいさ爆発', '可爱爆炸', 'Cuteness Overload'), opts: { fx: 'heart' } },
  { lang: 'ja', keys: ['なるほど'], kind: 'uppercut', name: n('完全理解した', '完全理解了', 'Totally Understood') },
  // ---- English ----
  { lang: 'en', keys: ['lmao', 'lmfao', 'rofl'], kind: 'whirlwind', name: n('ローリング災害', '滚地大灾难', 'Rolling Disaster') },
  { star: true, lang: 'en', keys: ['404'], kind: 'vanish', name: n('プレイヤーが見つかりません', '玩家不存在', 'PLAYER NOT FOUND') },
  { lang: 'en', keys: ['error'], kind: 'vanish', name: n('致命的エラー', '致命错误', 'FATAL ERROR') },
  { lang: 'en', keys: ['bug', 'glitch'], kind: 'vanish', name: n('グリッチ攻撃', '故障攻击', 'GLITCH ATTACK') },
  { lang: 'en', keys: ['lag'], kind: 'vanish', name: n('999ms PING', '999ms 延迟', '999ms PING') },
  { lang: 'en', keys: ['ctrl+z', 'undo'], kind: 'vanish', name: n('元に戻す！', '撤销！', 'UNDO!') },
  { lang: 'en', keys: ['afk'], kind: 'lazy', name: n('放置プレイ', '挂机中', 'Keyboard Abandoned') },
  { lang: 'en', keys: ['rip'], kind: 'lazy', name: n('まだ死んでない', '还没死呢', 'NOT DEAD YET'), opts: { counter: true } },
  { lang: 'en', keys: ['gg'], kind: 'drop', name: n('グッドゲーム！', '打得好！', 'GOOD GAME!'), opts: { prop: 'GG' } },
  { lang: 'en', keys: ['ez'], kind: 'rage', name: n('楽勝すぎ！', '太简单了！', 'TOO EASY!'), opts: { selfFall: true } },
  { lang: 'en', keys: ['bonk'], kind: 'drop', name: n('メガボンク', '超级当头一锤', 'MEGA BONK'), opts: { prop: '🔨' } },
  { lang: 'en', keys: ['boom'], kind: 'quake', name: n('ビッグブーム', '大爆炸', 'BIG BOOM') },
  { lang: 'en', keys: ['nope'], kind: 'shield', name: n('絶対ダメ', '绝对不行', 'ABSOLUTELY NOT') },
  { lang: 'en', keys: ['why'], kind: 'drop', name: n('なんで私が？！', '为什么是我？！', 'WHY ME?!'), opts: { prop: '?', count: 4 } },
  { lang: 'en', keys: ['omg'], kind: 'drop', name: n('オーマイゴッド！', '我的天哪！', 'OH MY GOD!'), opts: { prop: '!' } },
  // ---- 其他: emoji ----
  { star: true, keys: ['🗿'], kind: 'topple', name: n('モアイクラッシュ', '摩艾倒地', 'MOAI CRASH') },
  { keys: ['🥔'], kind: 'charge', name: n('ポテト砲弾', '土豆炮弹', 'Potato Cannonball') },
  { keys: ['🐌'], kind: 'charge', name: n('カタツムリ高速モード', '蜗牛高速模式', 'Snail Turbo Mode') },
  { keys: ['🐙'], kind: 'whirlwind', name: n('タコぐるぐる', '章鱼转转转', 'Octo Spin') },
  { keys: ['🪞'], kind: 'shield', name: n('鏡面反射', '镜像反弹', 'Mirror Bounce') },
  { keys: ['🥚'], kind: 'drop', name: n('殻を破れ', '破壳而出', 'Egg Drop'), opts: { prop: '🥚', count: 3 } },
  { keys: ['🧀'], kind: 'freeze', name: n('チーズの罠', '芝士陷阱', 'Cheese Trap') },
  { keys: ['🫠'], kind: 'vanish', name: n('とろける奇襲', '融化攻击', 'Melt-Down Ambush') },
  // ---- 其他: symbols ----
  { star: true, keys: ['?', '？'], kind: 'random', name: n('正体不明の技', '未知攻击', 'Unknown Attack') },
  { keys: ['@', '＠'], kind: 'whirlwind', name: n('無限周回', '无限绕圈', 'Endless Orbit') },
  { keys: ['#', '＃'], kind: 'freeze', name: n('井の字牢獄', '井字牢笼', 'Hashtag Cage') },
  { keys: ['%', '％'], kind: 'barrage', name: n('100％カオス', '百分百混乱', '100% Chaos') },
  { keys: ['→'], kind: 'charge', name: n('一直線', '一往无前', 'Straight Ahead') },
  { keys: ['※'], kind: 'roar', name: n('米印バースト', '米字爆破', 'Reference-Mark Burst') },
  // ---- 其他: kaomoji (matched as a whole) ----
  { star: true, keys: ['ಠ_ಠ', 'ಠ'], kind: 'glare', name: n('死の凝視', '死亡凝视', 'Death Stare') },
  { star: true, keys: ['(╯°□°)╯︵ ┻━┻', '(╯°□°)╯︵┻━┻', '(╯°□°)╯', '┻━┻'], kind: 'drop', name: n('ちゃぶ台返し', '掀桌奥义', 'Table Flip'), opts: { prop: '┻━┻', arc: true } },
  { keys: ['(・ω・)'], kind: 'kick', name: n('あざとい頭突き', '卖萌冲击', 'Cute Headbutt') },
  { keys: ['(>_<)'], kind: 'quake', name: n('もう限界', '忍无可忍', 'Can’t Take It!') },
  { keys: ['(╥﹏╥)'], kind: 'roar', name: n('涙の決壊', '泪海决堤', 'Sea of Tears'), opts: { fx: 'water' } },
  { keys: ['(ง •̀_•́)ง', '(ง'], kind: 'barrage', name: n('格闘モードON', '格斗模式 ON', 'Fight Mode ON') },
  { keys: ['¯\\_(ツ)_/¯', '¯\\_(ツ)_/'], kind: 'shield', name: n('知ったこっちゃない', '关我什么事', 'Not My Problem') },
  { keys: ['(￣▽￣)'], kind: 'giantFall', name: n('調子に乗りすぎ', '得意忘形', 'Too Smug') },

  // ---- Chinese internet slang / memes (中文网络梗) ----
  { lang: 'zh', keys: ['尼玛', '你妈', '泥马', '尼瑪', 'nmsl'], kind: 'roar', name: n('罵詈雑言ラッシュ', '国粹输出', 'Mother of All Insults') },
  { lang: 'zh', keys: ['煞笔', '傻逼', '沙比', '傻b', 'sb', '傻瓜', '笨蛋', '憨憨', '二百五', '智障', '弱智'], kind: 'confuse', name: n('おバカ伝染', '降智打击', 'IQ Drain') },
  { lang: 'zh', keys: ['草泥马', '羊驼'], kind: 'charge', name: n('アルパカ大暴走', '草泥马奔腾', 'Alpaca Stampede') },
  { lang: 'zh', keys: ['卧槽', '我靠', '握草', '我去', 'woc', 'wc'], kind: 'quake', name: n('ウォーツァオ衝撃波', '卧槽冲击波', 'Holy Crap Shockwave') },
  { lang: 'zh', keys: ['牛逼', '牛b', '牛批', '牛掰', 'nb', '厉害了'], kind: 'giant', name: n('ドヤ顔巨大化', '牛逼哄哄巨大化', 'Too Awesome to Fit') },
  { lang: 'zh', keys: ['666', '六六六', '溜溜溜'], kind: 'barrage', name: n('666連打', '六六六连打', '666 Combo') },
  { lang: 'zh', keys: ['躺平'], kind: 'shield', name: n('寝そべり防御', '躺平防御', 'Lie-Flat Defense') },
  { lang: 'zh', keys: ['内卷', '卷王', '內卷'], kind: 'whirlwind', name: n('内巻き大渦', '内卷漩涡', 'Rat-Race Vortex') },
  { lang: 'zh', keys: ['摆烂', '擺爛'], kind: 'heal', name: n('サボり回復', '带薪摆烂回血', 'Paid Slacking') },
  { lang: 'zh', keys: ['打工人', '社畜', '加班', '996', '福报'], kind: 'barrage', name: n('社畜残業ラッシュ', '996福报连击', 'Overtime Barrage') },
  { lang: 'zh', keys: ['芭比q', '芭比Q', '完蛋', '凉了', '寄了'], kind: 'meteor', name: n('バーベキュー火の雨', '芭比Q火雨', 'It’s So Over BBQ') },
  { lang: 'zh', keys: ['yyds', '永远的神', '绝绝子', '封神'], kind: 'giant', name: n('神降臨', 'YYDS封神', 'GOAT Mode') },
  { lang: 'zh', keys: ['凡尔赛', '土豪', '有钱', '暴发户'], kind: 'bribe', name: n('成金アピール', '凡尔赛撒钱', 'Humblebrag Cash') },
  { lang: 'zh', keys: ['破防', '裂开', '心态崩'], kind: 'beam', name: n('メンタル破壊ビーム', '破防光线', 'Emotional Damage') },
  { lang: 'zh', keys: ['奥利给', '加油', '冲鸭', '冲冲冲'], kind: 'heal', name: n('気合い注入', '奥利给满血', 'Pep-Talk Heal') },
  { lang: 'zh', keys: ['退退退'], kind: 'roar', name: n('退散！退散！', '退！退！退！', 'Back Off x3') },
  { lang: 'zh', keys: ['我太难了', '网抑云', '心累', 'emo'], kind: 'lecture', name: n('病みポエム朗読', '网抑云催眠', 'Sad Playlist') },
  { lang: 'zh', keys: ['下头', '尴尬', '冷场'], kind: 'freeze', name: n('ドン引き冷凍', '尴尬到结冰', 'Cringe Freeze') },
  { lang: 'zh', keys: ['上头', '狂暴'], kind: 'charge', name: n('のぼせ突進', '上头冲锋', 'Hot-Headed Rush') },
  { lang: 'zh', keys: ['吃瓜', '瓜'], kind: 'chomp', name: n('野次馬スイカかじり', '吃瓜大口', 'Melon-Gossip Chomp') },
  { lang: 'zh', keys: ['社死', '离谱', '离大谱', '丢人'], kind: 'confuse', name: n('社会的死', '社死现场', 'Social Death') },
  { lang: 'zh', keys: ['狗头', '保命'], kind: 'chomp', name: n('保身ワンコ噛み', '保命狗头咬', 'Doge Bite') },
  { lang: 'zh', keys: ['老六', '偷袭'], kind: 'kick', name: n('不意打ちキック', '老六偷袭', 'Sneaky Ambush') },
  { lang: 'zh', keys: ['绿茶', '舔狗', '撒娇'], kind: 'magnet', name: n('あざとい引力', '绿茶的引力', 'Clingy Gravity') },
  { lang: 'zh', keys: ['杠精', '抬杠', '杠'], kind: 'roar', name: n('屁理屈の咆哮', '杠精抬杠', 'Well-Actually Roar') },
  { lang: 'zh', keys: ['哈哈哈', '笑死', '绷不住'], kind: 'joke', name: n('爆笑ギャグ', '笑死人的段子', 'Killer Joke') },
  // ---- Japanese slang / memes (日本語スラング) ----
  { lang: 'ja', keys: ['バカ', 'ばか', '馬鹿', 'アホ', 'あほ', 'ボケ', 'ポンコツ'], kind: 'confuse', name: n('バカがうつる', '笨蛋传染', 'Contagious Dumb') },
  { lang: 'ja', keys: ['うるさい', 'うっせえ', 'うっせぇ', 'うるせぇ', '黙れ'], kind: 'roar', name: n('うっせぇわ', '吵死了！', 'Shut Up!') },
  { lang: 'ja', keys: ['無理', 'むり', 'ムリ', '拒否'], kind: 'shield', name: n('無理です（拒否）', '不行（拒绝）', 'Nope Wall') },
  { lang: 'ja', keys: ['ヤバい', 'やばい', 'ヤバ', 'やば'], kind: 'quake', name: n('ヤバい地震', '要命地震', 'Yabai Quake') },
  { lang: 'ja', keys: ['オワタ', '終わった', 'おわた', 'オワコン'], kind: 'meteor', name: n('オワタ流星群', '完蛋流星群', 'It’s-Over Meteors') },
  { lang: 'ja', keys: ['推し', '尊い', 'てぇてぇ'], kind: 'magnet', name: n('推しへの愛', '本命之爱', 'Oshi Love') },
  { lang: 'ja', keys: ['エモい', '病み'], kind: 'lecture', name: n('エモい子守唄', '伤感催眠曲', 'Emo Lullaby') },
  { lang: 'ja', keys: ['激おこ', 'ぷんぷん', 'ムカつく', 'キレた'], kind: 'roar', name: n('激おこぷんぷん丸', '气鼓鼓大吼', 'Mega-Mad Roar') },
  { lang: 'ja', keys: ['残業', 'ブラック', 'サビ残'], kind: 'barrage', name: n('サービス残業ラッシュ', '无偿加班连打', 'Unpaid Overtime Rush') },
  { lang: 'ja', keys: ['チート', '最強', 'つよい'], kind: 'giant', name: n('チート巨大化', '开挂巨大化', 'Cheat Code Giant') },
  { lang: 'ja', keys: ['ドヤ顔', 'ドヤ'], kind: 'shield', name: n('ドヤ顔ガード', '得意脸防御', 'Smug Guard') },
  { lang: 'ja', keys: ['ワロタ', 'ワロス', '草生える', '大草原'], kind: 'joke', name: n('大草原不可避', '笑出大草原', 'Lawn of Laughter') },
  { lang: 'ja', keys: ['ガチ', 'マジ'], kind: 'charge', name: n('ガチ突進', '认真冲撞', 'Dead-Serious Charge') },
  { lang: 'ja', keys: ['なんでやねん', 'ツッコミ'], kind: 'throw', name: n('ツッコミ投げ', '吐槽过肩摔', 'Comedy Retort Throw') },
  { lang: 'ja', keys: ['ぬるぽ', 'ガッ'], kind: 'barrage', name: n('ガッ', '嘎！', 'Null-Pointer Smack') },
  { lang: 'ja', keys: ['ねこ', 'ネコ', 'にゃー', 'にゃん'], kind: 'barrage', name: n('ねこねこパンチ', '喵喵连环爪', 'Kitty Flurry') },
  { lang: 'ja', keys: ['すし', 'スシ'], kind: 'whirlwind', name: n('回転寿司', '回转寿司', 'Conveyor Sushi Spin') },
  // ---- English slang / memes ----
  { lang: 'en', keys: ['noob', 'n00b', 'idiot', 'dumb', 'stupid'], kind: 'confuse', name: n('初心者オーラ', '菜鸟光环', 'Noob Aura') },
  { lang: 'en', keys: ['sus', 'amogus', 'impostor', 'ohio', 'skibidi'], kind: 'confuse', name: n('怪しい告発', '可疑指控', 'Sus Accusation') },
  { lang: 'en', keys: ['bruh', 'cringe', 'awkward'], kind: 'freeze', name: n('ブルー・モーメント', '无语冻结', 'Bruh Moment') },
  { lang: 'en', keys: ['yeet'], kind: 'throw', name: n('イート投げ', '用力一扔', 'YEET') },
  { lang: 'en', keys: ['rizz', 'uwu', 'owo', 'simp', 'love'], kind: 'magnet', name: n('無言のモテ力', '无声魅力', 'Unspoken Rizz') },
  { lang: 'en', keys: ['pwned', 'owned', 'combo'], kind: 'barrage', name: n('イージー連打', '轻松连打', 'EZ Clap') },
  { lang: 'en', keys: ['boomer', 'nerd', 'actually'], kind: 'lecture', name: n('オッケーブーマー講義', '老古董讲座', 'OK Boomer Lecture') },
  { lang: 'en', keys: ['stonks', 'rich', 'bling', 'money', 'cash'], kind: 'bribe', name: n('ストンクス', '股市暴涨撒钱', 'Stonks') },
  { lang: 'en', keys: ['shit', 'crap', 'poop'], kind: 'poison', name: n('有毒ダンプ', '毒气倾倒', 'Toxic Dump') },
  { lang: 'en', keys: ['wtf', 'fuck', 'damn', 'karen'], kind: 'roar', name: n('放送禁止シャウト', '消音级怒吼', 'Unprintable Rant') },
  { lang: 'en', keys: ['chad', 'gigachad', 'sigma', 'alpha', 'goat'], kind: 'giant', name: n('ギガチャド化', '巨型猛男化', 'Gigachad') },
  { lang: 'en', keys: ['xd', 'haha'], kind: 'joke', name: n('親父ギャグ', '老爸冷笑话', 'Dad Joke') },
  { lang: 'en', keys: ['ninja', 'sneaky'], kind: 'kick', name: n('忍者キック', '忍者飞踢', 'Ninja Ambush') },
  { lang: 'en', keys: ['punch', 'fist', 'box'], kind: 'barrage', name: n('ワンツーラッシュ', '一二连拳', 'One-Two Rush') },
  { lang: 'en', keys: ['kick'], kind: 'kick', name: n('ライダーキック', '无影脚', 'Shadowless Kick') },
  { lang: 'en', keys: ['beam', 'laser'], kind: 'beam', name: n('レーザービーム', '激光炮', 'Laser Beam') },
  { lang: 'en', keys: ['cat', 'kitty', 'meow'], kind: 'barrage', name: n('ねこねこパンチ', '喵喵连环爪', 'Kitty Flurry') },
  { lang: 'en', keys: ['dog', 'shark', 'bite'], kind: 'chomp', name: n('がぶっと丸かじり', '血盆大口', 'Big Chomp') },
  { lang: 'en', keys: ['banana'], kind: 'kick', name: n('バナナスライディング', '香蕉滑铲', 'Banana Slide') },
  // ---- Emoji & symbols (其他) ----
  { keys: ['🤡'], kind: 'confuse', name: n('ピエロの舞', '小丑表演', 'Clown Show') },
  { keys: ['💯'], kind: 'barrage', name: n('満点連打', '满分连击', '100% Combo') },
  { keys: ['🤬', '🗯'], kind: 'roar', name: n('放送禁止シャウト', '消音级怒吼', 'Unprintable Rant') },
  { keys: ['🥺'], kind: 'magnet', name: n('うるうる上目遣い', '可怜巴巴吸引', 'Puppy-Eyes Pull') },
  { keys: ['😭', '😢'], kind: 'whirlwind', name: n('涙の大渦', '眼泪漩涡', 'Tear Tornado') },
  { keys: ['🙏'], kind: 'heal', name: n('お願いヒール', '拜托了回复', 'Pretty-Please Heal') },
  { keys: ['🤑'], kind: 'bribe', name: n('札束ビンタ', '金钱攻势', 'Money Rain') },
  { keys: ['🤯'], kind: 'quake', name: n('脳内大爆発', '脑袋爆炸', 'Mind Blown') },
  { keys: ['😎'], kind: 'shield', name: n('サングラスガード', '墨镜防御', 'Too-Cool Guard') },
  { keys: ['🤓'], kind: 'lecture', name: n('ガリ勉講義', '书呆子讲座', 'Nerd Lecture') },
  { keys: ['🦙'], kind: 'charge', name: n('アルパカ大暴走', '草泥马奔腾', 'Alpaca Stampede') },
  { keys: ['🍉'], kind: 'chomp', name: n('野次馬スイカかじり', '吃瓜大口', 'Melon-Gossip Chomp') },
  // ---- Single characters (漢字・汉字) ----
  { keys: ['龍', '龙', '竜', '昇', '升', '🐉', '🐲'], kind: 'uppercut', name: n('昇龍拳', '升龙拳', 'Rising Dragon') },
  { keys: ['上', '天', '起'], kind: 'uppercut', name: n('天まで届けアッパー', '冲天上勾拳', 'Sky-High Uppercut') },
  { keys: ['拳', '打', '手', '掌', '武', '攻', '殴', '👊', '✊'], kind: 'barrage', name: n('百裂拳', '百裂拳', 'Hundred Fists') },
  { keys: ['猫', '貓', '🐱', '🐈'], kind: 'barrage', name: n('ねこねこパンチ', '喵喵连环爪', 'Kitty Flurry') },
  { keys: ['戦', '战', '戰', '闘', '斗', '鬥'], kind: 'barrage', name: n('闘魂ラッシュ', '斗魂连打', 'Fighting Spirit Rush') },
  { keys: ['岩', '土', '地', '震', '重', '🪨', '⛰'], kind: 'quake', name: n('天変地異', '天崩地裂', 'Earthshaker') },
  { keys: ['光', '日', '炮', '砲', '射', '✨', '🔦'], kind: 'beam', name: n('ひかりビーム', '光子炮', 'Photon Cannon') },
  { keys: ['目', '眼', '見', '见', '視', '视', '👀', '👁'], kind: 'beam', name: n('メンチビーム', '死亡凝视', 'Death Glare') },
  { keys: ['雷', '電', '电', '⚡', '🌩'], kind: 'beam', name: n('落雷', '雷霆万钧', 'Thunderbolt') },
  { keys: ['風', '风', '回', '旋', '渦', '涡', '嵐', '🌀', '🌪', '∞', '♾'], kind: 'whirlwind', name: n('大竜巻', '龙卷风摧毁停车场', 'Tornado Spin') },
  { keys: ['水', '海', '波', '🌊'], kind: 'whirlwind', name: n('うずしお', '水龙卷', 'Whirlpool') },
  { keys: ['牛', '猪', '豚', '車', '车', '馬', '马', '突', '冲', '衝', '🐂', '🐗', '🚗', '🚚'], kind: 'charge', name: n('暴走タックル', '野蛮冲撞', 'Rampage Tackle') },
  { keys: ['巨', '王', '皇', '帝', '長', '长', '高', '👑'], kind: 'giant', name: n('巨大化', '巨大化', 'Gigantify') },
  { keys: ['氷', '冰', '雪', '冬', '冷', '寒', '凍', '冻', '❄', '🧊', '⛄'], kind: 'freeze', name: n('絶対零度', '绝对零度', 'Absolute Zero') },
  { keys: ['薬', '药', '藥', '医', '醫', '癒', '治', '健', '康', '💊', '🩹'], kind: 'heal', name: n('いたいのとんでけ', '痛痛飞走吧', 'Kiss It Better') },
  { keys: ['生', '命', '心', '休', '茶', '🍵'], kind: 'heal', name: n('ひと休み', '喝口茶歇歇', 'Tea Break') },
  { keys: ['炎', '焔', '燃', '🔥'], kind: 'meteor', name: n('流星火雨', '流星火雨', 'Fire Rain') },
  { keys: ['星', '★', '☆', '⭐', '🌟', '☄', '隕', '陨'], kind: 'meteor', name: n('流星群', '流星雨', 'Meteor Shower') },
  { keys: ['雨', '雹', '☔', '🌧'], kind: 'meteor', name: n('ゲリラ豪雨', '冰雹暴雨', 'Hailstorm') },
  { keys: ['足', '脚', '蹴', '踢', '走', '跑', '跳', '🦵', '👟'], kind: 'kick', name: n('ライダーキック', '无影脚', 'Shadowless Kick') },
  { keys: ['飛', '飞', '翔', '鳥', '鸟', '🐦', '🦅'], kind: 'kick', name: n('急降下キック', '俯冲飞踢', 'Dive Kick') },
  { keys: ['投', '摔', '柔', '道', '力', '💪'], kind: 'throw', name: n('一本背負い', '过肩摔', 'Shoulder Throw') },
  { keys: ['盾', '守', '護', '护', '門', '门', '壁', '鉄', '铁', '鐵', '甲', '🛡', '田'], kind: 'shield', name: n('鉄壁ガード', '铁壁防御', 'Iron Wall') },
  { keys: ['吼', '叫', '声', '聲', '音', '喝', '怒', '獅', '狮', '虎', '🦁', '🐯', '📢', '😡'], kind: 'roar', name: n('獅子咆哮', '狮子吼', 'Lion Roar') },
  { keys: ['吸', '引', '磁', '爱', '愛', '恋', '戀', '♥', '❤', '💕', '🧲'], kind: 'magnet', name: n('愛の引力', '爱的万有引力', 'Gravity of Love') },
  { keys: ['毒', '病', '菌', '臭', '屁', '☠', '🦠', '💩'], kind: 'poison', name: n('毒ガス攻撃', '生化毒气', 'Toxic Cloud') },
  { keys: ['金', '钱', '錢', '銭', '円', '元', '¥', '$', '富', '财', '財', '💰', '💴', '💵'], kind: 'bribe', name: n('札束ビンタ', '金钱攻势', 'Money Rain') },
  { keys: ['书', '書', '学', '學', '本', '文', '教', '师', '師', '字', '📚', '📖'], kind: 'lecture', name: n('お説教タイム', '知识的力量', 'Boring Lecture') },
  { keys: ['眠', '寝', '睡', '夢', '梦', '💤', '😴'], kind: 'lecture', name: n('子守唄', '催眠曲', 'Lullaby') },
  { keys: ['食', '吃', '咬', '牙', '歯', '齿', '齒', '嘴', '鮫', '鲨', '犬', '狗', '🦈', '🐊', '😋', '🐶'], kind: 'chomp', name: n('がぶっと丸かじり', '血盆大口', 'Big Chomp') },
  { keys: ['爆', '炸', '💣', '💥', '🧨'], kind: 'quake', name: n('爆裂衝撃波', '爆裂冲击波', 'Big Bang Shockwave') },
  { keys: ['鬼', '幽', '霊', '灵', '靈', '👻'], kind: 'lecture', name: n('金縛り', '鬼压床', 'Sleep Paralysis') },
  { keys: ['🍣', '寿', '鮨', '寿司'], kind: 'whirlwind', name: n('回転寿司', '回转寿司', 'Conveyor Sushi Spin') },
  { keys: ['🍌', '香蕉'], kind: 'kick', name: n('バナナスライディング', '香蕉滑铲', 'Banana Slide') },
  { keys: ['💀', '骨', '死'], kind: 'poison', name: n('死の吐息', '死亡吐息', 'Breath of Doom') },
  { keys: ['😂', '🤣', '😆', '草'], kind: 'joke', name: n('寒いダジャレ', '冷笑话攻击', 'Terrible Pun') },
  { lang: 'ja', keys: ['w', 'www', 'ｗｗｗ'], kind: 'joke', name: n('寒いダジャレ', '冷笑话攻击', 'Terrible Pun') },
];

export const SHAPE_MOVES: Record<'speed' | 'attack' | 'defense' | 'stability' | 'weight', Signature> = {
  attack: { kind: 'barrage', name: n('字形連打', '字形连打', 'Glyph Flurry'), key: '' },
  speed: { kind: 'kick', name: n('稲妻キック', '闪电踢', 'Lightning Kick'), key: '' },
  defense: { kind: 'shield', name: n('カチカチ防御', '硬邦邦防御', 'Rock-Hard Guard'), key: '' },
  stability: { kind: 'quake', name: n('どっしり地響き', '稳如泰山踩', 'Rumble Stomp'), key: '' },
  weight: { kind: 'charge', name: n('ロードローラー突進', '压路机冲撞', 'Road Roller Rush'), key: '' },
};

const SINGLE = new Map<string, MoveEntry>();
const MULTI: { key: string; e: MoveEntry; latin: boolean; len: number }[] = [];
for (const e of MOVE_TABLE) {
  for (const k of e.keys) {
    const key = k.normalize('NFC');
    if (Array.from(key).length === 1 || /^\p{Extended_Pictographic}️?$/u.test(key)) {
      const base = key.replace(/️/g, '');
      if (!SINGLE.has(base)) SINGLE.set(base, e);
    } else MULTI.push({ key: key.toLowerCase(), e, latin: /^[a-z0-9 ]+$/i.test(key), len: Array.from(key).length });
  }
}

const WORDCH = /[a-z0-9]/i;

/** Pick the signature move for an input: earliest meaningful match (longest at a tie), then shape. */
export function resolveSignature(text: string, graphemes: string[], stats: Stats): Signature {
  const lower = text.toLowerCase();
  // UTF-16 index → grapheme index, so word matches and character matches share positions.
  const gAt: number[] = [];
  graphemes.forEach((g, i) => {
    for (let k = 0; k < g.length; k++) gAt.push(i);
  });
  let best: { pos: number; len: number; e: MoveEntry; key: string } | null = null;
  const offer = (pos: number, len: number, e: MoveEntry, key: string) => {
    if (!best || pos < best.pos || (pos === best.pos && len > best.len)) best = { pos, len, e, key };
  };
  graphemes.forEach((g, pos) => {
    const base = g.replace(/[︎️]/g, '');
    const e = SINGLE.get(base) ?? SINGLE.get(Array.from(base)[0]);
    // A lone latin letter inside a word ('w' in "wow") shouldn't trigger; only as the whole input.
    if (e && !(/^[a-z]$/i.test(base) && graphemes.length > 1)) offer(pos, 1, e, base);
  });
  for (const { key, e, latin, len } of MULTI) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(key, from);
      if (i < 0) break;
      from = i + 1;
      // Latin keys only match whole words ("sb" must not fire inside "sbox").
      if (latin && (WORDCH.test(lower[i - 1] ?? '') || WORDCH.test(lower[i + key.length] ?? ''))) continue;
      offer(gAt[i] ?? 0, len, e, text.slice(i, i + key.length));
      break;
    }
  }
  if (best) {
    const b = best as { e: MoveEntry; key: string };
    return { kind: b.e.kind, name: b.e.name, key: b.key, opts: b.e.opts, normal: b.e.normal };
  }
  if (stats.weight >= 85) return SHAPE_MOVES.weight;
  // Strongest stat decides, with the runner-up taking over for about a third of texts
  // (stable per text) so blocky glyphs don't all share the same move.
  const order = (['attack', 'speed', 'defense', 'stability'] as const).slice().sort((a, b) => stats[b] - stats[a]);
  const flip = Array.from(text).reduce((h, c) => (h * 31 + c.codePointAt(0)!) % 997, 7) % 3 === 0;
  return SHAPE_MOVES[order[flip ? 1 : 0]];
}

/** Gap (surface distance) range in which the AI considers firing the move. */
export function moveRange(kind: MoveKind): [number, number] {
  switch (kind) {
    case 'beam':
    case 'bribe':
    case 'lecture':
    case 'joke':
    case 'magnet':
    case 'meteor':
    case 'confuse':
      return [0.5, 6];
    case 'kick':
    case 'charge':
      return [1.2, 5.5];
    case 'roar':
    case 'freeze':
    case 'poison':
    case 'whirlwind':
    case 'quake':
      return [0, 3.2];
    case 'giant':
    case 'heal':
    case 'shield':
      return [0, 99];
    case 'sweep':
    case 'giantFall':
    case 'topple':
      return [0, 2.4];
    case 'swallow':
      return [0, 1.2];
    case 'mountain':
    case 'rage':
      return [1, 6];
    case 'fireCharge':
    case 'feint':
      return [0.8, 5.5];
    case 'laughQuake':
    case 'random':
      return [0, 4];
    case 'lazy':
    case 'blame':
      return [0, 99];
    case 'fishSlap':
      return [0, 2];
    case 'clones':
      return [0, 5];
    case 'drop':
    case 'vanish':
    case 'glare':
      return [0.5, 7];
    default:
      return [0, 1.6];
  }
}

/** Kinds the 'random' move (? / 随便 / それな) can turn into: simple, self-contained ones. */
export const RANDOM_KINDS: MoveKind[] = ['barrage', 'uppercut', 'quake', 'beam', 'whirlwind', 'charge', 'giant', 'freeze', 'kick', 'roar', 'magnet', 'joke', 'confuse', 'sweep', 'vanish', 'rage'];

export const MOVE_KINDS: MoveKind[] = [
  'barrage', 'uppercut', 'quake', 'beam', 'whirlwind', 'charge', 'giant', 'freeze', 'heal', 'meteor', 'kick', 'throw', 'shield', 'roar',
  'magnet', 'poison', 'bribe', 'lecture', 'chomp', 'joke', 'confuse',
  'sweep', 'giantFall', 'swallow', 'mountain', 'fireCharge', 'laughQuake', 'lazy', 'feint', 'fishSlap', 'blame', 'drop', 'vanish', 'topple', 'random', 'glare', 'rage',
  'clones',
];

// ---------------------------------------------------------------- key languages (for docs)

// Han characters used in mainland Chinese only, and Japanese-only (shinjitai) forms.
const SIMPLIFIED_ONLY = new Set(Array.from('龙战斗见视电风涡车马冲长冻药陨飞鸟护门铁声狮爱恋钱财书学师梦齿鲨灵炸愤谜弹龟迟圣黑'));
const JAPANESE_ONLY = new Set(Array.from('竜戦闘氷薬鉄円銭歯霊遅亀黒弾寝'));

/** Which language folder(s) a key belongs in. Shared kanji/hanzi are listed under both zh and ja. */
export function keyLanguages(key: string, entryLang?: KeyLang): KeyLang[] {
  if (/\p{Extended_Pictographic}/u.test(key) || !/[\p{L}\p{N}]/u.test(key)) return ['other'];
  if (entryLang) return [entryLang];
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(key)) return ['ja'];
  if (/^[\p{Script=Latin}0-9 ]+$/u.test(key)) return ['en'];
  if (/\p{Script=Han}/u.test(key)) {
    const chars = Array.from(key);
    if (chars.some((c) => SIMPLIFIED_ONLY.has(c))) return ['zh'];
    if (chars.some((c) => JAPANESE_ONLY.has(c))) return ['ja'];
    return ['zh', 'ja'];
  }
  return ['other'];
}
