/**
 * Generates docs/skills/{中文,日本語,English,其他}/README.md from the move & behaviour tables,
 * so the documentation always matches the code.  Run:  npm run docs:skills
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { IDEAS } from './skill-ideas.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { MOVE_TABLE, SHAPE_MOVES, keyLanguages, resolveSignature } = await server.ssrLoadModule('/src/core/SignatureMoves.ts');
const { processInput } = await server.ssrLoadModule('/src/core/InputProcessor.ts');
const { BEHAVIOR_RULES } = await server.ssrLoadModule('/src/core/BehaviorResolver.ts');
const { BEHAVIOR_TEXT, ELEMENT_TEXT } = await server.ssrLoadModule('/src/i18n/index.ts');
await server.close();

const FOLDERS = { zh: '中文', ja: '日本語', en: 'English', other: '其他' };
/** Language each document is written in ('other' is written in Chinese). */
const DOC_LANG = { zh: 'zh', ja: 'ja', en: 'en', other: 'zh' };

const KIND = {
  zh: {
    barrage: '连打：贴身快速连击，最后一下重击', uppercut: '上勾拳：把对手打飞到空中', quake: '震地：跳起砸地，冲击波把对手震倒',
    beam: '光线：远距离直线光束', whirlwind: '旋风：高速旋转，把对手吸过来连续命中', charge: '冲撞：蓄力后的超强冲锋',
    giant: '巨大化：4.5 秒内变成 1.45 倍大，更重、打得更疼', freeze: '冰冻：把对手冻住 1.7 秒', heal: '回复：回复 18 点体力',
    meteor: '陨石：从天上砸下 4 颗陨石', kick: '飞踢：跳起飞踢，横穿半个擂台', throw: '投技：抓住对手过肩摔到身后',
    shield: '护盾：1.6 秒无敌，并把攻击反弹回去', roar: '咆哮：前方扇形震慑，击退并眩晕', magnet: '吸引：把对手吸过来再重击',
    poison: '毒雾：4 秒持续掉血', bribe: '撒钱：对手停下来捡钱 1.8 秒', lecture: '催眠：让对手睡着 1.8 秒',
    chomp: '咬：一口咬住对手，并回复 5 点体力', joke: '冷笑话：对手笑到摔倒', confuse: '降智：对手晕头转向 2.2 秒，乱走并对着空气出拳',
    sweep: '横扫：身体伸长成一根棍子横扫全场，之后自己转晕', giantFall: '巨大倒地：变得巨大，站不稳后整个倒向对手', swallow: '吞噬：把对手吞进去，嚼一会儿再像炮弹一样吐出',
    mountain: '泰山压顶：跳向对手，在空中变大后砸下，产生冲击波', fireCharge: '火焰冲撞：全身着火冲撞（附加灼烧），结束后自己被熏黑', laughQuake: '笑震：狂笑引发 4 次震动，双方都可能站不稳',
    lazy: '躺平防御：直接躺倒，期间受到的攻击全部反弹', feint: '假动作：引诱对手冲过来，再闪到一边让它扑空', fishSlap: '鱼拍：召唤大鱼左右抽打，最后一下把对手抽飞',
    blame: '甩锅：接下来受到的一次伤害有 60% 反弹给对手', drop: '道具砸落：道具从天而降（或被扔出去）砸中对手', vanish: '消失突袭：消失约 1 秒，再从对手背后出现偷袭',
    topple: '倒地压制：颤抖后整个身体向前倒下压住对手', random: '随机：每次随机变成另一种必杀技', glare: '凝视：眼睛射出红光，把对手定住约 1.3 秒', rage: '连续暴冲：连续三次加速冲撞', clones: '分身：三个缩小版的自己包围对手挤来挤去，最后把它挤飞',
  },
  ja: {
    barrage: '連打：至近距離の高速ラッシュ、最後に重い一撃', uppercut: 'アッパー：相手を空中へ打ち上げる', quake: '地震：跳んで着地、衝撃波で相手をダウン',
    beam: 'ビーム：遠距離まで届く直線光線', whirlwind: '竜巻：高速回転で相手を吸い寄せて連続ヒット', charge: '突進：溜めてから超強力タックル',
    giant: '巨大化：4.5 秒間 1.45 倍の大きさに。重く、攻撃も強く', freeze: '冷凍：相手を 1.7 秒凍らせる', heal: '回復：体力を 18 回復',
    meteor: '隕石：空から隕石が 4 発落ちてくる', kick: '飛び蹴り：リングの半分を飛ぶキック', throw: '投げ：相手をつかんで背負い投げ',
    shield: 'バリア：1.6 秒無敵、攻撃を跳ね返す', roar: '咆哮：前方に衝撃、吹き飛ばして気絶させる', magnet: '引力：相手を引き寄せて強打',
    poison: '毒：4 秒間じわじわダメージ', bribe: 'ばらまき：相手が 1.8 秒お金を拾いに行く', lecture: '催眠：相手を 1.8 秒眠らせる',
    chomp: 'かみつき：大きくかじって体力を 5 回復', joke: 'ダジャレ：相手が笑い転げる', confuse: '知能低下：相手が 2.2 秒ふらふら、空気を殴る',
    sweep: 'なぎ払い：棒のように伸びて全体をなぎ払い、自分も目を回す', giantFall: '巨大転倒：巨大化して立っていられず相手の上に倒れ込む', swallow: '丸のみ：相手を飲み込み、砲弾のように吐き出す',
    mountain: '泰山圧頂：相手に飛びかかり空中で巨大化して落下、衝撃波', fireCharge: '炎上突進：全身炎上で突進（延焼ダメージ）、最後は自分が真っ黒', laughQuake: '爆笑地震：笑いで 4 回揺れ、双方ともよろける',
    lazy: '寝そべり防御：寝転がり、その間の攻撃をすべて跳ね返す', feint: 'フェイント：相手に突進させ、横によけて空振りさせる', fishSlap: '魚ビンタ：巨大魚で左右ビンタ、最後に吹っ飛ばす',
    blame: '責任転嫁：次に受けるダメージの 60％ を相手に返す', drop: '落下物：アイテムが空から落ちる（または投げる）', vanish: '消失奇襲：約 1 秒消えて相手の背後から攻撃',
    topple: '倒れ込み：震えたあと前に倒れて相手を押しつぶす', random: 'ランダム：毎回別の必殺技になる', glare: '凝視：赤い目線で相手を約 1.3 秒固める', rage: '連続突進：3 回連続で加速突進', clones: '分身：小さな自分 3 体で囲んでもみくちゃにし、最後に押し出す',
  },
  en: {
    barrage: 'Barrage: close-range rapid punches with a heavy finisher', uppercut: 'Uppercut: launches the opponent into the air', quake: 'Quake: jump and slam; the shockwave knocks the opponent down',
    beam: 'Beam: long-range straight laser', whirlwind: 'Whirlwind: spins, pulls the opponent in and hits repeatedly', charge: 'Charge: a wound-up super tackle',
    giant: 'Giant: grows 1.45× for 4.5 s — heavier and hits harder', freeze: 'Freeze: freezes the opponent for 1.7 s', heal: 'Heal: recovers 18 HP',
    meteor: 'Meteor: four meteors fall from the sky', kick: 'Flying kick: crosses half the ring', throw: 'Throw: grabs and shoulder-throws the opponent behind',
    shield: 'Shield: 1.6 s of invulnerability that bounces attacks back', roar: 'Roar: frontal blast that pushes back and stuns', magnet: 'Magnet: pulls the opponent in, then a big hit',
    poison: 'Poison: damage over 4 s', bribe: 'Bribe: the opponent stops for 1.8 s to pick up money', lecture: 'Lullaby: puts the opponent to sleep for 1.8 s',
    chomp: 'Chomp: big bite that also heals 5 HP', joke: 'Joke: the opponent laughs until it falls over', confuse: 'Confuse: the opponent stumbles around punching air for 2.2 s',
    sweep: 'Sweep: stretches into a long bar and sweeps the ring, then gets dizzy', giantFall: 'Giant fall: grows huge, wobbles and topples onto the opponent', swallow: 'Swallow: gulps the opponent, chews, spits it out like a cannonball',
    mountain: 'Mountain drop: leaps, grows mid-air and slams down with a shockwave', fireCharge: 'Fire charge: bursts into flames and charges (extra burn), ends up sooty', laughQuake: 'Laugh quake: four laughing tremors that rattle both fighters',
    lazy: 'Lazy: lies down; every attack meanwhile bounces off', feint: 'Feint: baits the opponent into charging, then sidesteps', fishSlap: 'Fish slap: a giant fish slaps left-right, then a launcher',
    blame: 'Blame: 60% of the next damage taken goes back to the attacker', drop: 'Prop drop: a prop falls from the sky (or is thrown) onto the opponent', vanish: 'Vanish: disappears for ~1 s, reappears behind the opponent',
    topple: 'Topple: trembles, then falls flat onto the opponent', random: 'Random: turns into a different move each time', glare: 'Glare: red eye beam that freezes the opponent ~1.3 s', rage: 'Rage: three charges in a row, each faster', clones: 'Clones: three mini copies surround the opponent, jostle it, then shove it away',
  },
};

