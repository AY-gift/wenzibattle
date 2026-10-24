/**
 * Glyph Soccer audio. Two kinds of entries:
 *  - reused: clips the arena already has (crowd, fanfare, special-move sounds…) — copied into
 *    public/audio/ by `npm run audio:copy`;
 *  - new (`batch: 'soccer'`): football sounds that don't exist yet. `npm run docs:audio` exports
 *    ONLY these as docs/audio/audio_requirements.json for Audio Batch Studio;
 *  - new in V2 (`batch: 'soccer2'`): fights, culture combos and rivalries → docs/audio/v2/.
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
  /** 'soccer' / 'soccer2' = new requirement for this game (first / second pack); otherwise reused from the arena. */
  batch?: 'soccer' | 'soccer2';
}

const reuse = (id: string, category: AudioCategory = 'SFX'): AudioReq => ({ id, filename: `${id}.wav`, name: id, category, duration: 1, prompt: '', notes: 'reused from arena' });
const req = (id: string, name: string, category: AudioCategory, duration: number, prompt: string, notes: string, batch: AudioReq['batch'] = 'soccer'): AudioReq => ({ id, filename: `${id}.wav`, name, category, duration, prompt, notes, batch });
const req2 = (id: string, name: string, category: AudioCategory, duration: number, prompt: string, notes: string) => req(id, name, category, duration, prompt, notes, 'soccer2');

export const AUDIO: AudioReq[] = [
  // ---- reused from the arena (already generated) ----
  ...['crowd_cheer', 'crowd_ooh', 'crowd_gasp', 'crowd_laugh', 'victory_fanfare', 'draw_sad_trombone', 'signature_start', 'whoosh_dash', 'pop_boing', 'stomp', 'quake_rumble', 'freeze_ice', 'snore', 'dizzy_tweets', 'laugh_giggle', 'coin_rain', 'charm_sparkle', 'magnet_hum', 'poison_bubble', 'prop_impact', 'shield_reflect', 'vanish_glitch', 'heal_chime', 'beam_laser', 'flame_burst', 'trip_stumble', 'ui_click', 'ui_dice_roll', 'ui_camera_shutter', 'reappear_pop', 'meteor_fall', 'roar_lion', 'time_up_buzzer', 'joke_rimshot'].map((id) => reuse(id)),
  ...['hit_light', 'hit_heavy', 'throw_heave', 'dodge_swish', 'ko_bell'].map((id) => reuse(id)),
  reuse('crowd_ambience', 'Ambience'),
  reuse('bgm_menu', 'BGM'),
  reuse('bgm_result', 'BGM'),
  // ---- new for football ----
  req('kick_ball', '踢球', 'SFX', 1.0, 'single soft leather football kick, short punchy thump, close, outdoor, no reverb tail', '传球 / 普通射门'),
  req('kick_power', '大力射门', 'SFX', 1.0, 'very hard football strike, explosive leather thwack with a short whoosh, arcade sports game', '射门（必杀射门叠加特效音）'),
  req('whistle_kickoff', '开球哨', 'SFX', 1.5, 'referee whistle, one short sharp blast, outdoor stadium, slight echo', '开球 / 进球后重新开球'),
  req('whistle_final', '终场哨', 'SFX', 2.5, 'referee whistle, three blasts, the last one long, outdoor stadium', '比赛结束'),
  req('goal_net', '球入网', 'SFX', 1.5, 'football hitting the back of a goal net, soft swish and rope rattle, close', '进球'),
  req('goal_horn', '进球号角', 'SFX', 2.5, 'stadium goal horn, loud brassy air horn with crowd roar building, celebratory', '进球'),
  req('post_clang', '击中门框', 'SFX', 1.0, 'football hitting a metal goal post, loud ringing clang, short decay', '击中门柱或横梁'),
  req('keeper_catch', '扑救接球', 'SFX', 1.0, 'goalkeeper catching a football, padded leather slap into gloves, short', '守门员扑救'),
  req('tackle_slide', '铲球', 'SFX', 1.0, 'sliding tackle on grass, quick turf scrape and a soft thud, cartoon', '抢断 / 铲球'),
  req('bgm_match', '足球比赛 BGM', 'BGM', 90, 'upbeat arcade football game theme, energetic brass and drums, playful and fast, chiptune flavour, stadium energy', '比赛中循环播放'),
  req('crowd_chant', '观众助威', 'Ambience', 20, 'football stadium crowd chanting and clapping in rhythm, distant, outdoor, no music', '比赛中背景循环'),
  // ---- V2: fights, culture combos, rivalries ----
  req2('brawl_start', '乱斗开始', 'SFX', 2.0, 'boxing ring bell rung twice followed by a rising stadium crowd roar, cartoon arcade fighting game', '球场乱斗开始'),
  req2('culture_sting', '文化连携发动', 'SFX', 1.5, 'short comedic brass fanfare sting with a cymbal hit, playful arcade game power-up cue', '文化连携（四字文化队）发动'),
  req2('rivalry_horn', '宿敌对决', 'SFX', 3.0, 'deep war horn blast over two heavy taiko drum hits, epic but slightly comedic, arcade sports intro', '宿敌对决开场'),
  req2('box_thud', '纸箱落地', 'SFX', 1.0, 'empty cardboard box dropping onto grass and a football bouncing off it, hollow papery thump', '纸箱障碍出现 / 球撞纸箱'),
  req2('backfire_boing', '连携翻车', 'SFX', 1.5, 'cartoon slip and fall, rubbery boing and a small crash, then a short sad trombone wah', '文化连携失误（摔倒、撞人、踢飞）'),
  req2('chain_pass', '一脚连传', 'SFX', 1.5, 'three quick football taps in a row with light whooshes between them, crisp and rhythmic', '连续一脚传球'),
  req2('swap_poof', '瞬间换位', 'SFX', 1.0, 'quick cartoon smoke poof with a tiny magical shimmer, stage magician trick', '队友换位 / 打乱对手站位'),
];

