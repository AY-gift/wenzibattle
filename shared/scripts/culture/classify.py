"""Turns the culture / V3 design tables into structured football combo recipes.

Input  (kept unchanged): shared/docs/design/culture-pack/*.tsv and shared/docs/design/skill-ideas-v3/*.md
Output: shared/src/sports/cultureData.ts  (the single registry the games and docs read)

Every football row becomes: trigger + 1–3 primitives (real actions in the simulation) + a
backfire risk, picked from the row's own description by keyword rules, then corrected by the
hand-written OVERRIDES below. Basketball rows are registered as data (status 'blocked' until
the basketball game exists). Run:  python shared/scripts/culture/classify.py
"""
import csv, json, os, re, sys, unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PACK = os.path.join(ROOT, 'shared', 'docs', 'design', 'culture-pack')
V3 = os.path.join(ROOT, 'shared', 'docs', 'design', 'skill-ideas-v3')
OUT = os.path.join(ROOT, 'shared', 'src', 'sports', 'cultureData.ts')
# Basketball expansion pack (286 items, standard format of docs/文字技能设计指南.md).
BX = os.path.join(ROOT, 'shared', 'docs', 'design', 'basketball-expansion')
MOVES_OUT = os.path.join(ROOT, 'shared', 'src', 'core', 'movesExpansion.ts')
MOVES_SRC = os.path.join(ROOT, 'shared', 'src', 'core', 'SignatureMoves.ts')

# Existing team combos (shared/src/sports/combos.ts) — never overwritten.
EXISTING_SOCCER = {'龙飞凤舞', '風平浪静', '风平浪静', '火上浇油', '画蛇添足', '一鸣惊人', '虎头蛇尾', '四面楚歌', '天马行空', '鸡飞狗跳', '乱七八糟', '无法无天', '大吉大利'}
EXISTING_BASKET = {'冰火', '黑白', '左右', '上下', '真假', '爱恨', '阴阳', '生死', '兄弟', '姐妹', '爸妈', '摸鱼', '牛逼'}

TAGS = {'影视与流行文化': 'film', '历史古典神话': 'history', '现代社会科技': 'society', '日本四字文化': 'japanese', '英语四字符': 'english'}
ANIME = ['漫画', '动画', '魔法少女', '机甲', '少年', '卡通', '宇宙战舰']
MYTH = ['后羿', '嫦娥', '精卫', '女娲', '大闹天宫', '封神', '神话']
TECH = ['人工智能', '系统崩溃', '网络', '算法', '量子', '自动驾驶', '人脸识别', '语音助手', '赛博', '代码', 'CODE', 'DATA', 'HACK', 'BUGS', 'PING', 'CTRL', 'WIFI']
NET = ['点赞', '热搜', '评论区', '弹幕', '一键三连', '直播', '粉丝', '网购', '网络暴力', 'MEME', 'NOOB', 'LMAO', 'GGWP', 'EZPZ', 'FOMO', 'YOLO']

