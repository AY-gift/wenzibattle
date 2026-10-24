/** Glyph Soccer UI strings (ja default, zh, en). Language state is shared with the other games. */
import { getLang } from '@shared/i18n';
import type { SportSkillKind } from '@shared/sports/skills';

export { describeFighter, getLang, initLang, LANGS, onLangChange, setLang, type Lang } from '@shared/i18n';

type Dict = Record<string, string>;

const ja: Dict = {
  title: 'グリフサッカー 4v4', tagline: '一文字が一人の選手。四文字でチーム結成、キックオフ！',
  home: 'ホーム', away: 'アウェイ', howSplit: '一発チーム', howFree: '自由編成',
  howSplitHint: '四字熟語や4文字の言葉を1文字ずつ選手に', howFreeHint: '1マス1人。「ママ」などの言葉もそのまま1人',
  splitPh: '例：竜飛鳳舞・ねこねこ', memberPh: '選手{n}', teamNamePh: 'チーム名（省略可）',
  errCount: '{n}文字です。ちょうど4文字にしてください（言葉のまま使うなら自由編成へ）', errEmpty: '文字を入れてください', errMember: '{n}人目が読めません',
  kickoff: 'キックオフ！', randomMatch: 'おまかせ対戦', combo: '連携', catalogLink: '📖 図鑑', cultureCombo: '文化連携', rivalry: '宿命の対決', noCombo: '特別な連携なし（通常の戦術で戦う）',
  pause: '一時停止', resume: '再開', restart: 'やり直し', change: 'チームを変える', speed: '倍速',
  again: 'もう一試合', share: 'シェア', save: '画像を保存', win: '勝利！', draw: '引き分け', goldenGoal: 'Vゴール',
  winText: '「{w}」の勝ち！', drawText: '引き分け', mvp: 'MVP', goalsTitle: 'ゴール', noGoals: 'ゴールなし',
  copied: 'リンクをコピーしました', imageSaved: '画像を保存しました', challengeCopied: '挑戦リンクをコピーしました', copyFailed: 'コピーできませんでした',
  challengeBanner: '挑戦状が届いた！ 自分のチームで「キックオフ！」',
  reportTitle: '試合レポート', reportNote: '共有された試合の実際の結果です。', watchReplay: 'リプレイを見る', replayNote: '同じシードで再シミュレーションします（端末のフォントで展開が変わることがあります）', challengeMine: '自分のチームで挑戦する', closeBtn: '閉じる',
  sharePanel: 'シェア', shareNative: 'アプリで共有…', shareNativeImg: '画像つきで共有…', shareX: 'X でポスト', shareLine: 'LINE で送る', shareBsky: 'Bluesky に投稿',
  copyLink: '試合リンクをコピー', saveCard: '試合画像を保存（PNG）', challengeLink: 'このカードで挑戦状を送る', shareHint: 'ボタンは各サービスの投稿画面を開くだけです。投稿するかどうかはあなたが決めます。',
  sharePost: '『グリフサッカー』{a} {sa}-{sb} {b} → {res}', shareChallenge: '『グリフサッカー』{a} VS {b} — あなたのチームで勝てる？', shareTag: '#グリフサッカー',
  modeSoccer: 'サッカー · 4 VS 4', cardFooter: '{site} で遊べる・登録不要', highlight: '名場面', mvpText: '「{p}」— {goals} ゴール・必殺「{move}」',
  w_goal: 'ゴーール！', w_save: 'ナイスセーブ！', w_post: 'カーン！', w_steal: '奪った！', w_lucky: '大吉！', w_block: 'ブロック！', w_ownGoal: 'オウンゴール！', w_bonus: '蛇足キック！', w_miss: 'スカッ', w_brawl: '大乱闘！', w_ko: 'KO',
  footer: 'Emoji: Twemoji (CC-BY 4.0) / Font: M PLUS Rounded 1c (OFL)', quality: '画質', high: '高', low: '低', sound: '音', on: 'ON', off: 'OFF',
};

