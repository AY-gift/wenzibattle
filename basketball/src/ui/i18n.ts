/** Glyph Basketball UI strings (ja default, zh, en). Language state is shared with the other games. */
import { getLang } from '@shared/i18n';
import type { SportSkillKind } from '@shared/sports/skills';

export { describeFighter, getLang, initLang, LANGS, onLangChange, setLang, type Lang } from '@shared/i18n';

type Dict = Record<string, string>;

const ja: Dict = {
  title: 'グリフバスケ 2v2', tagline: '一文字が一人の選手。二文字でコンビ結成、ティップオフ！',
  home: 'ホーム', away: 'アウェイ', howSplit: '一発コンビ', howFree: '自由編成',
  howSplitHint: '二文字の言葉を1文字ずつ選手に（例：冰火・兄弟）', howFreeHint: '1マス1人。「ママ」などの言葉もそのまま1人',
  splitPh: '例：冰火・兄弟', memberPh: '選手{n}', teamNamePh: 'チーム名（省略可）',
  errCount: '{n}文字です。ちょうど2文字にしてください（言葉のまま使うなら自由編成へ）', errEmpty: '文字を入れてください', errMember: '{n}人目が読めません',
  kickoff: 'ティップオフ！', randomMatch: 'おまかせ対戦', combo: '連携', catalogLink: '📖 図鑑', cultureCombo: '文化コンビ', rivalry: '宿命の対決', noCombo: '特別なコンビ技なし（通常の戦術で戦う）',
  pause: '一時停止', resume: '再開', restart: 'やり直し', change: 'チームを変える', speed: '倍速',
  r_pace: '速', r_power: '力', r_control: '技', r_defense: '守', r_accuracy: '投', r_jump: '跳', rf_pace: 'スピード', rf_power: 'パワー', rf_control: 'ドリブル', rf_defense: '守備', rf_accuracy: 'シュート', rf_jump: 'ジャンプ', ratingsHint: '選手をタップで詳細',
  again: 'もう一試合', share: 'シェア', save: '画像を保存', win: '勝利！', draw: '引き分け', overtime: '延長',
  winText: '「{w}」の勝ち！', drawText: '引き分け', mvp: 'MVP', shotClock: 'ショットクロック',
  copied: 'リンクをコピーしました', imageSaved: '画像を保存しました', challengeCopied: '挑戦リンクをコピーしました', copyFailed: 'コピーできませんでした',
  challengeBanner: '挑戦状が届いた！ 自分のコンビで「ティップオフ！」',
  reportTitle: '試合レポート', reportNote: '共有された試合の実際の結果です。', watchReplay: 'リプレイを見る', replayNote: '同じシードで再シミュレーションします（端末のフォントで展開が変わることがあります）', challengeMine: '自分のコンビで挑戦する', closeBtn: '閉じる',
  sharePanel: 'シェア', shareNative: 'アプリで共有…', shareNativeImg: '画像つきで共有…', shareX: 'X でポスト', shareLine: 'LINE で送る', shareBsky: 'Bluesky に投稿',
  copyLink: '試合リンクをコピー', saveCard: '試合画像を保存（PNG）', challengeLink: 'このカードで挑戦状を送る', shareHint: 'ボタンは各サービスの投稿画面を開くだけです。投稿するかどうかはあなたが決めます。',
  sharePost: '『グリフバスケ』{a} {sa}-{sb} {b} → {res}', shareChallenge: '『グリフバスケ』{a} VS {b} — あなたのコンビで勝てる？', shareTag: '#グリフバスケ',
  modeBasket: 'バスケ · 2 VS 2', cardFooter: '{site} で遊べる・登録不要', highlight: '名場面', mvpText: '「{p}」— {pts} 点・必殺「{move}」',
  w_score2: 'ナイスシュート！', w_score3: 'スリーポイント！', w_dunk: 'ダンク！！', w_superDunk: 'スーパーダンク！！！', w_airCrash: '空中衝突！', w_block: 'ブロック！', w_steal: 'スティール！', w_rebound: 'リバウンド！', w_miss: 'スカッ',
  w_brawl: '大乱闘！', w_ko: 'KO', w_shotClock: '24…じゃなくて12秒！', w_lucky: 'リングが味方した！', w_swish: 'スウィッシュ！', w_airball: 'エアボール！', w_overtime: '延長戦！',
  footer: 'Emoji: Twemoji (CC-BY 4.0) / Font: M PLUS Rounded 1c (OFL)', quality: '画質', high: '高', low: '低', sound: '音', on: 'ON', off: 'OFF',
};