# ---- keyword rules (first match wins inside each rule; order = priority) ----
PRIM_RULES = [
    ('fakeShot', ['假射', '佯装射', '假装射', '蓄势射门突然改传', '假动作射', '左侧假射']),
    ('passChain', ['连续传', '连传', '短传', '三传', '连续成功传', '传切', '依次', '四连', '连携', '无尽传递', '传找', '一步一传', '三脚传球', '快速传球', '连续快速传球', '依次踢']),
    ('throughBall', ['直塞', '长传', '远传', '穿透', '前插接', '顺传', '送达']),
    ('lobPass', ['高吊', '吊射', '高抛', '高球', '挑传', '空中接', '空中传', '高高抛起', '高弧', '超高弧线', '低重力', '漂浮', '腾空', '凌射', '空翻', '争顶']),
    ('longShot', ['远射', '蓄力', '重炮', '劲射', '炮击', '超远', '射门力量', '加倍一次射门', '射门更强']),
    ('curveShot', ['弧线', '曲线', '香蕉', '绕过一名', '反弹路线']),
    ('boardPass', ['围板', '墙面', '碰墙', '撞墙', '反弹二次', '打门柱反弹']),
    ('switchPlay', ['另一翼', '另一侧', '右侧接', '迂回', '左侧假射', '四路分兵', '不同跑道']),
    ('allOut', ['压上', '全攻', '全员冲', '强攻', '猛攻', '直冲', '一拥而上', '全队突然冲向', '冲锋', '都抢着射门', '全员压']),
    ('retreat', ['回防', '撤向', '撤退', '门线站位', '强制指挥全队', '守门线']),
    ('swapPositions', ['换位', '交叉', '互换', '环绕球场中心']),
    ('chaosRun', ['乱跑', '乱窜', '随机交叉', '扰乱防守', '翻滚扰乱', '混乱', '随机误操作', '高频扑倒', '忽快忽慢']),
    ('wallLine', ['防守墙', '封堵', '阵线', '列阵', '横移', '屏障', '岩石墙', '拼块障碍', '人墙', '字幕墙', '围成小圈', '缩紧', '站成']),
    ('press', ['包围', '围堵', '压迫', '夹击', '包夹', '强压', '一起追球', '全队一起追']),
    ('markWrong', ['幻影', '残影', '假球', '虚像', '投影', '误导', '误判', '错位', '认错', '假路线', '假轨迹', '光线', '诱导', '诱使', '假跑位', '烟雾', '遮挡视线', '遮盖', '迷惑', '虚影', '视觉', '饼图', '折扣牌', '假倒放', '假卡顿', '假指令', '鱼饵', '猫扑球影', '同步失误', '表情', '假摔', '花瓣']),
    ('keeperBoost', ['扑救', '门将', '救门', '救球', '极限拦截', '护盾']),
    ('calm', ['抵抗', '无事发生', '稳定', '降低铲球意愿', '握手', '停战']),
    ('grip', ['控球', '护球', '保持控球', '卸力']),
    ('tackleBoost', ['铲', '抢断', '抢球', '冲撞', '对抗', '截球', '拦截', '截断', '追球能力', '抢下']),
    ('accuracy', ['精度', '精准', '准确', '射正', '稳定性', '最佳角度', '最佳路线']),
    ('recover', ['恢复', '起身', '爬起', '摔了再起', '回血']),
    ('slowZone', ['减速', '黏', '打滑', '阻力', '雪地', '泥', '减慢', '放慢', '变慢']),
    ('pushWave', ['冲击波', '震开', '推开', '声波', '笑声波', '呼喊', '力场']),
    ('stunCarrier', ['定身', '僵', '惊吓', '吓', '停下来', '停顿', '蓝屏急停']),
    ('scrambleOpp', ['错误换位', '打乱', '变阵']),
    ('lucky', ['幸运', '好运', '补正', '奇妙反弹']),
    ('extraKick', ['补射', '再踢', '追加', '积极补射', '另一人补射', '多一次踢']),
    ('heavyScreen', ['重型', '最重', '挡住一名', '挡拆', '巨虎', '两名重型', '购物车']),
    ('spotlight', ['聚光灯', '明星', '特写', '盯防明星', '吸引对手']),
    ('sprint', ['冲刺', '加速', '疾跑', '快跑', '突进', '高速', '前插', '速度', '奔跑', '奇袭', '漂移', '滑行', '滑步']),
    ('celebrateBait', ['庆祝', '吹蜡烛', '开吃', '集合', '吃饭', '停下来']),
]

TRIGGER_RULES = [
    ('lateBehind', ['落后最后', '最后阶段', '落后且', '绝境']),
    ('behind', ['落后', '逆转', '反扑']),
    ('lateAhead', ['领先时']),
    ('kickoff', ['开场', '开球', '开局', '每队一次开球']),
    ('afterConcede', ['丢球后', '失球后', '失去控球权后', '刚失球']),
    ('late', ['最后半分钟', '后期', '最后二十秒', '最后倒数', '最后10秒']),
    ('early', ['前一分钟']),
    ('afterShot', ['被扑出', '射门后', '碰到门框', '击中围板或门柱', '被挡出']),
    ('afterSave', ['防住对方', '射来的球', '高空远射成功']),
    ('afterTackle', ['抢断', '截断来的球', '刚完成一次抢断']),
    ('flank', ['边线', '边路', '侧翼', '侧路', '沿围板']),
    ('pressed', ['包夹', '被包', '闪避铲断']),
]

DEF_PRIMS = {'retreat', 'wallLine', 'press', 'keeperBoost', 'calm', 'tackleBoost', 'slowZone', 'stunCarrier', 'scrambleOpp', 'pushWave'}
BALL_PRIMS = {'passChain', 'throughBall', 'lobPass', 'longShot', 'curveShot', 'fakeShot', 'boardPass', 'switchPlay'}