/** Which clips an event plays (missing files fall back to synth). */
export function audioForEvent(e: MatchEvent): string[] {
  switch (e.type) {
    case 'kickoff': return ['whistle_kickoff'];
    case 'pass': return ['kick_ball'];
    case 'shot': return e.kind && e.kind !== 'normal' ? ['kick_power'] : ['kick_ball'];
    case 'goal': return ['goal_net', 'goal_horn', 'crowd_cheer'];
    case 'ownGoal': return ['goal_net', 'crowd_gasp', 'crowd_laugh'];
    case 'save': return ['keeper_catch', 'crowd_ooh'];
    case 'block': return ['kick_ball'];
    case 'post': return ['post_clang', 'crowd_gasp'];
    case 'tackleWin': return ['tackle_slide'];
    case 'tackleFail': return ['trip_stumble'];
    case 'knockdown': return ['stomp'];
    case 'leap': return ['whoosh_dash'];
    case 'launch': return ['hit_heavy', 'crowd_ooh'];
    case 'skill': return ['signature_start', ...skillClip(e.kind)];
    case 'combo': return e.kind === 'culture' ? ['culture_sting', 'crowd_cheer'] : ['signature_start', 'crowd_cheer'];
    case 'prim': return primClip(e.kind);
    case 'rivalry': return ['rivalry_horn', 'crowd_cheer'];
    case 'bounce': return e.kind === 'box' ? ['box_thud'] : [];
    case 'luckyBounce': return ['charm_sparkle', 'crowd_laugh'];
    case 'bonusKick': return ['kick_power', 'crowd_laugh'];
    case 'fight': return e.kind === 'flyingKick' ? ['whoosh_dash'] : e.kind === 'roar' ? ['roar_lion'] : e.kind === 'slam' ? ['quake_rumble'] : e.kind === 'freeze' ? ['freeze_ice'] : e.kind === 'throw' ? ['throw_heave'] : [];
    case 'fightHit': return (e.v ?? 1) >= 2 ? ['hit_heavy', 'crowd_ooh'] : ['hit_heavy'];
    case 'fightMiss': return ['dodge_swish'];
    case 'brawl': return ['brawl_start', 'crowd_cheer'];
    case 'timeUp': return ['whistle_final'];
    case 'goldenGoal': return ['time_up_buzzer', 'crowd_ooh'];
    case 'finish': return e.v === -1 ? ['draw_sad_trombone'] : ['victory_fanfare', 'crowd_cheer'];
    default: return [];
  }
}

/** Culture combo primitives (backfires all share one clip). */
function primClip(kind?: string): string[] {
  if (kind?.startsWith('risk:')) return ['backfire_boing', 'crowd_laugh'];
  switch (kind) {
    case 'passChain': return ['chain_pass'];
    case 'obstacle': return ['box_thud'];
    case 'swapPositions':
    case 'scrambleOpp': return ['swap_poof'];
    case 'pushWave': return ['quake_rumble'];
    case 'stunCarrier': return ['freeze_ice'];
    case 'slowZone': return ['poison_bubble'];
    case 'markWrong': return ['dizzy_tweets'];
    case 'spotlight':
    case 'lucky': return ['charm_sparkle'];
    case 'keeperBoost':
    case 'wallLine': return ['shield_reflect'];
    case 'sprint':
    case 'dribbleBurst': return ['whoosh_dash'];
    case 'recover':
    case 'peace': return ['heal_chime'];
    case 'playDead': return ['snore'];
    case 'celebrateBait': return ['crowd_laugh'];
    default: return [];
  }
}

function skillClip(kind?: string): string[] {
  switch (kind) {
    case 'beamShot': return ['beam_laser'];
    case 'skyShot': return ['meteor_fall'];
    case 'powerShot': return ['flame_burst'];
    case 'dash': return ['whoosh_dash'];
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
