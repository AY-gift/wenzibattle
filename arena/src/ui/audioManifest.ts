/**
 * Audio manifest: every sound the game wants, written in the Audio Batch Studio requirement
 * format (see docs/audio/). `npm run docs:audio` exports it as audio_requirements.json.
 * Generated .wav files dropped into public/audio/ (then `npm run audio:index`) replace the
 * synthesized fallback sounds automatically.
 */
import type { BattleEvent } from '../core/battle/types';

export type AudioCategory = 'SFX' | 'Ambience' | 'BGM';

export interface AudioReq {
  id: string;
  filename: string;
  /** Human-readable name (Chinese, shown in the requirement list). */
  name: string;
  category: AudioCategory;
  /** Seconds, 1.0–120.0. */
  duration: number;
  /** Stable Audio prompt: what it's made of, how it decays, where it happens. */
  prompt: string;
  /** When it plays (for people; not sent to the model). */
  notes: string;
  /** Requirement batch: 'v2' entries are exported to their own file (docs/audio/v2/). */
  batch?: 'v2';
}

const sfx = (id: string, name: string, duration: number, prompt: string, notes: string): AudioReq => ({ id, filename: `${id}.wav`, name, category: 'SFX', duration, prompt, notes });
const sfx2 = (id: string, name: string, duration: number, prompt: string, notes: string): AudioReq => ({ ...sfx(id, name, duration, prompt, notes), batch: 'v2' });