RISK_RULES = [
    ('ownRisk', ['乌龙']),
    ('crash', ['踢到队友', '互相绊倒', '连锁撞', '撞在一起', '队友倒地', '互相撞倒', '撞倒队友', '首人倒下', '自己人也']),
    ('boardCrash', ['撞板', '冲过底线', '冲过头', '滑出', '刹不住', '撞向第二']),
    ('wild', ['踢偏', '失误', '跑偏', '精度下降', '控球难度', '误判', '误读', '选错', '偏转风险', '失败率', '偏差', '误传', '踢散', '弹回自己', '砸回射手', '看错', '猜错', '丢球']),
    ('tired', ['疲劳', '喘气', '恢复慢', '恢复变慢', '变慢', '恢复极慢', '后半程']),
    ('gap', ['空门', '空虚', '漏防', '没人留守', '暴露', '失去防守', '无人', '失位', '空缺', '回防较慢', '侧边极易', '防守漏洞', '后场', '区域保护弱', '不积极防守']),
    ('celebrate', ['庆祝', '摆姿势', '吹蜡烛']),
    ('trip', ['倒地', '摔倒', '绊倒', '撞倒', '笑倒', '扑空', '失衡', '沉醉', '吓跑']),
]

def classify(text):
    prims = []
    for name, kws in PRIM_RULES:
        if any(k in text for k in kws) and name not in prims:
            prims.append(name)
    trig = None
    for name, kws in TRIGGER_RULES:
        if any(k in text for k in kws):
            trig = name
            break
    risk = 'none'
    for name, kws in RISK_RULES:
        if any(k in text for k in kws):
            risk = name
            break
    return prims, trig, risk

def tag_for(cat, key, text):
    t = TAGS.get(cat, 'idiom')
    if t == 'film' and any(a in key or a in text for a in ANIME):
        t = 'anime'
    if t == 'history':
        t = 'myth' if any(a in key for a in MYTH) else 'idiom'
    if t == 'society':
        t = 'tech' if any(a in key for a in TECH) else 'internet' if any(a in key for a in NET) else 'society'
    if t == 'english' and any(a in key for a in TECH):
        t = 'english'
    return t

def read_tsv(name):
    rows = []
    with open(os.path.join(PACK, name), encoding='utf-8') as f:
        for i, line in enumerate(f):
            if i == 0 or not line.strip():
                continue
            rows.append([c.strip() for c in line.rstrip('\n').split('|')])
    return rows

def md_rows(path):
    out = []
    for line in open(path, encoding='utf-8'):
        if not line.startswith('|') or '---' in line:
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        out.append(cells)
    return out[1:]  # drop header

from overrides import OVERRIDES, MATCHUP_EFFECTS  # noqa: E402
from overrides_basket import B as BASKET_RECIPES, IDIOM as BASKET_IDIOM, BASKET_MATCHUP_EFFECTS  # noqa: E402

VALID_PRIMS = {'passChain', 'throughBall', 'lobPass', 'longShot', 'curveShot', 'skyShot', 'fakeShot', 'boardPass', 'switchPlay', 'dribbleBurst',
               'sprint', 'allOut', 'retreat', 'swapPositions', 'chaosRun', 'wallLine', 'press', 'keeperBoost', 'calm', 'grip', 'tackleBoost',
               'accuracy', 'recover', 'heavyScreen', 'celebrateBait', 'playDead', 'peace', 'markWrong', 'spotlight', 'slowZone', 'pushWave',
               'stunCarrier', 'scrambleOpp', 'obstacle', 'lucky', 'extraKick'}
VALID_TRIGGERS = {'attack', 'midfield', 'final3', 'flank', 'pressed', 'defend', 'danger', 'loose', 'lostBall', 'kickoff', 'behind', 'lateBehind',
                  'lateAhead', 'late', 'afterConcede', 'afterShot', 'afterSave', 'afterTackle', 'any'}
VALID_RISKS = {'none', 'trip', 'crash', 'wild', 'tired', 'gap', 'celebrate', 'boardCrash', 'ownRisk'}
B_PRIMS = {'alleyOop', 'giveAndGo', 'pickAndRoll', 'backdoorCut', 'crossover', 'pumpFake', 'highArc', 'bankShot', 'deepThree', 'powerDunk',
           'curvePass', 'fastBreak', 'swapPass', 'tipIn', 'screen', 'sprint', 'swap', 'doubleTeam', 'paintWall', 'blockBoost', 'stealBoost',
           'reboundBoost', 'lowGravity', 'calm', 'accuracy', 'recover', 'spotlight', 'markWrong', 'decoyBall', 'slowZone', 'pushWave',
           'stunCarrier', 'obstacle', 'lucky'}