const zh: Dict = {
  title: '字形篮球 2v2', tagline: '一个字是一名球员。两个字组成搭档，跳球！',
  home: '主队', away: '客队', howSplit: '一键搭档', howFree: '自由组队',
  howSplitHint: '输入两个字，每个字是一名球员（例：冰火、兄弟）', howFreeHint: '一个格子一名球员，「妈妈」这样的词也是一个人',
  splitPh: '例：冰火、兄弟', memberPh: '球员{n}', teamNamePh: '队名（可不填）',
  errCount: '现在是 {n} 个字，请输入正好 2 个字（想保留整词请用自由组队）', errEmpty: '请输入文字', errMember: '第 {n} 名球员无法识别',
  kickoff: '跳球！', randomMatch: '随机对战', combo: '连携', catalogLink: '📖 图鉴', cultureCombo: '文化搭档', rivalry: '宿敌对决', noCombo: '无特殊搭档技（普通战术）',
  pause: '暂停', resume: '继续', restart: '重新开始', change: '换队伍', speed: '倍速',
  r_pace: '速', r_power: '力', r_control: '运', r_defense: '守', r_accuracy: '投', r_jump: '跳', rf_pace: '速度', rf_power: '力量', rf_control: '运球', rf_defense: '防守', rf_accuracy: '投篮', rf_jump: '弹跳', ratingsHint: '点球员看详情',
  again: '再来一场', share: '分享', save: '保存图片', win: '胜利！', draw: '平局', overtime: '加时',
  winText: '「{w}」获胜！', drawText: '平局', mvp: 'MVP', shotClock: '进攻时间',
  copied: '链接已复制', imageSaved: '图片已保存', challengeCopied: '挑战链接已复制', copyFailed: '复制失败',
  challengeBanner: '收到挑战书！组好你的搭档，点「跳球！」',
  reportTitle: '战报', reportNote: '这是分享者那一场的真实结果。', watchReplay: '看重播', replayNote: '用同一种子重新模拟（不同设备的字体可能让过程略有不同）', challengeMine: '用自己的搭档来挑战', closeBtn: '关闭',
  sharePanel: '分享', shareNative: '系统分享…', shareNativeImg: '带图片分享…', shareX: '分享到 X', shareLine: '分享到 LINE', shareBsky: '分享到 Bluesky',
  copyLink: '复制战报链接', saveCard: '保存战报 PNG', challengeLink: '挑战这个阵容（复制挑战链接）', shareHint: '按钮只会打开对应平台的发帖页面，发不发由你决定。',
  sharePost: '《字形篮球》{a} {sa}:{sb} {b} → {res}', shareChallenge: '《字形篮球》{a} VS {b} —— 你的搭档能赢吗？', shareTag: '#字形篮球',
  modeBasket: '篮球 · 2 VS 2', cardFooter: '在 {site} 免费玩 · 无需注册', highlight: '本场名场面', mvpText: '「{p}」— {pts} 分 · 必杀「{move}」',
  w_score2: '漂亮！', w_score3: '三分！', w_dunk: '扣篮！！', w_superDunk: '飞身暴扣！！！', w_airCrash: '空中相撞！', w_block: '盖帽！', w_steal: '抢断！', w_rebound: '篮板！', w_miss: '打空了',
  w_brawl: '大乱斗！', w_ko: 'KO', w_shotClock: '进攻超时！', w_lucky: '篮筐帮忙了！', w_swish: '空心！', w_airball: '三不沾！', w_overtime: '加时赛！',
  footer: 'Emoji: Twemoji (CC-BY 4.0) / Font: M PLUS Rounded 1c (OFL)', quality: '画质', high: '高', low: '低', sound: '声音', on: '开', off: '关',
};