const zh: Dict = {
  title: '字形足球 4v4', tagline: '一个字是一名球员。四个字组成球队，开球！',
  home: '主队', away: '客队', howSplit: '一键组队', howFree: '自由组队',
  howSplitHint: '输入成语或四个字，每个字是一名球员', howFreeHint: '一个格子一名球员，「妈妈」这样的词也是一个人',
  splitPh: '例：龙飞凤舞', memberPh: '球员{n}', teamNamePh: '队名（可不填）',
  errCount: '现在是 {n} 个字，请输入正好 4 个字（想保留整词请用自由组队）', errEmpty: '请输入文字', errMember: '第 {n} 名球员无法识别',
  kickoff: '开球！', randomMatch: '随机对战', combo: '连携', catalogLink: '📖 图鉴', cultureCombo: '文化连携', rivalry: '宿敌对决', noCombo: '无特殊连携（普通战术）',
  pause: '暂停', resume: '继续', restart: '重新开始', change: '换队伍', speed: '倍速',
  again: '再来一场', share: '分享', save: '保存图片', win: '胜利！', draw: '平局', goldenGoal: '金球',
  winText: '「{w}」获胜！', drawText: '平局', mvp: 'MVP', goalsTitle: '进球', noGoals: '没有进球',
  copied: '链接已复制', imageSaved: '图片已保存', challengeCopied: '挑战链接已复制', copyFailed: '复制失败',
  challengeBanner: '收到挑战书！组好你的队，点「开球！」',
  reportTitle: '战报', reportNote: '这是分享者那一场的真实结果。', watchReplay: '看重播', replayNote: '用同一种子重新模拟（不同设备的字体可能让过程略有不同）', challengeMine: '用自己的队来挑战', closeBtn: '关闭',
  sharePanel: '分享', shareNative: '系统分享…', shareNativeImg: '带图片分享…', shareX: '分享到 X', shareLine: '分享到 LINE', shareBsky: '分享到 Bluesky',
  copyLink: '复制战报链接', saveCard: '保存战报 PNG', challengeLink: '挑战这个阵容（复制挑战链接）', shareHint: '按钮只会打开对应平台的发帖页面，发不发由你决定。',
  sharePost: '《字形足球》{a} {sa}:{sb} {b} → {res}', shareChallenge: '《字形足球》{a} VS {b} —— 你的队能赢吗？', shareTag: '#字形足球',
  modeSoccer: '足球 · 4 VS 4', cardFooter: '在 {site} 免费玩 · 无需注册', highlight: '本场名场面', mvpText: '「{p}」— {goals} 球 · 必杀「{move}」',
  w_goal: '进球！！', w_save: '神扑救！', w_post: '哐！', w_steal: '抢断！', w_lucky: '大吉大利！', w_block: '封堵！', w_ownGoal: '乌龙球！', w_bonus: '多此一脚！', w_miss: '打空了', w_brawl: '大乱斗！', w_ko: 'KO',
  footer: 'Emoji: Twemoji (CC-BY 4.0) / Font: M PLUS Rounded 1c (OFL)', quality: '画质', high: '高', low: '低', sound: '声音', on: '开', off: '关',
};

const en: Dict = {
  title: 'Glyph Soccer 4v4', tagline: 'One glyph, one player. Four glyphs make a team — kick off!',
  home: 'Home', away: 'Away', howSplit: 'One word', howFree: 'Pick 4',
  howSplitHint: 'An idiom or 4-character word: one player per character', howFreeHint: 'One box, one player — words like “mom” stay whole',
  splitPh: 'e.g. 龙飞凤舞', memberPh: 'Player {n}', teamNamePh: 'Team name (optional)',
  errCount: '{n} characters — need exactly 4 (use Pick 4 to keep whole words)', errEmpty: 'Type something', errMember: 'Player {n} can’t be read',
  kickoff: 'KICK OFF!', randomMatch: 'Random match', combo: 'Combo', catalogLink: '📖 Catalog', cultureCombo: 'Culture combo', rivalry: 'Rivalry', noCombo: 'No special combo (normal tactics)',
  pause: 'Pause', resume: 'Resume', restart: 'Restart', change: 'Change teams', speed: 'Speed',
  again: 'Play again', share: 'Share', save: 'Save image', win: 'WINS!', draw: 'Draw', goldenGoal: 'golden goal',
  winText: '“{w}” wins!', drawText: 'Draw', mvp: 'MVP', goalsTitle: 'Goals', noGoals: 'No goals',
  copied: 'Link copied', imageSaved: 'Image saved', challengeCopied: 'Challenge link copied', copyFailed: 'Couldn’t copy',
  challengeBanner: 'You’ve been challenged! Build your team and KICK OFF!',
  reportTitle: 'Match report', reportNote: 'This is the actual result of the shared match.', watchReplay: 'Watch replay', replayNote: 'Re-simulated with the same seed (fonts on other devices can change how it plays out)', challengeMine: 'Challenge with my own team', closeBtn: 'Close',
  sharePanel: 'Share', shareNative: 'Share via…', shareNativeImg: 'Share with image…', shareX: 'Post on X', shareLine: 'Send on LINE', shareBsky: 'Post on Bluesky',
  copyLink: 'Copy match link', saveCard: 'Save match image (PNG)', challengeLink: 'Challenge a friend with this lineup', shareHint: 'These buttons only open each site’s own post screen — you decide whether to post.',
  sharePost: 'Glyph Soccer: {a} {sa}-{sb} {b} → {res}', shareChallenge: 'Glyph Soccer: {a} VS {b} — can your team win?', shareTag: '#GlyphSoccer',
  modeSoccer: 'SOCCER · 4 VS 4', cardFooter: 'Play free at {site} · no sign-up', highlight: 'Best moment', mvpText: '“{p}” — {goals} goals · special “{move}”',
  w_goal: 'GOOOAL!', w_save: 'SAVE!', w_post: 'CLANG!', w_steal: 'STOLEN!', w_lucky: 'LUCKY!', w_block: 'BLOCKED!', w_ownGoal: 'OWN GOAL!', w_bonus: 'ONE MORE KICK!', w_miss: 'WHIFF', w_brawl: 'BRAWL!', w_ko: 'KO',
  footer: 'Emoji: Twemoji (CC-BY 4.0) / Font: M PLUS Rounded 1c (OFL)', quality: 'Quality', high: 'High', low: 'Low', sound: 'Sound', on: 'On', off: 'Off',
};