const T = {
  zh: {
    title: '必杀技与特殊能力一览', intro: '输入的文字里只要包含下表中的字或词，就会获得对应的必杀技或被动特性。',
    rules: [
      '单个字（汉字、假名、符号、Emoji）出现在输入的任何位置都会生效；词语按“包含”匹配，英文词只按完整单词匹配（例如 `sb` 不会命中 `sbox`）。',
      '同时命中多个时，取**最靠前**的那个；位置相同时取**最长的词**（例如 牛逼 优先于 牛，草泥马 优先于 草）。',
      '每个角色只有一个必杀技，每场最多用两次；被动特性最多叠加 3 个。',
      '表里没有的字也有必杀技：按字形属性中最强的一项自动分配（见文末）。',
    ],
    slang: '网络梗 / 特殊词汇', chars: '常用字', other: 'Emoji / 符号', behaviors: '被动特性（自动生效）', shape: '没有命中任何词时（按字形分配）',
    cols: ['字 / 词', '必杀技', '效果'], bcols: ['字 / 词', '特性', '属性'], scols: ['条件', '必杀技', '效果'],
    shapeCond: { weight: '重量 ≥ 85', attack: '攻击最高', speed: '速度最高', defense: '防御最高', stability: '稳定最高' },
    gen: '本文件由 `npm run docs:skills` 自动生成，请勿手动修改。', none: '—',
  },
  ja: {
    title: '必殺技・特殊能力一覧', intro: '入力した文字に下の表の文字や単語が含まれていると、その必殺技やパッシブ特性が付きます。',
    rules: [
      '1文字（漢字・かな・記号・絵文字）は入力のどこにあっても有効。単語は「含まれていれば」有効で、英単語は単語単位でのみ一致します。',
      '複数一致した場合は**一番前**のもの、同じ位置なら**一番長い単語**が優先されます。',
      '必殺技は1キャラ1つ、1試合2回まで。パッシブ特性は最大3つまで。',
      '表にない文字も、字形のいちばん高い能力値から必殺技が決まります（最後の表）。',
    ],
    slang: 'ネットスラング・特別な言葉', chars: 'よく使う漢字・かな', other: '絵文字・記号', behaviors: 'パッシブ特性（自動で発動）', shape: 'どれにも一致しない場合（字形で決定）',
    cols: ['文字 / 単語', '必殺技', '効果'], bcols: ['文字 / 単語', '特性', '属性'], scols: ['条件', '必殺技', '効果'],
    shapeCond: { weight: '重さ ≥ 85', attack: '攻撃が最高', speed: '速さが最高', defense: '防御が最高', stability: '安定が最高' },
    gen: 'このファイルは `npm run docs:skills` で自動生成されています。手で編集しないでください。', none: '—',
  },
  en: {
    title: 'Signature moves & special abilities', intro: 'If your input contains any character or word below, the fighter gets that signature move or passive trait.',
    rules: [
      'Single characters (letters, kana, kanji, symbols, emoji) work anywhere in the input. Words match when contained; English words only match as whole words (`sb` does not match `sbox`).',
      'With several matches, the **earliest** wins; at the same position the **longest word** wins.',
      'One signature move per fighter, used at most twice per match; up to 3 passive traits.',
      'Anything not listed still gets a move, picked from its strongest shape stat (table at the end).',
    ],
    slang: 'Slang & memes', chars: 'Common words', other: 'Emoji & symbols', behaviors: 'Passive traits (always on)', shape: 'No match (picked from shape)',
    cols: ['Text', 'Signature move', 'Effect'], bcols: ['Text', 'Trait', 'Element'], scols: ['Condition', 'Signature move', 'Effect'],
    shapeCond: { weight: 'Weight ≥ 85', attack: 'Attack highest', speed: 'Speed highest', defense: 'Defense highest', stability: 'Stability highest' },
    gen: 'Generated by `npm run docs:skills` — do not edit by hand.', none: '—',
  },
};