const en: Dict = {
  title: 'Glyph Basketball 2v2', tagline: 'One glyph, one player. Two glyphs make a duo — tip off!',
  home: 'Home', away: 'Away', howSplit: 'One word', howFree: 'Pick 2',
  howSplitHint: 'A 2-character word: one player per character (e.g. 冰火)', howFreeHint: 'One box, one player — words like “mom” stay whole',
  splitPh: 'e.g. 冰火, 兄弟', memberPh: 'Player {n}', teamNamePh: 'Team name (optional)',
  errCount: '{n} characters — need exactly 2 (use Pick 2 to keep whole words)', errEmpty: 'Type something', errMember: 'Player {n} can’t be read',
  kickoff: 'TIP OFF!', randomMatch: 'Random match', combo: 'Combo', catalogLink: '📖 Catalog', cultureCombo: 'Culture duo', rivalry: 'Rivalry', noCombo: 'No special duo move (normal tactics)',
  pause: 'Pause', resume: 'Resume', restart: 'Restart', change: 'Change teams', speed: 'Speed',
  r_pace: 'SPD', r_power: 'PWR', r_control: 'HDL', r_defense: 'DEF', r_accuracy: 'SHT', r_jump: 'JMP', rf_pace: 'Pace', rf_power: 'Power', rf_control: 'Handling', rf_defense: 'Defense', rf_accuracy: 'Shooting', rf_jump: 'Jump', ratingsHint: 'Tap a player for details',
  again: 'Play again', share: 'Share', save: 'Save image', win: 'WINS!', draw: 'Draw', overtime: 'overtime',
  winText: '“{w}” wins!', drawText: 'Draw', mvp: 'MVP', shotClock: 'Shot clock',
  copied: 'Link copied', imageSaved: 'Image saved', challengeCopied: 'Challenge link copied', copyFailed: 'Couldn’t copy',
  challengeBanner: 'You’ve been challenged! Build your duo and TIP OFF!',
  reportTitle: 'Game report', reportNote: 'This is the actual result of the shared game.', watchReplay: 'Watch replay', replayNote: 'Re-simulated with the same seed (fonts on other devices can change how it plays out)', challengeMine: 'Challenge with my own duo', closeBtn: 'Close',
  sharePanel: 'Share', shareNative: 'Share via…', shareNativeImg: 'Share with image…', shareX: 'Post on X', shareLine: 'Send on LINE', shareBsky: 'Post on Bluesky',
  copyLink: 'Copy game link', saveCard: 'Save game image (PNG)', challengeLink: 'Challenge a friend with this lineup', shareHint: 'These buttons only open each site’s own post screen — you decide whether to post.',
  sharePost: 'Glyph Basketball: {a} {sa}-{sb} {b} → {res}', shareChallenge: 'Glyph Basketball: {a} VS {b} — can your duo win?', shareTag: '#GlyphBasketball',
  modeBasket: 'BASKETBALL · 2 VS 2', cardFooter: 'Play free at {site} · no sign-up', highlight: 'Best moment', mvpText: '“{p}” — {pts} pts · special “{move}”',
  w_score2: 'BUCKET!', w_score3: 'THREE!', w_dunk: 'SLAM DUNK!!', w_superDunk: 'SKY-HIGH SLAM!!!', w_airCrash: 'MID-AIR CRASH!', w_block: 'REJECTED!', w_steal: 'STOLEN!', w_rebound: 'BOARD!', w_miss: 'WHIFF',
  w_brawl: 'BRAWL!', w_ko: 'KO', w_shotClock: 'SHOT CLOCK!', w_lucky: 'LUCKY ROLL!', w_swish: 'SWISH!', w_airball: 'AIRBALL!', w_overtime: 'OVERTIME!',
  footer: 'Emoji: Twemoji (CC-BY 4.0) / Font: M PLUS Rounded 1c (OFL)', quality: 'Quality', high: 'High', low: 'Low', sound: 'Sound', on: 'On', off: 'Off',
};