/** What each special move does on the pitch (shown next to the move name). */
const SKILL_KIND: Record<'ja' | 'zh' | 'en', Record<SportSkillKind, string>> = {
  ja: { powerShot: '剛速シュート', curveShot: 'カーブシュート', beamShot: 'ビームシュート', skyShot: '天空シュート', dash: '突破ドリブル', blink: '瞬間移動', decoy: '分身フェイント', shockwave: '衝撃波', disable: '足止め', steal: 'ボール奪取', rain: '落下物攻撃', cloud: 'ガス地帯', wall: '鉄壁ブロック', rally: 'チーム鼓舞' },
  zh: { powerShot: '强力射门', curveShot: '弧线射门', beamShot: '光线射门', skyShot: '天降射门', dash: '强行突破', blink: '瞬移过人', decoy: '分身假动作', shockwave: '冲击波', disable: '定身控制', steal: '隔空夺球', rain: '天降道具', cloud: '毒气区域', wall: '铁壁防守', rally: '全队鼓舞' },
  en: { powerShot: 'Power shot', curveShot: 'Curling shot', beamShot: 'Beam shot', skyShot: 'Sky shot', dash: 'Bulldoze dribble', blink: 'Blink past', decoy: 'Decoy clones', shockwave: 'Shockwave', disable: 'Stun', steal: 'Ball snatch', rain: 'Prop rain', cloud: 'Gas cloud', wall: 'Iron wall', rally: 'Team rally' },
};

/** Report lines. */
const REPORT: Record<'ja' | 'zh' | 'en', Dict> = {
  ja: {
    goal: '{min} 「{p}」のゴール{assist}', goalSkill: '{min} 「{p}」の必殺「{move}」が決まった！{assist}', goalCombo: '{min} {team}の連携「{combo}」でゴール！', goalOwn: '{min} 「{p}」のオウンゴール…', goalBonus: '{min} 「{p}」の蛇足キックがまさかのゴール！',
    assist: '（アシスト「{a}」）', saves: '「{p}」が {n} 本のシュートを止めた', knocks: '「{p}」の必殺で {n} 人が吹っ飛んだ', combos: '{team}の連携「{combo}」が {n} 回発動', golden: 'Vゴールで決着！', scoreless: '0-0、ゴールの遠い一戦でした', steals: '「{p}」が {n} 回ボールを奪った',
  },
  zh: {
    goal: '{min} 「{p}」进球{assist}', goalSkill: '{min} 「{p}」的必杀「{move}」破门！{assist}', goalCombo: '{min} {team}的连携「{combo}」破门！', goalOwn: '{min} 「{p}」乌龙球……', goalBonus: '{min} 「{p}」多补的一脚居然进了！',
    assist: '（助攻「{a}」）', saves: '「{p}」扑出了 {n} 次射门', knocks: '「{p}」的必杀撞飞了 {n} 人', combos: '{team}的连携「{combo}」发动了 {n} 次', golden: '金球决胜！', scoreless: '0:0，一场进球很难的比赛', steals: '「{p}」抢断 {n} 次',
  },
  en: {
    goal: '{min} goal by “{p}”{assist}', goalSkill: '{min} “{p}” scores with “{move}”!{assist}', goalCombo: '{min} {team} score with the combo “{combo}”!', goalOwn: '{min} own goal by “{p}”…', goalBonus: '{min} “{p}”’s bonus kick somehow goes in!',
    assist: ' (assist “{a}”)', saves: '“{p}” saved {n} shots', knocks: '“{p}”’s special flattened {n} opponents', combos: '{team}’s combo “{combo}” fired {n} times', golden: 'Decided by a golden goal!', scoreless: '0-0 — goals were hard to come by', steals: '“{p}” won the ball {n} times',
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
  return Object.prototype.hasOwnProperty.call(REPORT.ja, key);
}