B_TRIGGERS = {'attack', 'frontcourt', 'paint', 'perimeter', 'pressed', 'defend', 'danger', 'rebound', 'afterMiss', 'afterScore',
              'afterConcede', 'afterSteal', 'tipoff', 'behind', 'lateBehind', 'lateAhead', 'late', 'any'}
B_RISKS = {'none', 'trip', 'crash', 'wild', 'tired', 'gap', 'celebrate', 'miscomm'}

def basket_recipe(entry):
    r = BASKET_RECIPES.get(entry['key'])
    if not r:
        raise SystemExit(f"basketball pair without a recipe: {entry['key']}")
    trig, prims, risk = r
    prims = prims.split(',')
    bad = [p for p in prims if p not in B_PRIMS]
    if bad or trig not in B_TRIGGERS or risk not in B_RISKS or not 1 <= len(prims) <= 3:
        raise SystemExit(f"{entry['key']}: bad basketball recipe {r}")
    entry.update({'trigger': trig, 'prims': prims, 'risk': risk, 'status': 'implemented'})
    if entry['key'] in BASKET_IDIOM:
        entry['idiom'] = True
    return entry

def finish(entry):
    o = OVERRIDES.get(entry['key'])
    if o:
        entry.update(o)
        prims = list(dict.fromkeys(entry['prims']))  # hand-written order is the execution order
    else:
        # Keyword fallback: 1–3 primitives, ball actions first.
        prims = sorted(dict.fromkeys(entry['prims']), key=lambda p: 0 if p in BALL_PRIMS else 1)
    prims = [p for p in prims if p != 'celebrateBait' or o][:3]
    if not prims:
        prims = ['sprint']
    entry['prims'] = prims
    bad = [p for p in prims if p not in VALID_PRIMS]
    if bad:
        raise SystemExit(f"{entry['key']}: unknown primitive {bad}")
    if not entry.get('trigger'):
        main = prims[0]
        if main in BALL_PRIMS or main in ('sprint', 'swapPositions', 'chaosRun', 'allOut', 'markWrong', 'spotlight', 'celebrateBait', 'accuracy', 'grip', 'heavyScreen'):
            entry['trigger'] = 'final3' if main in ('longShot', 'curveShot', 'fakeShot', 'extraKick') else 'attack'
        elif main in ('lucky', 'extraKick'):
            entry['trigger'] = 'afterShot'
        elif main == 'recover':
            entry['trigger'] = 'any'
        else:
            entry['trigger'] = 'danger' if main in ('keeperBoost', 'retreat', 'wallLine') else 'defend'
    if entry['trigger'] not in VALID_TRIGGERS or entry['risk'] not in VALID_RISKS:
        raise SystemExit(f"{entry['key']}: bad trigger/risk {entry['trigger']} {entry['risk']}")
    return entry

soccer, basket, chars, matchups = [], [], [], []
seen = {}

for cat, key, name, text in read_tsv('01_足球四字文化连携.tsv'):
    prims, trig, risk = classify(text)
    e = {'key': key, 'name': name, 'tag': tag_for(cat, key, text), 'source': 'culture', 'desc': text, 'prims': prims, 'trigger': trig, 'risk': risk}
    e['status'] = 'existing' if key in EXISTING_SOCCER else 'implemented'
    soccer.append(e)
    seen[key] = e

for cells in md_rows(os.path.join(V3, '03_足球四字成语队伍.md')):
    key, name, cond, text, prio = cells[:5]
    prims, trig, risk = classify(cond + '；' + text)
    if key in seen:
        seen[key]['v3'] = f'{name}：{cond} → {text}'
        continue
    e = {'key': key, 'name': name.split('·')[-1], 'tag': 'idiom', 'source': 'v3', 'desc': f'{cond}：{text}', 'prims': prims, 'trigger': trig, 'risk': risk, 'priority': prio}
    e['status'] = 'existing' if key in EXISTING_SOCCER else 'implemented'
    soccer.append(e)
    seen[key] = e

soccer = [finish(e) for e in soccer]

for cat, key, name, text in read_tsv('02_篮球双字文化搭档.tsv'):
    basket.append(basket_recipe({'key': key, 'name': name, 'tag': tag_for(cat, key, text), 'source': 'culture', 'desc': text}))