/** What each special move does on the court (shown next to the move name). */
const SKILL_KIND: Record<'ja' | 'zh' | 'en', Record<SportSkillKind, string>> = {
  ja: { powerShot: 'パワーダンク', curveShot: 'スピンムーブ', beamShot: 'レーザーシュート', skyShot: 'スカイフック', dash: '突破ドライブ', blink: '瞬間移動', decoy: '分身フェイント', shockwave: '衝撃波', disable: '足止め', steal: 'ボール奪取', rain: '落下物攻撃', cloud: 'ガス地帯', wall: 'ゴール下の鉄壁', rally: 'チーム鼓舞' },
  zh: { powerShot: '暴力扣篮', curveShot: '转身突破', beamShot: '激光投篮', skyShot: '天钩高抛', dash: '强行突破', blink: '瞬移过人', decoy: '分身假动作', shockwave: '冲击波', disable: '定身控制', steal: '隔空抢断', rain: '天降道具', cloud: '毒气区域', wall: '篮下铁壁', rally: '全队鼓舞' },
  en: { powerShot: 'Power dunk', curveShot: 'Spin move', beamShot: 'Laser jumper', skyShot: 'Sky hook', dash: 'Bulldoze drive', blink: 'Blink past', decoy: 'Decoy clones', shockwave: 'Shockwave', disable: 'Stun', steal: 'Ball snatch', rain: 'Prop rain', cloud: 'Gas cloud', wall: 'Paint wall', rally: 'Team rally' },
};

const REPORT: Record<'ja' | 'zh' | 'en', Dict> = {
  ja: {
    dunk: '{min} 「{p}」のダンク！{assist}', three: '{min} 「{p}」のスリーポイント{assist}', basketSkill: '{min} 「{p}」の必殺「{move}」が決まった！{assist}', basketCombo: '{min} {team}のコンビ技「{combo}」で得点！', tip: '{min} 「{p}」のタップイン',
    assist: '（アシスト「{a}」）', blocks: '「{p}」が {n} 本ブロック', rebounds: '「{p}」が {n} リバウンド', steals: '「{p}」が {n} スティール', knocks: '「{p}」の必殺で {n} 人が吹っ飛んだ', combos: '{team}のコンビ技「{combo}」が {n} 回発動', overtime: '延長戦で決着！', buzzer: '{min} 「{p}」のブザービーター！', scoreless: '0-0、点の遠い一戦でした',
  },
  zh: {
    dunk: '{min} 「{p}」扣篮！{assist}', three: '{min} 「{p}」命中三分{assist}', basketSkill: '{min} 「{p}」的必杀「{move}」得分！{assist}', basketCombo: '{min} {team}的搭档技「{combo}」得分！', tip: '{min} 「{p}」补篮得分',
    assist: '（助攻「{a}」）', blocks: '「{p}」盖帽 {n} 次', rebounds: '「{p}」抢下 {n} 个篮板', steals: '「{p}」抢断 {n} 次', knocks: '「{p}」的必杀撞飞了 {n} 人', combos: '{team}的搭档技「{combo}」发动了 {n} 次', overtime: '加时赛决出胜负！', buzzer: '{min} 「{p}」压哨绝杀！', scoreless: '0:0，一场得分很难的比赛',
  },
  en: {
    dunk: '{min} “{p}” dunks it!{assist}', three: '{min} three by “{p}”{assist}', basketSkill: '{min} “{p}” scores with “{move}”!{assist}', basketCombo: '{min} {team} score with the duo move “{combo}”!', tip: '{min} tip-in by “{p}”',
    assist: ' (assist “{a}”)', blocks: '“{p}” blocked {n} shots', rebounds: '“{p}” grabbed {n} rebounds', steals: '“{p}” had {n} steals', knocks: '“{p}”’s special flattened {n} opponents', combos: '{team}’s duo move “{combo}” fired {n} times', overtime: 'Decided in overtime!', buzzer: '{min} buzzer-beater by “{p}”!', scoreless: '0-0 — points were hard to come by',
  },
};

const DICTS = { ja, zh, en };

function fill(s: string, p: Record<string, string | number | undefined>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));
}

export function t(key: string, p: Record<string, string | number | undefined> = {}): string {
  return fill(DICTS[getLang()][key] ?? DICTS.ja[key] ?? key, p);
}

export function skillKindName(k: SportSkillKind): string {
  return SKILL_KIND[getLang()][k];
}

export function reportText(key: string, p: Record<string, string | number | undefined>): string {
  return fill(REPORT[getLang()][key] ?? REPORT.ja[key] ?? key, p);
}

export function hasReportKey(key: string): boolean {
  return key in REPORT.ja;
}