const STATUS = {
  zh: { impl: '✅ 已实现·已测试', approx: '🟡 近似实现·已测试', kept: '⏸ 候选（保留现有技能）', engine: '🔧 需要新底层效果' },
  ja: { impl: '✅ 実装済み・テスト済み', approx: '🟡 近似実装・テスト済み', kept: '⏸ 候補（既存の技を維持）', engine: '🔧 新しい基盤効果が必要' },
  en: { impl: '✅ Implemented & tested', approx: '🟡 Approximated & tested', kept: '⏸ Candidate (existing move kept)', engine: '🔧 Needs new engine effect' },
};
const IDEA_TEXT = {
  zh: { title: '设计清单对照', intro: '下表逐行对照《特殊文字攻击与必杀技设计清单》。“普通攻击”一列目前都是候选创意：普通攻击仍由字形属性和被动特性决定。“已测试”指单元测试覆盖了文字→招式的映射，并且该招式类型在真实对战中触发过。', cols: ['', '字 / 词', '普通攻击（候选）', '设计中的必杀技', '状态', '游戏中当前的必杀技 / 说明'], now: '当前' },
  ja: { title: '設計リストとの対照', intro: '「特殊文字攻撃と必殺技デザインリスト」を一行ずつ対照しています。「通常攻撃」列はすべて候補です（通常攻撃は今も字形の能力値とパッシブ特性で決まります）。「テスト済み」は、文字→技の対応と、その技タイプが実際の試合で発動することを単体テストで確認済みという意味です。', cols: ['', '文字 / 単語', '通常攻撃（候補）', '設計上の必殺技', '状態', '現在のゲーム内の必殺技 / 説明'], now: '現在' },
  en: { title: 'Design list status', intro: 'Row-by-row status of the design list. The normal-attack column is a candidate everywhere: normal attacks are still driven by shape stats and passive traits. “Tested” means unit tests cover the text→move mapping and the move kind firing in real battles.', cols: ['', 'Text', 'Normal attack (candidate)', 'Designed ultimate', 'Status', 'Current in-game move / notes'], now: 'Now' },
};