bseen = {b['key'] for b in basket}
for cells in md_rows(os.path.join(V3, '04_篮球双字搭档.md')):
    key, name = cells[0], cells[1]
    if key in bseen:
        continue
    bseen.add(key)
    basket.append(basket_recipe({'key': key, 'name': name, 'tag': 'idiom', 'source': 'v3', 'desc': ' / '.join(cells[2:4])}))

for row in read_tsv('04_特殊对阵与文化彩蛋.tsv'):
    mode, a, b, ev, rule = row
    m = {'mode': 'soccer' if mode == '足球' else 'basketball', 'a': a, 'b': b, 'name': ev, 'desc': rule}
    m.update(MATCHUP_EFFECTS.get(f'{a}|{b}', {}))
    if m['mode'] == 'basketball':
        m['effect'] = BASKET_MATCHUP_EFFECTS[f'{a}|{b}']
    m['status'] = 'implemented'
    matchups.append(m)

# Character rows: handled by hand in shared/src/core/SignatureMoves.ts (arena moves); here we only
# list them so the report can say which entry each one became.
for level, key, name, text in read_tsv('03_单字与完整词语角色.tsv'):
    chars.append({'key': key, 'name': name, 'level': level, 'source': 'culture', 'desc': text})
cseen = {c['key'] for c in chars}
for f in ('01_单字技能.md', '02_完整词语技能.md'):
    for cells in md_rows(os.path.join(V3, f)):
        key = cells[0]
        if key in cseen:
            continue
        cseen.add(key)
        chars.append({'key': key, 'name': cells[2], 'level': '单字' if f.startswith('01') else '完整词语', 'source': 'v3', 'desc': cells[3] + ' / ' + cells[4]})

# ---------------------------------------------------------------- basketball expansion pack

def bx_rows(name):
    with open(os.path.join(BX, name), encoding='utf-8-sig', newline='') as f:
        return list(csv.reader(f, delimiter='\t'))[1:]

CULTURE_TAGS = {'film', 'anime', 'myth', 'idiom', 'history', 'society', 'tech', 'internet', 'japanese', 'english'}
norm = lambda k: unicodedata.normalize('NFC', k).upper()
bx_report = {'pairs_new': 0, 'pairs_skipped': [], 'matchups_new': 0, 'matchups_skipped': [], 'moves_new': 0, 'moves_existing': []}
known_pairs = {norm(b['key']) for b in basket}
for key, name, tag, trig, prims, risk, desc in bx_rows('02_L2_篮球双字连携_标准格式.tsv'):
    if norm(key) in known_pairs:
        bx_report['pairs_skipped'].append(key)
        continue
    if tag not in CULTURE_TAGS:
        raise SystemExit(f'{key}: unknown tag {tag}')
    BASKET_RECIPES[key] = (trig, prims, risk)
    basket.append(basket_recipe({'key': key, 'name': name, 'tag': tag, 'source': 'bx', 'desc': desc}))
    known_pairs.add(norm(key))
    bx_report['pairs_new'] += 1
known_mu = {'|'.join(sorted((norm(m['a']), norm(m['b'])))) for m in matchups}
for mode, a, b, name, desc, effect in bx_rows('03_L3_篮球特殊对阵_标准格式.tsv'):
    pair = '|'.join(sorted((norm(a), norm(b))))
    if mode != '篮球' or pair in known_mu or norm(a) not in known_pairs or norm(b) not in known_pairs or effect not in ('counter', 'chaos', 'weather', 'spotlight'):
        bx_report['matchups_skipped'].append(f'{a}|{b}')
        continue
    matchups.append({'mode': 'basketball', 'a': a, 'b': b, 'name': name, 'desc': desc, 'effect': effect, 'status': 'implemented', 'source': 'bx'})
    known_mu.add(pair)
    bx_report['matchups_new'] += 1

