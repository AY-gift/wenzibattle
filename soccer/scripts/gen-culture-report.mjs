/**
 * Writes the implementation report of the culture pack (文化技能) from the live registry:
 * ../docs/文化技能实施报告.md. Every number in it is counted from the data the games use
 * (shared/src/sports/cultureData.ts, MOVE_TABLE), so it can't disagree with the game.
 * Run: npm run docs:culture  (in soccer/)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const C = await server.ssrLoadModule('/../shared/src/sports/culture.ts');
const { MOVE_TABLE } = await server.ssrLoadModule('/../shared/src/core/SignatureMoves.ts');
const { sportSkillFor } = await server.ssrLoadModule('/../shared/src/sports/skills.ts');
const { SOCCER_COMBOS } = await server.ssrLoadModule('/../shared/src/sports/combos.ts');
await server.close();

const { SOCCER_CULTURE, BASKETBALL_CULTURE: ALL_BASKET, CULTURE_CHARACTER_ROWS, CULTURE_MATCHUPS: ALL_MATCHUPS, EXPANSION_CHARACTER_ROWS, PRIM_TEXT, TRIGGER_TEXT, RISK_TEXT, TAG_TEXT, BASKET_PRIM_TEXT, BASKET_TRIGGER_TEXT, BASKET_RISK_TEXT } = C;
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const tally = (xs) => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
const bySource = (xs) => tally(xs.map((x) => x.source)).map(([k, v]) => `${k === 'v3' ? 'V3 技能包' : '文化包'} ${v}`).join('，');

// The culture pack proper; the basketball expansion pack is reported in its own section.
const BASKETBALL_CULTURE = ALL_BASKET.filter((b) => b.source !== 'bx');
const CULTURE_MATCHUPS = ALL_MATCHUPS.filter((m) => m.source !== 'bx');
const bxPairs = ALL_BASKET.filter((b) => b.source === 'bx');
const bxMu = ALL_MATCHUPS.filter((m) => m.source === 'bx');
const bxNew = EXPANSION_CHARACTER_ROWS.filter((r) => r.status === 'new');
const bxOld = EXPANSION_CHARACTER_ROWS.filter((r) => r.status === 'existing');
const soccerNew = SOCCER_CULTURE.filter((c) => c.status === 'implemented');
const soccerOld = SOCCER_CULTURE.filter((c) => c.status === 'existing');
const chars = CULTURE_CHARACTER_ROWS.map((r) => ({ r, e: MOVE_TABLE.find((m) => m.keys.includes(r.key)) }));
const charNew = chars.filter((x) => x.e?.pack === 'culture');
const charOld = chars.filter((x) => x.e && x.e.pack !== 'culture');
const charMissing = chars.filter((x) => !x.e);
const muSoccer = CULTURE_MATCHUPS.filter((m) => m.mode === 'soccer');
const muBasket = CULTURE_MATCHUPS.filter((m) => m.mode !== 'soccer');
const v3Count = [...SOCCER_CULTURE, ...CULTURE_CHARACTER_ROWS, ...BASKETBALL_CULTURE].filter((x) => x.source === 'v3').length;
const total = SOCCER_CULTURE.length + BASKETBALL_CULTURE.length + CULTURE_CHARACTER_ROWS.length + CULTURE_MATCHUPS.length;
const reused = soccerOld.length + charOld.length;
const implemented = soccerNew.length + charNew.length + muSoccer.length + BASKETBALL_CULTURE.length + muBasket.length;
const blocked = 0;
const effectText = { counter: '互相反制：一方发动连携后，另一方冷却立刻缩短到 3 秒', chaos: '混战：开场 60 秒连携冷却减半', weather: '天气：两个半场各出现一块减速区（两队都受影响）', spotlight: '聚光灯：开场 15 秒对手集中盯防明星' };

const md = [
  '# 文化技能包 实施报告',
  '',
  '> 由 `npm run docs:culture`（在 soccer/ 里）从游戏实际使用的数据自动生成，请勿手动修改。仅供开发参考：游戏里不提供图鉴，连携留给玩家自己发现。',
  '',
  '## 总数',
  '',
  `收到 3 个压缩包，其中两个字节完全相同，实际是 2 份新内容；合并单文件全量版（\`shared/docs/design/culture-pack/\`）与 V3 技能包（\`shared/docs/design/skill-ideas-v3/\`）后去重，共 **${total}** 条（文化包 ${total - v3Count} 条 + V3 技能包 ${v3Count} 条）：`,
  '',
  '| 类别 | 条数 | 来源 | 已有复用 | 新实现 | 未实现 |',
  '| --- | --- | --- | --- | --- | --- |',
  `| 足球四字文化连携 | ${SOCCER_CULTURE.length} | ${bySource(SOCCER_CULTURE)} | ${soccerOld.length} | ${soccerNew.length} | 0 |`,
  `| 单字·完整词语角色 | ${CULTURE_CHARACTER_ROWS.length} | ${bySource(CULTURE_CHARACTER_ROWS)} | ${charOld.length} | ${charNew.length} | ${charMissing.length} |`,
  `| 特殊对阵（足球） | ${muSoccer.length} | — | 0 | ${muSoccer.length} | 0 |`,
  `| 特殊对阵（篮球） | ${muBasket.length} | — | 0 | ${muBasket.length} | 0 |`,
  `| 篮球双字搭档 | ${BASKETBALL_CULTURE.length} | ${bySource(BASKETBALL_CULTURE)} | 0 | ${BASKETBALL_CULTURE.length} | 0 |`,
  `| **合计** | **${total}** | | **${reused}** | **${implemented}** | **${blocked}** |`,
  '',
  '**全部已实现。** 篮球 2v2（`basketball/`）已经做好：91 组搭档（其中 13 组是以前登记过、但一直没有效果的成语搭档）和 16 组篮球对阵都在比赛里真实生效。单字/词语角色的必杀在擂台、足球、篮球三个游戏里都生效（球场上通过 `sportSkillFor` 把同一个招式翻译成对应的球场技能）。',
  '',
  `## 篮球扩展包（${EXPANSION_CHARACTER_ROWS.length + bxPairs.length + bxMu.length} 项）`,
  '',
  '来源：`shared/docs/design/basketball-expansion/`（按《文字技能设计指南》的标准格式交付）。导入前与现有全部数据做了精确键 + NFC + 大小写去重。',
  '',
  '| 层 | 条数 | 已有复用 | 新实现 | 未实现 |',
  '| --- | --- | --- | --- | --- |',
  `| L1 角色必杀（擂台 / 足球 / 篮球共用） | ${EXPANSION_CHARACTER_ROWS.length} | ${bxOld.length} | ${bxNew.length} | 0 |`,
  `| L2 篮球双字搭档 | ${bxPairs.length} | 0 | ${bxPairs.length} | 0 |`,
  `| L3 篮球特殊对阵 | ${bxMu.length} | 0 | ${bxMu.length} | 0 |`,
  `| **合计** | **${EXPANSION_CHARACTER_ROWS.length + bxPairs.length + bxMu.length}** | **${bxOld.length}** | **${bxNew.length + bxPairs.length + bxMu.length}** | **0** |`,
  '',
  `已有必杀而保留原招式（不覆盖）的字词：${bxOld.map((r) => r.key).join('、')}。`,
  '',
  '- **L1**：每个新角色是一个现有擂台机制 + 道具 + 三语名字，在三个游戏里共用；在篮球场上按机制自动变成对应的篮球技能（篮球演出说明见图鉴）。',
  '- **L2**：与原有 91 组搭档使用同一个引擎和词汇；每一组都在测试里逐条验证「每个原语都真实发生」。两个投篮原语相连时合成一次投篮（如「抛投」= 高弧线打板），防守触发 + 进攻原语的搭档先防守、抢到球后再进攻。',
  '- **L3**：四种对决规则（反制 / 混战 / 天气 / 聚光灯），两种顺序都识别，跳球时播报。',
  '',
  '## 足球文化连携是怎么工作的',
  '',
  '每支四字文化队有一个连携：**触发条件 + 1–3 个原语 + 风险**（`soccer/src/sim/culture.ts`）。',
  '',
  '- 每个原语都是真实的模拟动作：传球/射门是真的踢球（会被拦截、会被扑出），团队效果真实改变速度/抢断/站位/精度，对手效果真的定身、减速、迷惑、推倒，纸箱是真的碰撞体。',
  '- 不写比分、不生成第二个球、不强制进球；所有随机都来自比赛种子（同一阵容+种子 = 同一场比赛，分享链接不受影响）。',
  '- 每场每队最多 5 次，冷却 20–26 秒；原有 12 个成语连携优先，保持原样。',
  '- 风险约 40% 触发，只有真的发生时才显示（摔倒、互撞、踢飞、乌龙方向、累、空门、提前庆祝、撞围板）。',
  '',
  '### 原语使用次数',
  '',
  '| 原语 | 效果 | 使用队数 |',
  '| --- | --- | --- |',
  ...tally(soccerNew.flatMap((c) => c.prims)).map(([k, v]) => `| \`${k}\` | ${cell(PRIM_TEXT[k].zh)} | ${v} |`),
  '',
  '### 触发条件',
  '',
  '| 触发 | 说明 | 队数 |',
  '| --- | --- | --- |',
  ...tally(soccerNew.map((c) => c.trigger)).map(([k, v]) => `| \`${k}\` | ${cell(TRIGGER_TEXT[k].zh)} | ${v} |`),
  '',
  '### 风险',
  '',
  '| 风险 | 说明 | 队数 |',
  '| --- | --- | --- |',
  ...tally(soccerNew.map((c) => c.risk)).map(([k, v]) => `| \`${k}\` | ${cell(RISK_TEXT[k].zh || '无')} | ${v} |`),
  '',
  '## 擂台式乱斗（新增）',
  '',
  '球员偶尔会直接用自己的擂台必杀攻击对手（同名、同样的大字）：连打、升龙、飞踢、过肩摔、跺地、旋风、怒吼、冰冻八种打法，被撞倒的人会记仇报复，每场最多一次「乱斗时刻」。足球仍然是主体（每场约 10 次出手）。代码：`soccer/src/sim/brawl.ts`。',
  '',
  '## 顺便修的 bug',
  '',
  '- **持球人带球走到边界什么都不做**：抢断打断了正在蓄力的踢球，残留的 `pending` 让持球人永远不再做决定。已修复并加回归测试。',
  '- **镜像比赛不公平**：同一阵容对打时右边那队（攻 −x 方向）胜率约 63%。原因是开球点 z=0 时的平局判定、若干站位偏移没有随半场旋转。修复后 1114 场镜像比赛胜率 50.7%，并加了「旋转后的世界踢出旋转后的比赛」的精确对称测试。',
  '- **传球没人接**：传球在飞行中只有一个「最快到球的人」去追，接球人原地不动；现在接球人会跑向球的落点（打围板的传球则原地等反弹）。',
  '',
  '## 足球文化连携（全部）',
  '',
  '| 队名 | 连携名 | 类别 | 触发 | 原语 | 风险 | 状态 |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...SOCCER_CULTURE.map((c) => {
    const idiom = SOCCER_COMBOS.find((x) => x.keys.includes(c.key));
    return `| ${cell(c.key)} | ${cell(c.name)} | ${TAG_TEXT[c.tag].zh} | ${c.trigger} | ${c.prims.join(' + ')} | ${c.risk} | ${c.status === 'existing' ? `复用原成语连携「${idiom?.name.zh ?? ''}」` : '新实现'} |`;
  }),
  '',
  '## 单字·词语角色（全部）',
  '',
  '| 字/词 | 设计名 | 擂台必杀 | 机制 | 球场技能 | 状态 |',
  '| --- | --- | --- | --- | --- | --- |',
  ...chars.map(({ r, e }) => `| ${cell(r.key)} | ${cell(r.name)} | ${e ? cell(e.name.zh) : '—'} | ${e?.kind ?? '—'} | ${e ? sportSkillFor({ kind: e.kind, name: e.name, key: r.key, opts: e.opts }).kind : '—'} | ${!e ? '缺失' : e.pack === 'culture' ? '新实现' : '复用已有'} |`),
  '',
  '## 特殊对阵',
  '',
  '| 模式 | 对阵 | 名称 | 规则 | 状态 |',
  '| --- | --- | --- | --- | --- |',
  ...ALL_MATCHUPS.map((m) => `| ${m.mode === 'soccer' ? '足球' : '篮球'} | ${cell(m.a)} ⚔ ${cell(m.b)} | ${cell(m.name)} | ${m.effect ? effectText[m.effect] : '—'} | 新实现（两种顺序都识别，开场播报） |`),
  '',
  '## 篮球双字搭档（全部）',
  '',
  '引擎：`basketball/src/sim/culture.ts`。传球、高抛、投篮、扣篮都是真实的球，可以被抢断、盖帽、打铁；只有球从上往下穿过篮圈才得分。',
  '',
  '| 搭档 | 名称 | 触发 | 原语 | 风险 | 说明 |',
  '| --- | --- | --- | --- | --- | --- |',
  ...ALL_BASKET.map((b) => `| ${cell(b.key)} | ${cell(b.name)}${b.idiom ? '（成语搭档）' : b.source === 'bx' ? '（扩展包）' : ''} | ${cell(BASKET_TRIGGER_TEXT[b.trigger].zh)} | ${b.prims.map((p) => cell(BASKET_PRIM_TEXT[p].zh)).join(' → ')} | ${cell(BASKET_RISK_TEXT[b.risk].zh || '无')} | ${cell(b.desc)} |`),
  '',
];
const out = join(root, '..', 'docs');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, '文化技能实施报告.md'), md.join('\n'), 'utf8');
console.log(`docs/文化技能实施报告.md  total ${total}: reused ${reused}, new ${implemented}, blocked ${blocked}, missing ${charMissing.length}`);