function ideaSection(folder) {
  const L = DOC_LANG[folder];
  const t = IDEA_TEXT[L];
  const out = ['', `## ${t.title}`, '', t.intro];
  const counts = { impl: 0, approx: 0, kept: 0, engine: 0 };
  for (const group of IDEAS[folder]) {
    out.push('', `### ${group.section}`, '', `| ${t.cols.join(' | ')} |`, `| ${t.cols.map(() => '---').join(' | ')} |`);
    for (const r of group.rows) {
      const p = processInput(r.key);
      if (!p.ok) throw new Error(`idea key not processable: ${r.key}`);
      const sig = resolveSignature(p.text, p.graphemes, { weight: 50, speed: 50, attack: 50, defense: 50, stability: 50, luck: 50 });
      const kindLabel = KIND[L][sig.kind].split(/[：:]/)[0];
      const current = `**${esc(moveName(sig.name, folder))}**（${esc(kindLabel)}）`;
      if ((r.status === 'impl' || r.status === 'approx') && !sig.key) throw new Error(`"${r.key}" is marked ${r.status} but has no move in MOVE_TABLE`);
      if (r.status === 'impl' && ![sig.name.zh, sig.name.ja, sig.name.en].includes(r.ult)) throw new Error(`"${r.key}" is marked impl but resolves to ${sig.name.zh}, not ${r.ult}`);
      counts[r.status]++;
      const note = r.status === 'impl' ? current : r.status === 'approx' ? `${current} — ${esc(r.how)}` : r.status === 'engine' ? `${esc(r.how)}（${t.now}：${current}）` : current;
      out.push(`| ${r.star ? '★' : ''} | ${esc(code(r.key))} | ${esc(r.normal)} | ${esc(r.ult)} | ${STATUS[L][r.status]} | ${note} |`);
    }
  }
  out.splice(4, 0, '', Object.entries(counts).map(([k, n]) => `${STATUS[L][k]}: ${n}`).join(' · '));
  return out;
}