# L1: new character moves → shared/src/core/movesExpansion.ts (keys that already have a move keep it).
OPT_KEYS = {'prop', 'count', 'arc', 'selfFall', 'counter', 'fx', 'hold', 'propAt', 'props', 'onHit', 'finaleDrop', 'chaos', 'dmgScale', 'kbScale', 'upScale', 'countdown', 'pulses', 'selfSleep', 'selfStun', 'darkness', 'grow', 'noStretch', 'duration', 'sfx'}
KINDS = set(re.findall(r"'(\w+)'", re.search(r'export type MoveKind =(.*?);', open(MOVES_SRC, encoding='utf-8').read(), re.S).group(1)))
TAGS = {'fire', 'slippery', 'flyer', 'hasty', 'sleepy', 'coward', 'angry', 'skull', 'slip', 'charm', 'chaos', 'gas', 'heavy', 'spinner', 'royal', 'pounce', 'loyal', 'laugh', 'electric', 'star', 'explode', 'ghost', 'bouncy', 'tiny', 'giant'}
src_moves = open(MOVES_SRC, encoding='utf-8').read()
old_keys = {norm(k) for block in re.findall(r'keys: \[(.*?)\]', src_moves) for k in re.findall(r"'([^']*)'", block)}
notes = {r[0]: r[2] for r in bx_rows('01_L1_篮球适配说明.tsv')}
bx_moves, bx_chars = [], []
def lang_of(k):
    if re.fullmatch(r'[A-Za-z0-9 ]+', k):
        return 'en'
    if re.search(r'[\u3040-\u30ff]', k):
        return 'ja'
    return 'zh'
for key, alias, kind, opts, tag, ja, zh, en, desc in bx_rows('01_L1_新角色_标准格式.tsv'):
    keys = [key] + [a for a in alias.split('/') if a]
    row = {'key': key, 'name': zh, 'level': '单字' if len(key) == 1 else '完整词语', 'source': 'bx', 'desc': desc, 'basket': notes.get(key, '')}
    if norm(key) in old_keys:
        row['status'] = 'existing'
        bx_chars.append(row)
        bx_report['moves_existing'].append(key)
        continue
    if kind not in KINDS:
        raise SystemExit(f'{key}: unknown kind {kind}')
    o = {k: v for k, v in json.loads(opts or '{}').items() if k in OPT_KEYS}
    e = {'pack': 'basketball', 'lang': lang_of(key), 'keys': [k for k in keys if norm(k) not in old_keys], 'kind': kind, 'name': {'ja': ja, 'zh': zh, 'en': en}}
    if o:
        e['opts'] = o
    if tag in TAGS:
        e['normal'] = [tag]
    bx_moves.append(e)
    row['status'] = 'new'
    bx_chars.append(row)
    bx_report['moves_new'] += 1
mv_lines = [
    '/**',
    ' * GENERATED by shared/scripts/culture/classify.py from shared/docs/design/basketball-expansion',
    ' * (L1 character moves of the basketball expansion pack). Keys that already had a move keep it.',
    ' * Shared by all three games through MOVE_TABLE (SignatureMoves.ts).',
    ' */',
    "import type { MoveEntry } from './SignatureMoves';",
    '',
    f'export const EXPANSION_MOVES: MoveEntry[] = {json.dumps(bx_moves, ensure_ascii=False, indent=1)};',
    '',
]
open(MOVES_OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(mv_lines))

if '--dump' in sys.argv:
    for e in soccer:
        print(f"{e['key']}|{e['trigger']}|{','.join(e['prims'])}|{e['risk']}|{e['desc'][:40]}")
    sys.exit(0)

def ts(v):
    return json.dumps(v, ensure_ascii=False)

lines = [
    '/**',
    ' * GENERATED by shared/scripts/culture/classify.py from the culture pack and the V3 idea tables',
    ' * (shared/docs/design/culture-pack, shared/docs/design/skill-ideas-v3). Edit the overrides there,',
    ' * not this file. Football rows are real recipes run by soccer/src/sim/culture.ts, basketball rows',
    ' * by basketball/src/sim/culture.ts.',
    ' */',
    "import type { CultureCombo, CultureMatchup, CultureBasketPair, CultureCharacterRow } from './culture';",
    '',
    f'export const SOCCER_CULTURE: CultureCombo[] = {ts(soccer)};',
    '',
    f'export const BASKETBALL_CULTURE: CultureBasketPair[] = {ts(basket)};',
    '',
    f'export const CULTURE_MATCHUPS: CultureMatchup[] = {ts(matchups)};',
    '',
    f'export const CULTURE_CHARACTER_ROWS: CultureCharacterRow[] = {ts(chars)};',
    '',
    '/** L1 character rows of the basketball expansion pack (status: new move, or an existing move kept). */',
    f'export const EXPANSION_CHARACTER_ROWS: CultureCharacterRow[] = {ts(bx_chars)};',
    '',
]
open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('basketball expansion:', json.dumps(bx_report, ensure_ascii=False))
print(f'soccer {len(soccer)} (existing {sum(e["status"] == "existing" for e in soccer)}), basketball {len(basket)}, matchups {len(matchups)}, characters {len(chars)} -> {os.path.relpath(OUT, ROOT)}')
