/**
 * Glyph Basketball audio. Two kinds of entries:
 *  - reused: clips the arena and the football game already have (crowd, fanfare, special-move
 *    sounds, whistle, fight hits, culture sting …) — copied into public/audio/;
 *  - new (`batch: 'basketball'`): basketball sounds that don't exist yet. `npm run docs:audio`
 *    exports ONLY these as docs/audio/audio_requirements.json for Audio Batch Studio.
 * Missing files fall back to synthesized sounds (Sfx.ts).
 */
import type { MatchEvent } from '../sim/types';

export type AudioCategory = 'SFX' | 'Ambience' | 'BGM';

export interface AudioReq {
  id: string;
  filename: string;
  name: string;
  category: AudioCategory;
  duration: number;
  prompt: string;
  notes: string;
  batch?: 'basketball';
}

const reuse = (id: string, category: AudioCategory = 'SFX'): AudioReq => ({ id, filename: `${id}.wav`, name: id, category, duration: 1, prompt: '', notes: 'reused' });
const req = (id: string, name: string, category: AudioCategory, duration: number, prompt: string, notes: string): AudioReq => ({ id, filename: `${id}.wav`, name, category, duration, prompt, notes, batch: 'basketball' });

/** Reused clips (arena + football). */
export const REUSED = [
  'crowd_cheer', 'crowd_ooh', 'crowd_gasp', 'crowd_laugh', 'victory_fanfare', 'draw_sad_trombone', 'signature_start', 'whoosh_dash', 'pop_boing', 'stomp',
  'quake_rumble', 'freeze_ice', 'snore', 'dizzy_tweets', 'laugh_giggle', 'coin_rain', 'charm_sparkle', 'magnet_hum', 'poison_bubble', 'prop_impact',
  'shield_reflect', 'vanish_glitch', 'heal_chime', 'beam_laser', 'flame_burst', 'trip_stumble', 'ui_click', 'ui_dice_roll', 'ui_camera_shutter',
  'reappear_pop', 'meteor_fall', 'roar_lion', 'time_up_buzzer', 'joke_rimshot', 'hit_light', 'hit_heavy', 'throw_heave', 'dodge_swish', 'ko_bell',
  'whistle_kickoff', 'brawl_start', 'culture_sting', 'rivalry_horn', 'box_thud', 'backfire_boing', 'chain_pass', 'swap_poof',
];

export const AUDIO: AudioReq[] = [
  ...REUSED.map((id) => reuse(id)),
  reuse('crowd_ambience', 'Ambience'),
  reuse('bgm_menu', 'BGM'),
  reuse('bgm_result', 'BGM'),
  // ---- new for basketball ----
  req('dribble_bounce', '运球', 'SFX', 1.0, 'single basketball bounce on a hardwood floor, indoor gym, short and punchy, no reverb tail', '运球（偶尔）/ 球落地'),
  req('swish_net', '空心入网', 'SFX', 1.0, 'basketball dropping cleanly through a nylon net, soft swish, indoor arena', '投篮命中'),
  req('rim_clank', '打铁', 'SFX', 1.0, 'basketball hitting a metal rim, loud ringing clank with a short wobble, indoor gym', '球碰篮筐'),
  req('backboard_bang', '打板', 'SFX', 1.0, 'basketball hitting a glass backboard, hard flat bang with slight rattle, indoor arena', '球碰篮板'),
  req('dunk_slam', '扣篮', 'SFX', 1.5, 'powerful slam dunk, rim crash and metal spring shake, net whip, arcade sports game impact', '扣篮'),
  req('sneaker_squeak', '球鞋摩擦', 'SFX', 1.0, 'two quick sneaker squeaks on a polished hardwood court, sharp changes of direction', '变向 / 抢断 / 急停'),
  req('shot_release', '出手', 'SFX', 1.0, 'basketball leaving the hands with a soft whoosh and slight spin, close perspective', '投篮出手 / 传球'),
  req('block_swat', '盖帽', 'SFX', 1.0, 'hand swatting a basketball away hard, slap and whoosh, crowd reaction not included', '盖帽'),
  req('buzzer_final', '终场蜂鸣器', 'SFX', 2.0, 'arena game horn buzzer, long loud electronic buzz, basketball end of game', '终场 / 进攻超时'),
  req('bgm_basket', '篮球比赛 BGM', 'BGM', 90, 'upbeat arcade basketball game theme, funky bass, hip-hop drum groove, brass stabs, energetic and playful, no vocals', '比赛中循环播放'),
  req('crowd_gym', '篮球馆观众', 'Ambience', 20, 'indoor basketball arena crowd murmur with scattered claps and sneaker squeaks in the distance, no music', '比赛中背景循环'),
];

