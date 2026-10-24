/**
 * Team combos (成语连携 / 双字连携): the second layer of ability. When a team's players spell a
 * registered idiom or word, the team gets one extra team move with its own trigger condition,
 * cooldown and real effect in the simulation. Unregistered teams play normally — no free buff.
 * The idiom is team information, never a fifth player.
 */
import type { MoveName } from '../core/SignatureMoves';
import type { TeamInput } from './team';

export type Sport = 'soccer' | 'basketball';

export type SoccerComboKind =
  | 'dragonDance' // 龙飞凤舞: aerial passing chain → curling finish
  | 'calmSea' // 风平浪静: steady — no knock-downs, safe passing
  | 'fuelFire' // 火上浇油: every pass heats up the next shot
  | 'extraFoot' // 画蛇添足: a bonus kick after a shot (might go in, might not)
  | 'sleeperShot' // 一鸣惊人: quiet, then a sudden long-range thunderbolt
  | 'tigerTail' // 虎头蛇尾: storming start, sloppy finish
  | 'surround' // 四面楚歌: all four close down the ball carrier
  | 'skyHorse' // 天马行空: ball bounced sky-high, relayed through the air
  | 'henhouse' // 鸡飞狗跳: everyone runs wild, the ball bounces crazy
  | 'scramble' // 乱七八糟: shuffles the opponents' positions
  | 'lawless' // 无法无天: harder tackles, sloppier defence
  | 'goodLuck'; // 大吉大利: one lucky bounce

export type BasketballComboKind = 'iceFire' | 'swap' | 'leftRight' | 'highLow' | 'trueFalse' | 'loveHate' | 'yinYang' | 'lastStand' | 'brothers' | 'sisters' | 'parents' | 'fishFlip' | 'awesomeDunk';

export interface ComboEntry<K extends string = string> {
  keys: string[];
  sport: Sport;
  kind: K;
  name: MoveName;
  /** One-line effect description (ja / zh / en) for the team card and docs. */
  desc: MoveName;
}

const n = (ja: string, zh: string, en: string): MoveName => ({ ja, zh, en });

export const SOCCER_COMBOS: ComboEntry<SoccerComboKind>[] = [
  { sport: 'soccer', keys: ['龙飞凤舞', '龍飛鳳舞'], kind: 'dragonDance', name: n('飛竜乱舞', '飞龙乱舞', 'Dragon & Phoenix Dance'), desc: n('空中パスをつないで最後はカーブシュート', '连续空中传球，最后弧线射门', 'Aerial passing chain, then a curling shot') },
  { sport: 'soccer', keys: ['风平浪静', '風平浪靜'], kind: 'calmSea', name: n('風平浪静', '风平浪静', 'Calm Seas'), desc: n('しばらく倒されず、パスが正確になる', '一段时间内不会被撞倒，传球更稳', 'For a while: no knock-downs, safer passes') },
  { sport: 'soccer', keys: ['火上浇油', '火上澆油'], kind: 'fuelFire', name: n('火に油', '火势升级', 'Fanning the Flames'), desc: n('パスがつながるほど次のシュートが燃え上がる', '传球越多，下一脚射门火力越强', 'Each pass powers up the next shot') },
  { sport: 'soccer', keys: ['画蛇添足', '畫蛇添足'], kind: 'extraFoot', name: n('蛇足キック', '多此一脚', 'One Kick Too Many'), desc: n('シュートの後にもう一蹴り。入るか外れるかは運次第', '射门后再补一脚，可能进也可能踢飞', 'A bonus kick after a shot — in or wildly off') },
  { sport: 'soccer', keys: ['一鸣惊人', '一鳴驚人'], kind: 'sleeperShot', name: n('驚天の一撃', '惊天一脚', 'Out of Nowhere'), desc: n('目立たず力をため、突然の超ロングシュート', '平时不起眼，蓄满后突然远射', 'Charges quietly, then a sudden long-range rocket') },
  { sport: 'soccer', keys: ['虎头蛇尾', '虎頭蛇尾'], kind: 'tigerTail', name: n('竜頭蛇尾', '虎头蛇尾', 'Tiger Head, Snake Tail'), desc: n('序盤は猛攻、終盤はグダグダ', '开局猛攻，后半段容易失控', 'Storms early, falls apart late') },
  { sport: 'soccer', keys: ['四面楚歌'], kind: 'surround', name: n('包囲作戦', '包围战术', 'Surrounded!'), desc: n('4人で四方からボール保持者を囲む', '四人从四个方向压迫持球者', 'All four close in on the ball carrier') },
  { sport: 'soccer', keys: ['天马行空', '天馬行空'], kind: 'skyHorse', name: n('空中リレー', '空中接力', 'Sky Relay'), desc: n('ボールを高く打ち上げ、空中でつなぐ', '把球高高挑起，空中连续传递', 'Pops the ball sky-high and relays it in the air') },
  { sport: 'soccer', keys: ['鸡飞狗跳', '雞飛狗跳'], kind: 'henhouse', name: n('てんやわんや', '全场暴走', 'Total Chaos'), desc: n('全員が走り回り、ボールが変な方向に弾む', '全员乱跑乱滑，球乱弹', 'Everyone runs wild; the ball bounces crazy') },
  { sport: 'soccer', keys: ['乱七八糟', '亂七八糟'], kind: 'scramble', name: n('しっちゃかめっちゃか', '混乱足球', 'Mixed-Up Football'), desc: n('相手の配置をめちゃくちゃにする', '短时间打乱对手的跑位', 'Scrambles the opponents’ positions') },
  { sport: 'soccer', keys: ['无法无天', '無法無天'], kind: 'lawless', name: n('やりたい放題', '野蛮突破', 'Lawless Rush'), desc: n('タックルが強くなるが守備が雑になる', '身体对抗增强，防守纪律下降', 'Harder tackles, sloppier defence') },
  { sport: 'soccer', keys: ['大吉大利'], kind: 'goodLuck', name: n('大吉！', '好运来了', 'Lucky Day'), desc: n('一度だけ幸運なバウンドが起きる', '一次射门获得幸运弹跳', 'One shot gets a lucky bounce') },
];