export const AUDIO: AudioReq[] = [
  // ---- UI ----
  sfx('ui_click', '界面按钮点击', 1.0, 'soft rounded plastic toy button click, one short bright tap, clean, no reverb', '所有按钮点击'),
  sfx('ui_dice_roll', '随机骰子', 1.5, 'small plastic dice rattling in a cup and tumbling onto a wooden table, playful, short', '🎲 随机选手 / 随机对决'),
  sfx('ui_fighter_drop', '选手落地预览', 1.0, 'cartoon toy figure dropping onto a padded mat, a single soft bouncy thud with a tiny spring boing', '选人界面里新文字掉进擂台'),
  sfx('ui_fight_button', '开战按钮', 1.5, 'big arcade start button press, punchy whoosh rising into a bright chime', '点击「开战！」'),
  sfx('ui_camera_shutter', '保存图片', 1.0, 'one crisp camera shutter click, short, dry', '保存图片 / 分享'),
  // ---- match flow ----
  sfx('bell_round_start', '开场铃', 2.0, 'classic boxing ring bell, two quick metallic dings in a large indoor arena, natural decay', '事件 fight：比赛开始'),
  sfx('time_up_buzzer', '时间到蜂鸣', 1.5, 'arena buzzer horn, a single short loud electronic buzz, game show style', '事件 timeUp'),
  sfx('sudden_death_alarm', '决胜时刻警报', 2.0, 'comedic warning siren rising in pitch, cartoon alarm, urgent but playful', '事件 suddenDeath：最后 5 秒，围绳变松'),
  sfx('ko_bell', 'KO 铃', 2.5, 'boxing knockout bell ringing rapidly many times, bright metallic dings, arena reverb', '事件 ko'),
  sfx('victory_fanfare', '胜利号角', 4.0, 'short triumphant brass fanfare, cheerful cartoon game victory jingle with a bright final chord', '事件 finish（有胜者）'),
  sfx('draw_sad_trombone', '平局悲伤长号', 3.0, 'sad trombone wah wah wah wah, comedic failure, dry studio', '事件 finish（平局）'),
  // ---- basic combat ----
  sfx('hit_light', '普通命中', 1.0, 'cartoon punch impact, soft rubber thump with a tiny squeak, one short hit', '事件 hit'),
  sfx('hit_heavy', '会心一击', 1.0, 'heavy cartoon punch impact, deep boom with a sharp slap transient, punchy, short tail', '事件 crit'),
  sfx('clash', '正面对撞', 1.0, 'two hard plastic toys colliding head-on, loud clack with a short metallic ring', '事件 clash'),
  sfx('whoosh_dash', '冲刺', 1.0, 'fast swoosh of a small object dashing past, airy and quick', '事件 dash'),
  sfx('dodge_swish', '闪避', 1.0, 'light quick swish like a flicked cloth, nimble', '事件 dodge'),
  sfx('land_thud', '落地', 1.0, 'toy figure landing on a padded boxing ring canvas, muffled thud with a slight bounce', '事件 land'),
  sfx('rope_bounce', '撞围绳', 1.5, 'boxing ring ropes stretching and twanging, elastic rubber band boing, comedic', '事件 ropeBounce'),
  sfx('rope_slingshot', '围绳弹弓', 1.5, 'big elastic slingshot release, rubber band twang into a fast whoosh', '事件 slingshot'),
  sfx('fall_whistle', '掉出擂台', 2.0, 'cartoon falling slide whistle with descending pitch, comedic', '事件 overRope / fallOff'),
  sfx('floor_crash', '摔到台下', 1.5, 'toy crashing onto a hard wooden floor, clattering thud and a small bounce', '事件 ringout'),
  sfx('corner_post_crash', '撞角柱', 1.0, 'body slamming into a padded metal turnbuckle post, dull clang with a padded thump', '事件 wallCrash / slam'),
  sfx('trip_stumble', '绊倒滑倒', 1.0, 'cartoon stumble, quick skid then a floppy flop, comedic', '事件 trip / slip / doubleDown / laughFall'),
  sfx('pop_boing', '顶牛弹开', 1.0, 'big cartoon spring boing, bouncy and silly', '事件 pop / hop / pounce'),
  sfx('stomp', '踩踏', 1.0, 'heavy cartoon stomp from above, deep thump with a crunch', '事件 stomp'),
  // ---- passive traits ----
  sfx('flame_burst', '喷火', 1.5, 'short whoosh of fire breath, crackling flame burst', '事件 flame / burn'),
  sfx('steam_hiss', '火被浇灭', 1.0, 'water hitting hot metal, one quick steam hiss', '事件 steam'),
  sfx('gas_puff', '神秘气流', 1.5, 'comedic mysterious gust of air, airy whoosh with a goofy low flutter', '事件 gas'),
  sfx('charm_sparkle', '魅惑', 1.5, 'magical sparkle chime with soft twinkles, cute love effect', '事件 charm'),
  sfx('snore', '睡觉', 2.0, 'one long soft cute cartoon snore, gentle whistle at the end', '事件 sleep'),
  sfx('zap_electric', '电击', 1.0, 'electric zap, crackling short-circuit buzz, quick', '事件 zap'),
  sfx('fuse_hiss', '引信', 2.0, 'lit fuse hissing and sparkling, steady crackle', '事件 fuse（自爆前）'),
  sfx('explosion_big', '大爆炸', 2.5, 'big cartoon explosion, deep boom with scattering debris, arena reverb', '事件 explode'),
  sfx('dizzy_tweets', '转晕', 1.5, 'cartoon dizzy effect, twinkling bird tweets circling, whimsical', '事件 dizzy / confuse'),
  sfx('laugh_giggle', '笑', 2.0, 'giggly cartoon laughter of a small character, playful, high pitched', '事件 laugh'),
  // ---- signature moves ----
  sfx('signature_start', '必杀技发动', 2.0, 'dramatic anime special move activation, rising energy swell ending in a sharp impact sting', '事件 signature（所有必杀技的开场）'),
  sfx('quake_rumble', '震地', 2.0, 'heavy ground slam, deep rumble and a booming shockwave thump', '事件 quake（震地 / 泰山压顶 / 巨大倒地 / MOAI CRASH）'),
  sfx('tremor_laugh', '笑到地震', 1.5, 'short rumbling tremor with rattling objects, comedic shake', '事件 tremor'),
  sfx('beam_laser', '光线', 2.0, 'charging energy beam firing, bright sustained laser whoosh', '事件 beam（光线 / 死亡凝视）'),
  sfx('freeze_ice', '冰冻', 1.5, 'ice freezing and crackling, crystalline crunch', '事件 freeze'),
  sfx('heal_chime', '回复', 1.5, 'warm healing chime, gentle ascending sparkle', '事件 heal'),
  sfx('meteor_fall', '陨石下落', 1.5, 'fiery meteor falling from the sky, descending whistling roar', '事件 meteor（无道具）'),
  sfx('meteor_impact', '陨石爆炸', 1.5, 'meteor impact explosion on a stage floor, short heavy boom', '事件 meteorImpact（无道具）'),
  sfx('prop_impact', '道具砸地', 1.0, 'heavy object crashing onto a boxing ring floor, wooden clunk with a rattle', '事件 meteorImpact（GG / 🔨 / 🥞 / 🧋 / 🥚 / ? / ! 等道具）'),
  sfx('keyboard_crash', '键盘砸地', 1.5, 'computer keyboard smashing onto the floor, plastic keycaps scattering everywhere', '键盘侠「网络暴击」落地'),
  sfx('table_flip_crash', '掀桌', 1.5, 'wooden table flipped over and crashing down, comedic clatter', '颜文字「掀桌奥义」落地'),
  sfx('throw_heave', '过肩摔', 1.5, 'heavy whoosh of a shoulder throw ending in one solid thud', '事件 throw'),
  sfx('shield_reflect', '护盾反弹', 1.0, 'metallic shield clang, bright ping reflecting an attack', '事件 reflect（铁壁 / 躺平 / 懒得打了）'),
  sfx('roar_lion', '咆哮', 2.0, 'cartoon lion roar, big but playful, short', '事件 roar'),
  sfx('magnet_hum', '吸引', 1.5, 'magnetic pull hum, rising wobbly synth tone', '事件 magnet'),
  sfx('poison_bubble', '毒雾', 1.5, 'bubbling toxic goo, gurgling bubbles', '事件 poison'),
  sfx('coin_rain', '撒钱', 2.0, 'shower of coins falling and jingling on a floor', '事件 bribe'),
  sfx('lecture_drone', '讲课催眠', 2.0, 'boring monotone murmur, muffled lecture hall drone, sleepy', '事件 lecture'),
  sfx('chomp_bite', '咬', 1.0, 'big cartoon bite chomp, crunchy', '事件 chomp'),
  sfx('joke_rimshot', '冷笑话', 1.5, 'drum rimshot ba dum tss, dry', '事件 joke'),
  sfx('giant_grow', '巨大化', 1.5, 'cartoon growing effect, rising pitch stretchy inflation sound', '事件 giant'),
  sfx('swallow_gulp', '一口吞掉', 1.0, 'one big cartoon gulp swallow, wet and comedic', '事件 swallow'),
  sfx('spit_cannon', '吐出去', 1.5, 'comedic spit-out pop followed by a cannon-like whoosh', '事件 spit'),
  sfx('fish_slap', '鱼拍脸', 1.0, 'wet floppy fish slap, splashy smack', '事件 slap（摸鱼大师）'),
  sfx('frying_pan_clang', '锅砸人', 1.0, 'frying pan hitting something, loud comedic metal bong', '事件 blameReflect（甩锅）'),
  sfx('vanish_glitch', '消失', 1.0, 'digital glitch stutter, one short bitcrushed blip', '事件 vanish（404 等）'),
  sfx('reappear_pop', '背后出现', 1.0, 'quick magical pop as something appears', '事件 surprise'),
  sfx('feint_whistle', '假动作', 1.0, 'playful teasing slide whistle going up', '事件 feint'),
  sfx('fire_ignite', '引火烧身', 1.5, 'whoosh of something catching fire, roaring flames', '必杀技「引火烧身」开始'),
  sfx('soot_fizzle', '被熏黑', 1.0, 'small puff of smoke and fizzling embers', '事件 soot'),
  sfx('sweep_stretch', '一刀两断', 1.5, 'rubbery stretching sound, a long elastic stretch then a whoosh', '必杀技「一刀两断」开始'),
  sfx('lazy_yawn', '懒得打了', 1.5, 'soft relaxed cartoon yawn and sigh', '事件 lazy'),
  sfx('countdown_tick', '倒数', 1.0, 'one firm wooden knock with a short bright tick, counting', '事件 countdown（爸「我数到三！」/ おはよう，每数一下播放一次）'),
  sfx('clones_pop', '全家出动', 1.5, 'several small cartoon characters popping in one after another, bouncy plops and tiny cheers', '事件 clones（一家人「全家出动！」）'),
  sfx('lights_out', '一键关灯', 1.5, 'big light switch clicking off followed by a low power-down hum', '事件 lightsOut（晚安「一键关灯」/ おやすみ）'),
  // ---- crowd ----
  { id: 'crowd_ambience', filename: 'crowd_ambience.wav', name: '观众席环境声', category: 'Ambience', duration: 30, prompt: 'indoor arena crowd murmur, distant chatter and occasional claps and whistles, excited but calm, no music', notes: '比赛中持续播放（游戏内循环播放）' },
  sfx('crowd_cheer', '观众欢呼', 3.0, 'arena crowd cheering loudly, applause and whistles', '事件 finish / 必杀技命中'),
  sfx('crowd_ooh', '观众惊叹', 2.0, 'arena crowd reacting with one surprised ooooh', '事件 crit / upset'),
  sfx('crowd_laugh', '观众大笑', 2.5, 'arena crowd bursting into laughter', '事件 doubleDown / trip / laughFall / swallow'),
  sfx('crowd_gasp', '观众倒吸气', 1.5, 'big crowd collective gasp', '事件 overRope / ko'),
  // ---- music ----
  { id: 'bgm_menu', filename: 'bgm_menu.wav', name: '选人界面音乐', category: 'BGM', duration: 60, prompt: 'playful quirky upbeat game menu music, toy piano, pizzicato strings, light percussion, cheerful', notes: '选人界面（游戏内循环播放）' },
  { id: 'bgm_battle', filename: 'bgm_battle.wav', name: '战斗音乐', category: 'BGM', duration: 90, prompt: 'energetic comedic boxing match music, funky brass, driving drums, cartoonish, high energy', notes: '比赛中（游戏内循环播放）' },
  { id: 'bgm_result', filename: 'bgm_result.wav', name: '结算音乐', category: 'BGM', duration: 12, prompt: 'short cheerful celebratory theme, brass and drums, playful ending chord', notes: '结算界面' },
  // ---- V2: move-specific sounds (high-frequency inputs pack) & the commentary skit ----
  sfx2('move_payment_fail', '支付失败', 1.5, 'card payment terminal rejecting a card, two low descending electronic error beeps, comedic', '必杀技 穷「余额不足」/ broke / 破产'),
  sfx2('move_error_beep', '错误提示音', 1.0, 'computer error alert, one harsh short buzz followed by a dull denied tone', '必杀技 密码 / password / 断网 / offline / 蓝屏'),
  sfx2('move_school_bell', '上下课铃', 2.5, 'old electric school bell ringing loudly in a hallway, metallic clatter, natural decay', '必杀技 学生 / student「下课铃响！」/ 老师 / teacher'),
  sfx2('move_microphone', '校长讲话', 2.0, 'microphone tap tap, short squeal of feedback, then a pompous throat clearing', '必杀技 校长「校长讲话」/ 老师「全体起立！」/ 先生'),
  sfx2('move_sneeze', '惊天喷嚏', 1.5, 'huge cartoon sneeze, a rising inhale then an explosive achoo with a wet spray', '必杀技 鼻「惊天喷嚏」'),
  sfx2('move_quack', '鸭子游行', 1.5, 'several rubber ducks quacking one after another, squeaky and silly', '必杀技 鸭 / 🦆「嘎嘎大游行」'),
  sfx2('move_goose_honk', '大鹅追杀', 1.5, 'angry goose honking and hissing aggressively, flapping wings, comedic', '必杀技 鹅「大鹅追杀」'),
  sfx2('move_champagne_pop', '开香槟', 1.5, 'champagne cork popping with a loud pop and fizzing foam spray', '必杀技 赢「半场开香槟」/ W'),
  sfx2('move_loading_spin', '加载中', 2.0, 'digital loading whir slowly rising in pitch, stalling for a moment, then a bright completion ding', '必杀技 加载中 / loading「99% 卡住」'),
  sfx2('move_heart_pop', '爱心连发', 1.5, 'cute bubbly heart pops, three soft rising plinks with a sparkle', '必杀技 爱你 / 520 / 表白 / 好き / 大好き'),
  sfx2('move_like_pop', '点赞', 1.0, 'phone app like button tap, a soft bright pop with a tiny chime', '必杀技 好 / 赞 / 点赞 / 关注「一键三连」'),
  sfx2('move_gacha', '扭蛋机', 2.0, 'capsule toy machine crank turning with clicks, a plastic capsule dropping and popping open', '必杀技 ガチャ「何が出るかな」'),
  sfx2('move_paper_flurry', '纸张乱飞', 1.5, 'stack of paper sheets flapping and scattering in the air, rustling flutter', '必杀技 考试 / 作业 / 白 / 仕事 / exam'),
  sfx2('move_door_slam', '门板拍人', 1.0, 'heavy wooden door slamming shut, loud bang with a short rattle', '必杀技 开「芝麻开门」/ 关「关门大吉」'),
  sfx2('move_lock_click', '上锁', 1.0, 'heavy metal padlock snapping shut, one solid mechanical clack', '必杀技 锁 / 🔒「咔哒上锁」'),
  sfx2('move_rocket', '火箭发射', 2.5, 'small toy rocket ignition, a sharp whoosh roaring upward and fading away', '必杀技 🚀「ROCKET LAUNCH」/ 📈「TO THE MOON」'),
  sfx2('move_cola_fizz', '摇过的可乐', 1.5, 'shaken soda bottle cap bursting open, loud pressurized fizz eruption', '必杀技 可乐「摇过的可乐」'),
  sfx2('move_cream_splat', '奶油糊脸', 1.0, 'cream pie splatting onto a face, wet squishy splat', '必杀技 蛋糕 / cake / 草莓 / 西瓜'),
  sfx2('book_page_flip', '解说读名著', 1.5, 'thick old book being opened, a few dry paper pages turning, close and intimate', '解说桥段：毒舌「舌」开始朗读古典名著'),
];