// ---------------------------------------------------------------- daily vocabulary pack
// Source: docs/design/daily-vocab/<folder>.md (the design candidates, kept unchanged).
// Every row's status is derived from the real move table.
const REMOVED = new Set(['包子']); // removed as politically sensitive (see README)
const DAILY_TEXT = {
  zh: {
    title: '日常高频词扩展包', src: '设计来源：`docs/design/daily-vocab/`。状态由代码自动判断：优先级 S 的条目已全部接入（冲突项保留原技能）；A / B 为候选。',
    cols: ['优先级', '输入', '平时怎么打（设计）', '平时（游戏中）', '设计必杀技', '状态', '游戏中当前的必杀技'],
    st: { impl: '🟡 已实现（复用现有动作 + 道具）·已测试', kept: '⏸ 已有其他技能（保留）', cand: '📋 候选（未实现）', removed: '🚫 已移除（政治敏感词）' },
    normalCand: '📋 候选', normalVia: '被动特性：',
  },
  ja: {
    title: '日常よく使う言葉パック', src: '設計元：`docs/design/daily-vocab/`。状態はコードから自動判定。優先度 S はすべて実装済み（衝突したものは既存の技を維持）、A / B は候補です。',
    cols: ['優先度', '入力', '通常攻撃（設計）', '通常（ゲーム内）', '設計上の必殺技', '状態', '現在の必殺技'],
    st: { impl: '🟡 実装済み（既存動作＋小道具を流用）・テスト済み', kept: '⏸ 別の技あり（維持）', cand: '📋 候補（未実装）', removed: '🚫 削除（政治的にセンシティブ）' },
    normalCand: '📋 候補', normalVia: 'パッシブ：',
  },
  en: {
    title: 'Daily vocabulary pack', src: 'Source: `docs/design/daily-vocab/`. Status is derived from the code: every priority-S row is implemented (collisions keep their existing move); A / B are candidates.',
    cols: ['Priority', 'Input', 'Normal attack (design)', 'Normal (in game)', 'Designed ultimate', 'Status', 'Current in-game move'],
    st: { impl: '🟡 Implemented (existing actions + props) & tested', kept: '⏸ Has another move (kept)', cand: '📋 Candidate (not implemented)', removed: '🚫 Removed (politically sensitive)' },
    normalCand: '📋 Candidate', normalVia: 'Passive: ',
  },
};

function parseDesign(folder) {
  const md = readFileSync(join(root, 'docs', 'design', 'daily-vocab', `${FOLDERS[folder]}.md`), 'utf8');
  const groups = [];
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+)/);
    if (h && !/^规则$/.test(h[1].trim())) {
      cur = { section: h[1].trim(), rows: [] };
      groups.push(cur);
      continue;
    }
    if (!cur || !line.startsWith('|') || /^\|\s*(输入|---)/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    cur.rows.push({ key: cells[0], normal: cells[1], ult: cells[2], show: cells[3], prio: cells[4] });
  }
  return groups.filter((g) => g.rows.length);
}

function dailySection(folder) {
  const L = DOC_LANG[folder];
  const t = DAILY_TEXT[L];
  const out = ['', `## ${t.title}`, '', t.src];
  const counts = { impl: 0, kept: 0, cand: 0, removed: 0 };
  for (const g of parseDesign(folder)) {
    out.push('', `### ${g.section}`, '', `| ${t.cols.join(' | ')} |`, `| ${t.cols.map(() => '---').join(' | ')} |`);
    for (const r of g.rows) {
      const p = processInput(r.key);
      if (!p.ok) throw new Error(`daily key not processable: ${r.key}`);
      const sig = resolveSignature(p.text, p.graphemes, { weight: 50, speed: 50, attack: 50, defense: 50, stability: 50, luck: 50 });
      const named = [sig.name.zh, sig.name.ja, sig.name.en].includes(r.ult);
      const status = REMOVED.has(r.key) ? 'removed' : sig.key && named ? 'impl' : sig.key ? 'kept' : 'cand';
      if (r.prio === 'S' && status === 'cand') throw new Error(`priority-S row "${r.key}" (${r.ult}) is not implemented`);
      counts[status]++;
      const kindLabel = KIND[L][sig.kind].split(/[：:]/)[0];
      const prop = sig.opts?.prop ?? sig.opts?.props?.join('');
      const current = status === 'removed' ? '—' : sig.key ? `**${esc(moveName(sig.name, folder))}**（${esc(kindLabel)}${prop ? ` · ${esc(prop)}` : ''}）` : '—';
      const normal = status === 'impl' && sig.normal?.length ? `${t.normalVia}${sig.normal.map((x) => BEHAVIOR_TEXT[L][x]).join(L === 'en' ? ', ' : '、')}` : t.normalCand;
      out.push(`| ${r.prio} | ${esc(code(r.key))} | ${esc(r.normal)} | ${esc(normal)} | ${esc(r.ult)} | ${t.st[status]} | ${current} |`);
    }
  }
  out.splice(4, 0, '', Object.entries(counts).map(([k, n]) => `${t.st[k]}: ${n}`).join(' · '));
  return out;
}