/** Which clips an event plays (missing files fall back to synth). */
export function audioForEvent(e: MatchEvent): string[] {
  switch (e.type) {
    case 'tipoff': return e.a < 0 ? ['whistle_kickoff'] : [];
    case 'pass': return ['shot_release'];
    case 'shot': return (e.v ?? 2) === 3 ? ['shot_release', 'crowd_ooh'] : ['shot_release'];
    case 'score': return e.kind === 'dunk' ? ['swish_net', 'crowd_cheer'] : (e.v ?? 2) === 3 ? ['swish_net', 'crowd_cheer'] : ['swish_net'];
    case 'dunk': return e.kind === 'super' ? ['dunk_slam', 'crowd_cheer'] : ['dunk_slam'];
    case 'airCrash': return ['hit_heavy', 'crowd_ooh'];
    case 'rim': return ['rim_clank'];
    case 'board': return ['backboard_bang'];
    case 'block': return ['block_swat', 'crowd_ooh'];
    case 'steal':
    case 'intercept': return ['sneaker_squeak'];
    case 'bounce': return e.kind === 'box' ? ['box_thud'] : (e.v ?? 0) > 4 ? ['dribble_bounce'] : [];
    case 'shotClock': return ['buzzer_final'];
    case 'knockdown': return ['stomp'];
    case 'skill': return ['signature_start', ...skillClip(e.kind)];
    case 'combo': return ['culture_sting', 'crowd_cheer'];
    case 'prim': return primClip(e.kind);
    case 'rivalry': return ['rivalry_horn', 'crowd_cheer'];
    case 'luckyRoll': return ['charm_sparkle', 'crowd_laugh'];
    case 'fight': return e.kind === 'flyingKick' ? ['whoosh_dash'] : e.kind === 'roar' ? ['roar_lion'] : e.kind === 'slam' ? ['quake_rumble'] : e.kind === 'freeze' ? ['freeze_ice'] : e.kind === 'throw' ? ['throw_heave'] : [];
    case 'fightHit': return (e.v ?? 1) >= 2 ? ['hit_heavy', 'crowd_ooh'] : ['hit_heavy'];
    case 'fightMiss': return ['dodge_swish'];
    case 'brawl': return ['brawl_start', 'crowd_cheer'];
    case 'buzzer': return ['buzzer_final'];
    case 'overtime': return ['time_up_buzzer', 'crowd_ooh'];
    case 'finish': return e.v === -1 ? ['draw_sad_trombone'] : ['victory_fanfare', 'crowd_cheer'];
    default: return [];
  }
}

function primClip(kind?: string): string[] {
  if (kind?.startsWith('risk:')) return ['backfire_boing', 'crowd_laugh'];
  switch (kind) {
    case 'giveAndGo':
    case 'swapPass':
    case 'curvePass': return ['chain_pass'];
    case 'obstacle': return ['box_thud'];
    case 'swap': return ['swap_poof'];
    case 'pushWave': return ['quake_rumble'];
    case 'stunCarrier': return ['freeze_ice'];
    case 'slowZone': return ['poison_bubble'];
    case 'markWrong':
    case 'decoyBall': return ['dizzy_tweets'];
    case 'spotlight':
    case 'lucky': return ['charm_sparkle'];
    case 'paintWall':
    case 'blockBoost': return ['shield_reflect'];
    case 'sprint':
    case 'fastBreak':
    case 'crossover': return ['sneaker_squeak'];
    case 'lowGravity': return ['heal_chime'];
    case 'recover': return ['heal_chime'];
    default: return [];
  }
}

function skillClip(kind?: string): string[] {
  switch (kind) {
    case 'beamShot': return ['beam_laser'];
    case 'skyShot': return ['meteor_fall'];
    case 'powerShot': return ['flame_burst'];
    case 'dash': return ['whoosh_dash'];
    case 'curveShot': return ['sneaker_squeak'];
    case 'blink': return ['vanish_glitch'];
    case 'decoy': return ['reappear_pop'];
    case 'shockwave': return ['quake_rumble'];
    case 'disable': return ['freeze_ice'];
    case 'steal': return ['magnet_hum'];
    case 'rain': return ['prop_impact'];
    case 'cloud': return ['poison_bubble'];
    case 'wall': return ['shield_reflect'];
    case 'rally': return ['heal_chime'];
    default: return [];
  }
}
