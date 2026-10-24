/**
 * The same two glyph commentators as in the arena — 「口」 (play-by-play, over-excited) and
 * 「舌」 (colour commentary, mostly nonsense) — now calling football.
 * Placeholders: {p} player, {o} other player, {team} team, {move} special move, {combo} combo, {label} matchup name, {s} score.
 */
import type { Lang } from './i18n';

export interface Lines {
  p?: string[];
  c?: string[];
}

export type CrowdMood = 'pre' | 'idle' | 'goal' | 'conceded' | 'shot' | 'save' | 'skill' | 'knock' | 'combo' | 'post' | 'win' | 'lose' | 'draw' | 'brawl' | 'culture' | 'rivalry';

export interface SoccerCommentary {
  speakers: [string, string];
  events: Record<string, Lines>;
  idle: string[];
  /** Spectator shouts (speech bubbles over the stands). {team} = the fan's team, {p} = a player. */
  crowd: Record<CrowdMood, string[]>;
}

export const COMMENTARY: Record<Lang, SoccerCommentary> = {
  zh: {
    speakers: ['大嘴解说「口」', '毒舌嘉宾「舌」'],
    events: {
      kickoff: { p: ['{team} 开球！', '比赛开始！皮球滚起来了！'], c: ['我赌三个煎饼，今天至少进五个。'] },
      goal: { p: ['球进了！！！「{p}」破门！{s}！', 'GOAL！「{p}」！！'], c: ['这一脚，我奶奶都看哭了。', '守门员刚才在想晚饭吃什么。'] },
      skillGoal: { p: ['必杀「{move}」直挂球门！！「{p}」！'], c: ['这已经不是足球了，这是物理学的胜利。'] },
      comboGoal: { p: ['{team}的连携「{combo}」！完美破门！'], c: ['四个字配合得比我家WiFi还稳。'] },
      ownGoal: { p: ['哎呀！「{p}」把球送进了自家球门！'], c: ['他可能只是太爱自己的球门了。'] },
      save: { p: ['「{p}」神扑救！', '被「{p}」挡出来了！'], c: ['这个字，横看竖看都像一堵墙。'] },
      post: { p: ['哐——！打在门框上！'], c: ['门框今天状态很好。'] },
      skill: { p: ['必杀技！「{p}」的「{move}」！'], c: ['这招在擂台上也打过人。', '同一个招式，换了个运动照样离谱。'] },
      combo: { p: ['{team}发动连携「{combo}」！！'], c: ['成语老师看了会落泪。'] },
      culture: { p: ['{team}发动文化连携「{combo}」！', '来了！{team}的「{combo}」！'], c: ['这个梗我懂，但球懂吗？', '四个字凑在一起，就会发生奇怪的事。'] },
      backfire: { p: ['哎呀，「{combo}」玩脱了！'], c: ['梗太长，脚太短。', '效果很好，副作用更好。'] },
      rivalry: { p: ['宿敌对决！「{label}」！', '注意！这是一场「{label}」！'], c: ['这两队名字放在一起，就注定要出事。'] },
      tackleWin: { p: ['「{p}」抢断成功！'], c: ['干净利落，像抢最后一块红烧肉。'] },
      knockdown: { p: ['「{p}」倒地了！'], c: ['没有裁判，所以这不算犯规。'] },
      luckyBounce: { p: ['大吉大利！球自己拐进去了！'], c: ['今天的运势：上上签。'] },
      bonusKick: { p: ['「{p}」又补了一脚！'], c: ['画蛇添足，但蛇好像更好看了？'] },
      fight: { p: ['「{p}」不管球了！直接对「{o}」使出「{move}」！', '没有裁判！「{p}」的「{move}」！'], c: ['这是足球还是擂台？', '我就说这几个字在擂台上见过。', '规则手册里确实没写不能这样。'] },
      fightHit: { p: ['「{o}」被打飞了！'], c: ['这一下，我在解说席都觉得疼。'] },
      brawl: { p: ['打起来了！！全场大乱斗！', '球呢？没人管球了！'], c: ['欢迎收看字形乱斗……啊不，字形足球。', '保安！保安！哦，我们没有保安。'] },
      brawlEnd: { p: ['乱斗结束，大家想起来还有个球。'], c: ['刚才那段请大家忘掉。'] },
      timeUp: { p: ['时间到！'], c: ['我的爆米花也吃完了。'] },
      goldenGoal: { p: ['平局！进入金球决胜，先进球的赢！'], c: ['心脏不好的观众请先喝口茶。'] },
      finish: { p: ['比赛结束！{team} 获胜！'], c: ['这场比赛将载入字典的体育版。'] },
      draw: { p: ['比赛结束，双方握手言和！'], c: ['和气生财。'] },
    },
    crowd: {
      pre: ['快开球啊！', '我是来看字踢球的', '这队名念啥？', '{team}必胜！', '妈，我上电视了！', '前面的蹲下！', '今天能进几个？', '我押{team}三个煎饼'],
      idle: ['{team}加油！', '传球啊！', '射门！射门！', '跑起来！', '防守！防守！', '{team}！{team}！', '那个字跑得好可爱', '裁判呢？哦没有裁判', '我看不懂但我很激动', '往前踢！'],
      goal: ['进啦！！！', 'GOOOAL！', '{team}万岁！', '这球我能吹一年！', '漂亮！', '「{p}」我爱你！'],
      conceded: ['守门员在干嘛！', '退钱！', '下一个！下一个！', '没事，还早！', '唉……'],
      shot: ['射得好！', '差一点！', '哇哦！', '再来一脚！'],
      save: ['神扑！', '好球没进！', '这守门员是墙吧', '扑得漂亮！'],
      skill: ['必杀技来了！', '「{p}」好帅！', '这招我在擂台见过！', '离谱！'],
      knock: ['哎哟！', '疼疼疼', '没有犯规吗？', '倒地了！'],
      combo: ['成语连携！！', '四个字配合好默契！', '这是语文课吗？'],
      culture: ['这个梗我懂！', '「{team}」整活了！', '名场面！', '哈哈哈哈什么鬼'],
      rivalry: ['宿敌！宿敌！', '今天必须分个高下！', '这对阵太有梗了'],
      post: ['哐！门框！', '可惜！！', '就差那么一点！'],
      win: ['我们赢啦！！', '{team}冠军！', '今晚吃煎饼庆祝！'],
      lose: ['明年再来……', '还是爱你们', '回家吧……'],
      draw: ['打平也不错', '和气生财', '再加时一场吧！'],
      brawl: ['打起来了！', '揍他！', '这才是我买票的原因', '升龙拳！', '球在那边啊喂！', '比擂台还精彩'],
    },
    idle: ['说起来，足球场上的字比擂台上的字更爱跑。', '我们的赞助商：隔壁煎饼摊，进一个球送一个蛋。', '这片草坪是我昨天亲手剪的，剪成了「字」。', '如果我是守门员，我就站在球门里面喝茶。', '四个字踢足球，比四个人打麻将还热闹。', '我建议对方多喝热水，然后多跑两步。'],
  },
  ja: {
    speakers: ['実況「口」', '解説「舌」'],
    events: {
      kickoff: { p: ['{team}のキックオフ！', '試合開始！ボールが転がり出した！'], c: ['今日は5点は入るとみてます。たこ焼き賭けます。'] },
      goal: { p: ['入ったーー！「{p}」のゴール！{s}！', 'ゴーール！「{p}」！！'], c: ['このシュート、祖母が見たら泣きます。', 'キーパーは晩ごはんのことを考えてましたね。'] },
      skillGoal: { p: ['必殺「{move}」が突き刺さった！「{p}」！'], c: ['もはやサッカーじゃない、物理学の勝利です。'] },
      comboGoal: { p: ['{team}の連携「{combo}」！完璧なゴール！'], c: ['四文字の息がWi-Fiより安定してます。'] },
      ownGoal: { p: ['あーっと！「{p}」が自陣のゴールへ！'], c: ['自分のゴールが好きすぎたんでしょう。'] },
      save: { p: ['「{p}」スーパーセーブ！', '「{p}」がはじき出した！'], c: ['どこから見ても壁ですね、この字は。'] },
      post: { p: ['カーン！ポストに当たった！'], c: ['ゴールポストが今日いちばん調子いいです。'] },
      skill: { p: ['必殺技！「{p}」の「{move}」！'], c: ['この技、リングでも人を倒してました。', '競技が変わっても技はめちゃくちゃです。'] },
      combo: { p: ['{team}が連携「{combo}」を発動！'], c: ['国語の先生が見たら泣きますね。'] },
      culture: { p: ['{team}の文化連携「{combo}」！', 'きた！{team}の「{combo}」！'], c: ['ネタは分かる、でもボールは分かってる？', '四文字そろうと、変なことが起きます。'] },
      backfire: { p: ['あっ、「{combo}」が裏目に！'], c: ['ネタが長くて足が短い。', '効果は抜群、副作用も抜群。'] },
      rivalry: { p: ['宿命の対決！「{label}」！', '注目！これは「{label}」だ！'], c: ['この二つのチーム名、並んだ時点で事件です。'] },
      tackleWin: { p: ['「{p}」がボールを奪った！'], c: ['最後の唐揚げを取るような手際です。'] },
      knockdown: { p: ['「{p}」が倒れた！'], c: ['審判がいないのでファウルではありません。'] },
      luckyBounce: { p: ['大吉！ボールが勝手に吸い込まれた！'], c: ['今日の運勢、大吉です。'] },
      bonusKick: { p: ['「{p}」がもう一回蹴った！'], c: ['蛇足ですが、蛇がちょっとかわいくなりました。'] },
      fight: { p: ['「{p}」がボールそっちのけで「{o}」に「{move}」！', '審判はいない！「{p}」の「{move}」！'], c: ['これはサッカーですか、リングですか？', 'この字、リングで見たことあります。', 'ルールブックには禁止と書いてないんですよね。'] },
      fightHit: { p: ['「{o}」が吹っ飛んだ！'], c: ['実況席まで痛みが伝わってきます。'] },
      brawl: { p: ['乱闘だー！！', 'ボールは？誰も見てない！'], c: ['字形乱闘へようこそ……いえ、サッカーです。', '警備員！あ、いないんでした。'] },
      brawlEnd: { p: ['乱闘終了、みんなボールを思い出した。'], c: ['今のは見なかったことに。'] },
      timeUp: { p: ['タイムアップ！'], c: ['ポップコーンも尽きました。'] },
      goldenGoal: { p: ['同点！Vゴール方式の延長へ！'], c: ['心臓の弱い方はお茶をどうぞ。'] },
      finish: { p: ['試合終了！{team}の勝利！'], c: ['この試合は辞書のスポーツ欄に載るでしょう。'] },
      draw: { p: ['試合終了、引き分けです！'], c: ['仲良きことは美しきかな。'] },
    },
    crowd: {
      pre: ['早く始めて！', '文字のサッカー見に来た', 'このチーム名なんて読むの？', '{team}が勝つ！', 'お母さん、テレビに映ってる！', '前の人しゃがんで！', '何点入るかな', '{team}にたこ焼き賭けた'],
      idle: ['{team}がんばれー！', 'パス！パス！', 'シュート打てー！', '走れー！', '守れー！', '{team}！{team}！', 'あの字、走り方かわいい', '審判は？いないのか', 'よくわからないけど燃える', '前へ蹴れー！'],
      goal: ['入ったー！！', 'ゴーーール！', '{team}最高！', 'このゴール一生自慢する！', 'ナイス！', '「{p}」愛してる！'],
      conceded: ['キーパー何してんの！', '金返せー！', '次！次！', 'まだまだこれから！', 'あーあ……'],
      shot: ['いいシュート！', 'おしい！', 'うわー！', 'もう一本！'],
      save: ['神セーブ！', '止めたー！', 'あのキーパー壁でしょ', 'ナイスキーパー！'],
      skill: ['必殺技きた！', '「{p}」かっこいい！', 'その技リングで見た！', 'めちゃくちゃだ！'],
      knock: ['痛そう！', 'いたたた', 'ファウルじゃないの？', '倒れた！'],
      combo: ['連携きたー！', '四文字の息ぴったり！', '国語の授業かな？'],
      culture: ['そのネタ知ってる！', '「{team}」がやらかした！', '名場面！', 'なんだそれｗｗ'],
      rivalry: ['宿敵だ！', '今日こそ決着！', 'このカード熱すぎ'],
      post: ['カーン！ポスト！', 'おしい！！', 'あと少し！'],
      win: ['勝ったー！！', '{team}優勝！', '今夜はたこ焼きでお祝い！'],
      lose: ['また来年……', 'それでも好きだよ', '帰ろう……'],
      draw: ['引き分けもいいね', '仲良きことは美しきかな', 'もう一試合やって！'],
      brawl: ['乱闘だ！', 'やれー！', 'これを見に来た', '昇龍拳！', 'ボールあっちだよ！', 'リングより熱い'],
    },
    idle: ['サッカー場の文字はリングの文字よりよく走りますね。', 'スポンサー：たこ焼き屋さん、ゴール1点につき1個サービス。', 'この芝生、昨日わたしが「字」の形に刈りました。', '私がキーパーならゴールの中でお茶を飲みます。', '四文字でサッカー、四人で麻雀より賑やかです。'],
  },
  en: {
    speakers: ['Commentator “口”', 'Pundit “舌”'],
    events: {
      kickoff: { p: ['{team} kick off!', 'And we’re under way!'], c: ['I’ve bet three pancakes on at least five goals.'] },
      goal: { p: ['IT’S IN!!! “{p}” scores! {s}!', 'GOOOAL! “{p}”!!'], c: ['My grandma would cry at that finish.', 'The keeper was thinking about dinner.'] },
      skillGoal: { p: ['The special “{move}” rips into the net! “{p}”!'], c: ['That’s not football, that’s a physics victory.'] },
      comboGoal: { p: ['{team}’s combo “{combo}” — perfect goal!'], c: ['Four glyphs, steadier than my Wi-Fi.'] },
      ownGoal: { p: ['Oh no! “{p}” puts it into their own net!'], c: ['Maybe it just loves its own goal too much.'] },
      save: { p: ['Great save by “{p}”!', '“{p}” palms it away!'], c: ['From any angle, that glyph is a wall.'] },
      post: { p: ['CLANG! Off the woodwork!'], c: ['The post is having the game of its life.'] },
      skill: { p: ['Special move! “{p}” with “{move}”!'], c: ['Same move flattened people in the ring.', 'New sport, same nonsense.'] },
      combo: { p: ['{team} trigger the combo “{combo}”!'], c: ['Idiom teachers everywhere are weeping.'] },
      culture: { p: ['{team} pull off the culture combo “{combo}”!', 'Here it is — {team}’s “{combo}”!'], c: ['I get the reference. Does the ball?', 'Put those four glyphs together and weird things happen.'] },
      backfire: { p: ['Oops — “{combo}” backfires!'], c: ['Long joke, short legs.', 'Super effective. Side effects: also super effective.'] },
      rivalry: { p: ['Grudge match: “{label}”!', 'Heads up — this one is “{label}”!'], c: ['Put those two team names side by side and something was bound to happen.'] },
      tackleWin: { p: ['“{p}” wins it back!'], c: ['Like grabbing the last dumpling.'] },
      knockdown: { p: ['“{p}” is down!'], c: ['No referee, so it’s not a foul.'] },
      luckyBounce: { p: ['LUCKY! It bounces in by itself!'], c: ['Today’s fortune: excellent.'] },
      bonusKick: { p: ['“{p}” gives it one more whack!'], c: ['Gilding the lily, but the lily looks great.'] },
      fight: { p: ['“{p}” forgets the ball and hits “{o}” with “{move}”!', 'No referee! “{p}” uses “{move}”!'], c: ['Is this football or the boxing ring?', 'I’ve seen this glyph in the ring before.', 'Technically the rulebook doesn’t forbid it.'] },
      fightHit: { p: ['“{o}” goes flying!'], c: ['I felt that one up in the booth.'] },
      brawl: { p: ['IT’S A BRAWL!!', 'Ball? Nobody cares about the ball!'], c: ['Welcome back to Glyph Rumble… I mean, Soccer.', 'Security! Oh right, we don’t have any.'] },
      brawlEnd: { p: ['Brawl over — they remember there’s a ball.'], c: ['Let’s all forget that happened.'] },
      timeUp: { p: ['Time’s up!'], c: ['And so is my popcorn.'] },
      goldenGoal: { p: ['Level! Golden goal — next goal wins!'], c: ['Weak hearts, please have some tea.'] },
      finish: { p: ['Full time! {team} win!'], c: ['This one goes in the sports section of the dictionary.'] },
      draw: { p: ['Full time — honours even!'], c: ['Peace is profitable.'] },
    },
    crowd: {
      pre: ['Kick it off already!', 'I came to see letters play football', 'How do you even read that team name?', '{team} all the way!', 'Mom, I’m on TV!', 'Down in front!', 'How many goals today?', 'I bet a pancake on {team}'],
      idle: ['Come on {team}!', 'Pass it!', 'SHOOT!', 'Run, run!', 'Defend!', '{team}! {team}!', 'That glyph runs so cute', 'Ref? Oh, there’s no ref', 'No idea what’s going on, love it', 'Get it forward!'],
      goal: ['GOAAAL!', 'YES!!!', '{team} forever!', 'I’ll talk about this goal for years!', 'Beautiful!', 'We love you “{p}”!'],
      conceded: ['Keeper, wake up!', 'Refund!', 'Next one! Next one!', 'Still plenty of time!', 'Ugh…'],
      shot: ['What a strike!', 'So close!', 'Whoa!', 'Again!'],
      save: ['What a save!', 'Denied!', 'That keeper is a wall', 'Great hands!'],
      skill: ['Special move!', '“{p}” is so cool!', 'Saw that move in the ring!', 'That’s ridiculous!'],
      knock: ['Ouch!', 'That hurt', 'No foul?!', 'Man down!'],
      combo: ['COMBO!!', 'Those four are in sync!', 'Is this an idiom class?'],
      culture: ['I get that reference!', '“{team}” are up to something!', 'Iconic!', 'What even was that'],
      rivalry: ['RIVALS!', 'Settle it today!', 'What a matchup'],
      post: ['CLANG! The post!', 'Unlucky!!', 'Inches away!'],
      win: ['WE WON!!', '{team} champions!', 'Pancakes tonight!'],
      lose: ['Next year…', 'Still love you', 'Let’s go home…'],
      draw: ['A draw’s fine', 'Everyone’s a winner', 'Play another one!'],
      brawl: ['FIGHT!', 'Get him!', 'This is why I bought a ticket', 'Uppercut!', 'The ball’s over there!', 'Better than the ring'],
    },
    idle: ['Glyphs on a pitch run more than glyphs in a ring.', 'Our sponsor: the pancake stand — a free egg for every goal.', 'I mowed this grass into a 字 yesterday.', 'If I were the keeper I’d sit in the goal and drink tea.', 'Four glyphs playing football is louder than four people playing mahjong.'],
  },
};