// ---------------------------------------------------------------- high-frequency inputs V2
// Source: docs/design/daily-vocab-v2/<folder>.md (kept unchanged). No priority column; the
// status of every row is derived from the real move table.
const V2_TEXT = {
  zh: {
    title: '高频输入扩展包 V2', src: '设计来源：`docs/design/daily-vocab-v2/`。状态由代码自动判断；与已有技能重复的输入保留原技能。',
    cols: ['输入', '平时怎么打（设计）', '平时（游戏中）', '设计必杀技', '状态', '游戏中当前的必杀技'],
    st: { impl: '🟡 已实现（复用现有动作 + 道具）·已测试', kept: '⏸ 已有其他技能（保留）', cand: '📋 候选（未实现）' },
    via: '（目前由「{k}」触发）',
  },
  ja: {
    title: '高頻度入力パック V2', src: '設計元：`docs/design/daily-vocab-v2/`。状態はコードから自動判定。既存の技と重複する入力は既存の技を維持します。',
    cols: ['入力', '通常攻撃（設計）', '通常（ゲーム内）', '設計上の必殺技', '状態', '現在の必殺技'],
    st: { impl: '🟡 実装済み（既存動作＋小道具を流用）・テスト済み', kept: '⏸ 別の技あり（維持）', cand: '📋 候補（未実装）' },
    via: '（現在は「{k}」で発動）',
  },
  en: {
    title: 'High-frequency inputs pack V2', src: 'Source: `docs/design/daily-vocab-v2/`. Status is derived from the code; inputs that already had a move keep it.',
    cols: ['Input', 'Normal attack (design)', 'Normal (in game)', 'Designed ultimate', 'Status', 'Current in-game move'],
    st: { impl: '🟡 Implemented (existing actions + props) & tested', kept: '⏸ Has another move (kept)', cand: '📋 Candidate (not implemented)' },
    via: ' (currently triggered by “{k}”)',
  },
};

function parseV2(folder) {
  const md = readFileSync(join(root, 'docs', 'design', 'daily-vocab-v2', `${FOLDERS[folder]}.md`), 'utf8');
  const rows = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith('|') || /^\|\s*(输入|---)/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 3) rows.push({ key: cells[0], normal: cells[1], ult: cells[2] });
  }
  return rows;
}

function v2Section(folder) {
  const L = DOC_LANG[folder];
  const t = V2_TEXT[L];
  const D = DAILY_TEXT[L];
  const out = ['', `## ${t.title}`, '', t.src, '', `| ${t.cols.join(' | ')} |`, `| ${t.cols.map(() => '---').join(' | ')} |`];
  const counts = { impl: 0, kept: 0, cand: 0 };
  for (const r of parseV2(folder)) {
    const p = processInput(r.key);
    if (!p.ok) throw new Error(`V2 key not processable: ${r.key}`);
    const sig = resolveSignature(p.text, p.graphemes, { weight: 50, speed: 50, attack: 50, defense: 50, stability: 50, luck: 50 });
    const whole = sig.key && sig.key.toLowerCase() === p.text.toLowerCase();
    const named = [sig.name.zh, sig.name.ja, sig.name.en].includes(r.ult);
    const status = whole && named ? 'impl' : whole ? 'kept' : 'cand';
    counts[status]++;
    const kindLabel = KIND[L][sig.kind].split(/[：:]/)[0];
    const prop = sig.opts?.prop ?? sig.opts?.props?.join('');
    let current = sig.key ? `**${esc(moveName(sig.name, folder))}**（${esc(kindLabel)}${prop ? ` · ${esc(prop)}` : ''}）` : '—';
    if (sig.key && !whole) current += esc(t.via.replace('{k}', sig.key));
    const normal = status === 'impl' && sig.normal?.length ? `${D.normalVia}${sig.normal.map((x) => BEHAVIOR_TEXT[L][x]).join(L === 'en' ? ', ' : '、')}` : D.normalCand;
    out.push(`| ${esc(code(r.key))} | ${esc(r.normal)} | ${esc(normal)} | ${esc(r.ult)} | ${t.st[status]} | ${current} |`);
  }
  out.splice(4, 0, Object.entries(counts).map(([k, n]) => `${t.st[k]}: ${n}`).join(' · '), '');
  return out;
}