/** Which audio clips a battle event should play (crowd reactions included). */
export function audioForEvent(e: BattleEvent, winner: 0 | 1 | null | undefined): string[] {
  switch (e.type) {
    case 'fight': return ['bell_round_start'];
    case 'timeUp': return ['time_up_buzzer'];
    case 'suddenDeath': return ['sudden_death_alarm'];
    case 'ko': return ['ko_bell', 'crowd_gasp'];
    case 'finish': return winner === null ? ['draw_sad_trombone'] : ['victory_fanfare', 'crowd_cheer'];
    case 'hit': return ['hit_light'];
    case 'crit': return ['hit_heavy', 'crowd_ooh'];
    case 'upset': return ['crowd_ooh'];
    case 'clash': return ['clash'];
    case 'dash': return ['whoosh_dash'];
    case 'dodge': return ['dodge_swish'];
    case 'land': return ['land_thud'];
    case 'ropeBounce': return ['rope_bounce'];
    case 'slingshot': return ['rope_slingshot'];
    case 'overRope': return ['fall_whistle', 'crowd_gasp'];
    case 'fallOff': return ['fall_whistle'];
    case 'ringout': return ['floor_crash'];
    case 'wallCrash':
    case 'slam': return ['corner_post_crash'];
    case 'trip':
    case 'slip':
    case 'laughFall':
    case 'doubleDown': return ['trip_stumble', 'crowd_laugh'];
    case 'pop':
    case 'hop':
    case 'pounce': return ['pop_boing'];
    case 'stomp': return ['stomp'];
    case 'flame':
    case 'burn': return ['flame_burst'];
    case 'steam': return ['steam_hiss'];
    case 'gas': return ['gas_puff'];
    case 'charm': return ['charm_sparkle'];
    case 'sleep': return ['snore'];
    case 'zap': return ['zap_electric'];
    case 'fuse': return ['fuse_hiss'];
    case 'explode': return ['explosion_big'];
    case 'dizzy':
    case 'confuse': return ['dizzy_tweets'];
    case 'laugh': return ['laugh_giggle'];
    case 'signature':
      if (e.move === 'fireCharge') return ['signature_start', 'fire_ignite'];
      if (e.move === 'sweep') return ['signature_start', 'sweep_stretch'];
      return ['signature_start'];
    case 'quake': return ['quake_rumble'];
    case 'tremor': return ['tremor_laugh'];
    case 'beam': return ['beam_laser'];
    case 'freeze': return ['freeze_ice'];
    case 'heal': return ['heal_chime'];
    case 'meteor': return e.move ? [] : ['meteor_fall'];
    case 'meteorImpact':
      if (!e.move) return ['meteor_impact'];
      if (e.move === '⌨️') return ['keyboard_crash'];
      if (e.move === '┻━┻') return ['table_flip_crash'];
      return ['prop_impact'];
    case 'throw': return e.v ? ['throw_heave'] : [];
    case 'reflect': return ['shield_reflect'];
    case 'roar': return ['roar_lion'];
    case 'magnet': return ['magnet_hum'];
    case 'poison': return ['poison_bubble'];
    case 'bribe': return ['coin_rain'];
    case 'lecture': return ['lecture_drone'];
    case 'chomp': return ['chomp_bite'];
    case 'joke': return ['joke_rimshot'];
    case 'giant': return ['giant_grow'];
    case 'swallow': return ['swallow_gulp', 'crowd_laugh'];
    case 'spit': return ['spit_cannon'];
    case 'slap': return ['fish_slap'];
    case 'blameReflect': return ['frying_pan_clang'];
    case 'vanish': return ['vanish_glitch'];
    case 'surprise': return ['reappear_pop'];
    case 'feint': return ['feint_whistle'];
    case 'soot': return ['soot_fizzle'];
    case 'lazy': return ['lazy_yawn'];
    case 'countdown': return ['countdown_tick'];
    case 'clones': return ['clones_pop', 'crowd_laugh'];
    case 'lightsOut': return ['lights_out', 'crowd_gasp'];
    default: return [];
  }
}