export const BASKETBALL_COMBOS: ComboEntry<BasketballComboKind>[] = [
  { sport: 'basketball', keys: ['冰火'], kind: 'iceFire', name: n('氷火二重天', '冰火两重天', 'Fire & Ice'), desc: n('氷が滑らせ、火がダンク', '冰制造滑行空间，火完成灌篮', 'Ice clears the lane, fire dunks') },
  { sport: 'basketball', keys: ['黑白', '黒白'], kind: 'swap', name: n('白黒チェンジ', '黑白交换', 'Black & White Swap'), desc: n('二人が突然入れ替わる', '两人突然交叉换位', 'The two suddenly swap places') },
  { sport: 'basketball', keys: ['左右'], kind: 'leftRight', name: n('左右開弓', '左右开弓', 'Left-Right Combo'), desc: n('左右からフェイクとパス', '左右两侧连续假动作与传球', 'Fakes and passes from both sides') },
  { sport: 'basketball', keys: ['上下'], kind: 'highLow', name: n('上下挟撃', '上下夹攻', 'High-Low'), desc: n('低く切り込み、高くアリウープ', '一人低位突破，一人高空接力', 'One drives low, one finishes high') },
  { sport: 'basketball', keys: ['真假'], kind: 'trueFalse', name: n('真偽不明', '真假难辨', 'Real or Fake'), desc: n('偽がフェイク、真が本当のシュート', '假负责假动作，真完成投篮', 'Fake fakes, real shoots') },
  { sport: 'basketball', keys: ['爱恨', '愛恨'], kind: 'loveHate', name: n('愛憎パス', '爱恨交织', 'Love-Hate Passing'), desc: n('引き合い弾き合う高速パス', '吸引与排斥式快速传球', 'Push-pull lightning passes') },
  { sport: 'basketball', keys: ['阴阳', '陰陽'], kind: 'yinYang', name: n('陰陽反転', '阴阳反转', 'Yin-Yang Flip'), desc: n('攻守の位置が入れ替わる', '进攻与防守位置快速交换', 'Offence and defence spots flip') },
  { sport: 'basketball', keys: ['生死'], kind: 'lastStand', name: n('起死回生', '绝境反击', 'Last Stand'), desc: n('負けている時に一度だけ強力な連携', '比分落后时发动一次强力配合', 'Once, when behind: a power play') },
  { sport: 'basketball', keys: ['兄弟'], kind: 'brothers', name: n('兄弟一心', '兄弟齐心', 'Brothers in Arms'), desc: n('素早いワンツーからアリウープ', '快速二次传球接空中接力', 'Quick give-and-go into an alley-oop') },
  { sport: 'basketball', keys: ['姐妹'], kind: 'sisters', name: n('以心伝心', '默契满分', 'Perfect Sync'), desc: n('高速で入れ替わって正確なパス', '高速换位后精准传球', 'Fast switch, pinpoint pass') },
  { sport: 'basketball', keys: ['爸妈', '爸媽'], kind: 'parents', name: n('家族の連携', '家庭合作', 'Family Teamwork'), desc: n('お茶碗パスからリモコン曲がりシュート', '饭碗型传球接遥控器转弯投篮', 'Rice-bowl pass into a remote-control curl shot') },
  { sport: 'basketball', keys: ['摸鱼'], kind: 'fishFlip', name: n('サボりからの逆襲', '咸鱼翻身', 'Lazy Fish Flip'), desc: n('寝転んで滑り、突然起きてシュート', '先倒地滑行，再意外弹起投篮', 'Slides lying down, pops up to shoot') },
  { sport: 'basketball', keys: ['牛逼', '牛B'], kind: 'awesomeDunk', name: n('すげぇダンク', '牛逼暴扣', 'Mega Dunk'), desc: n('二人でためて大げさなダンク', '双人蓄力后完成夸张灌篮', 'Both charge up for an absurd dunk') },
];

/** The combo a team spells, if any. Split teams use their word; free teams their members in order. */
export function comboFor<K extends string>(table: ComboEntry<K>[], team: Pick<TeamInput, 'word' | 'members'>): ComboEntry<K> | null {
  const word = (team.word ?? team.members.join('')).normalize('NFC');
  return table.find((c) => c.keys.some((k) => k === word)) ?? null;
}