const esc = (s) => String(s).replace(/\|/g, '\\|');
const code = (k) => (/^[\x20-\x7e]+$/.test(k) ? '`' + k + '`' : k);

function moveName(name, folder) {
  if (folder === 'other') return `${name.zh}（${name.ja} / ${name.en}）`;
  return name[DOC_LANG[folder]];
}

function buildDoc(folder) {
  const L = DOC_LANG[folder];
  const t = T[L];
  const out = [`# ${t.title} — ${FOLDERS[folder]}`, '', `> ${t.gen}`, '', t.intro, ''];
  for (const r of t.rules) out.push(`- ${r}`);
  out.push(...ideaSection(folder));
  out.push(...dailySection(folder));
  out.push(...v2Section(folder));
  const rows = { slang: [], chars: [] };
  let count = 0;
  for (const e of MOVE_TABLE) {
    const keys = e.keys.filter((k) => keyLanguages(k, e.lang).includes(folder));
    if (!keys.length) continue;
    count += keys.length;
    const row = `| ${keys.map((k) => esc(code(k))).join(' ')} | **${esc(moveName(e.name, folder))}**${e.star ? ' ★' : ''} | ${esc(KIND[L][e.kind])} |`;
    (e.lang && folder !== 'other' ? rows.slang : rows.chars).push(row);
  }
  const header = (cols) => [`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`];
  if (rows.slang.length) out.push('', `## ${t.slang}`, '', ...header(t.cols), ...rows.slang);
  if (rows.chars.length) out.push('', `## ${folder === 'other' ? t.other : t.chars}`, '', ...header(t.cols), ...rows.chars);

  const brows = [];
  for (const r of BEHAVIOR_RULES) {
    const keys = r.keys.filter((k) => keyLanguages(k).includes(folder));
    if (!keys.length) continue;
    const traits = r.tags.map((g) => BEHAVIOR_TEXT[L][g]).join(L === 'en' ? ', ' : '、') || t.none;
    brows.push(`| ${keys.map((k) => esc(code(k))).join(' ')} | ${esc(traits)}${r.solo ? (L === 'en' ? ' (only when typed alone)' : L === 'ja' ? '（単独入力のみ）' : '（仅单独输入时）') : ''} | ${r.element ? ELEMENT_TEXT[L][r.element] : t.none} |`);
  }
  if (brows.length) out.push('', `## ${t.behaviors}`, '', ...header(t.bcols), ...brows);

  out.push('', `## ${t.shape}`, '', ...header(t.scols));
  for (const k of ['weight', 'attack', 'speed', 'defense', 'stability']) {
    const m = SHAPE_MOVES[k];
    out.push(`| ${t.shapeCond[k]} | **${esc(moveName(m.name, folder))}** | ${esc(KIND[L][m.kind])} |`);
  }
  out.push('');
  return { text: out.join('\n'), count };
}

const docsDir = join(root, 'docs', 'skills');
const index = ['# 必杀技 / 必殺技 / Signature moves', '', '> 由 `npm run docs:skills` 自动生成 · Generated — do not edit by hand.', ''];
for (const folder of Object.keys(FOLDERS)) {
  const { text, count } = buildDoc(folder);
  const dir = join(docsDir, FOLDERS[folder]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'README.md'), text, 'utf8');
  index.push(`- [${FOLDERS[folder]}](./${encodeURI(FOLDERS[folder])}/README.md) — ${count} keys`);
  console.log(`docs/skills/${FOLDERS[folder]}/README.md  (${count} keys)`);
}
writeFileSync(join(docsDir, 'README.md'), index.join('\n') + '\n', 'utf8');
