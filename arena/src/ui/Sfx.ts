/**
 * Sound: plays generated .wav files from public/audio/ when present (see audioManifest.ts),
 * otherwise falls back to tiny synthesized effects. Starts muted until a user gesture.
 */
import type { BattleEvent } from '../core/battle/types';
import { AUDIO, audioForEvent } from './audioManifest';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function sfxEnabled(): boolean {
  return enabled;
}

export function setSfxEnabled(v: boolean): void {
  enabled = v;
  try {
    localStorage.setItem('glyph-rumble-sfx', v ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = v ? 0.5 : 0;
}

export function initSfx(): void {
  try {
    enabled = localStorage.getItem('glyph-rumble-sfx') !== '0';
  } catch {
    /* ignore */
  }
}

/** Must be called from a user gesture (click) to unlock audio. */
export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.5 : 0;
    master.connect(ctx.destination);
    void loadAvailable();
  } catch {
    ctx = null;
  }
}

// ---------------------------------------------------------------- file-based audio

const buffers = new Map<string, AudioBuffer>();
/** Clips that keep the built-in synthesized sound even when a file exists (for now: hit / crit). */
const SYNTH_ONLY = new Set(['hit_light', 'hit_heavy']);
let loop: { id: string; src: AudioBufferSourceNode; gain: GainNode }[] = [];
let wantedScene: 'menu' | 'battle' | 'result' | null = null;

/** Load whatever generated clips exist (public/audio/available.json lists them). */
async function loadAvailable(): Promise<void> {
  try {
    const res = await fetch('audio/available.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const files: string[] = await res.json();
    await Promise.all(
      files.map(async (file) => {
        const req = AUDIO.find((a) => a.filename.replace(/\.\w+$/, '') === file.replace(/\.\w+$/, ''));
        if (!req || !ctx) return;
        const data = await (await fetch(`audio/${encodeURIComponent(file)}`)).arrayBuffer();
        buffers.set(req.id, await ctx.decodeAudioData(data));
      }),
    );
    if (wantedScene) setAudioScene(wantedScene);
  } catch {
    /* no generated audio: synthesized fallback only */
  }
}

/** Play a generated clip by id. Returns false if it isn't available (caller may synthesize). */
export function playClip(id: string, vol = 0.8): boolean {
  const buf = SYNTH_ONLY.has(id) ? undefined : buffers.get(id);
  if (!buf || !ctx || !master || !enabled) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start();
  return true;
}

/** Background music + crowd bed for each screen (only if the files exist). */
export function setAudioScene(scene: 'menu' | 'battle' | 'result'): void {
  wantedScene = scene;
  if (!ctx || !master) return;
  const want = scene === 'menu' ? ['bgm_menu'] : scene === 'battle' ? ['bgm_battle', 'crowd_ambience'] : ['bgm_result', 'crowd_ambience'];
  for (const l of loop.filter((x) => !want.includes(x.id))) {
    l.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    l.src.stop(ctx.currentTime + 1.5);
  }
  loop = loop.filter((x) => want.includes(x.id));
  for (const id of want) {
    const buf = buffers.get(id);
    if (!buf || loop.some((x) => x.id === id)) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = id !== 'bgm_result';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(id.startsWith('crowd') ? 0.25 : 0.35, ctx.currentTime, 0.5);
    src.connect(gain).connect(master);
    src.start();
    loop.push({ id, src, gain });
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', slideTo?: number, vol = 0.4, delay = 0): void {
  if (!ctx || !master || !enabled) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.3, filterFreq = 1200): void {
  if (!ctx || !master || !enabled) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  hit(strong = false) {
    noise(strong ? 0.22 : 0.12, strong ? 0.5 : 0.35, strong ? 2500 : 1600);
    tone(strong ? 140 : 190, 0.15, 'square', 60, 0.25);
  },
  boing() {
    tone(220, 0.35, 'sine', 660, 0.35);
  },
  whoosh() {
    noise(0.25, 0.15, 900);
  },
  crash() {
    noise(0.35, 0.5, 900);
    tone(90, 0.3, 'sawtooth', 40, 0.2);
  },
  fall() {
    tone(700, 0.8, 'triangle', 120, 0.3);
  },
  boom() {
    noise(0.8, 0.7, 600);
    tone(70, 0.7, 'sawtooth', 30, 0.35);
  },
  pop() {
    tone(500, 0.12, 'sine', 900, 0.3);
  },
  zap() {
    tone(1200, 0.25, 'sawtooth', 300, 0.15);
  },
  start() {
    [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'square', undefined, 0.18, i * 0.09));
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', undefined, 0.3, i * 0.12));
  },
};

export function sfxForEvent(e: BattleEvent, winner?: 0 | 1 | null): void {
  const ids = audioForEvent(e, winner);
  let played = false;
  for (const id of ids) played = playClip(id, id.startsWith('crowd') ? 0.5 : 0.8) || played;
  // Hit / crit always use the synthesized punch (the crowd "ooh" for crits still plays from file).
  if (played && !ids.some((id) => SYNTH_ONLY.has(id))) return;
  switch (e.type) {
    case 'hit':
      return sfx.hit(false);
    case 'crit':
    case 'clash':
      return sfx.hit(true);
    case 'wallCrash':
    case 'slam':
      return sfx.crash();
    case 'fallOff':
      return sfx.fall();
    case 'pop':
    case 'hop':
    case 'pounce':
      return sfx.boing();
    case 'dash':
    case 'dodge':
    case 'gas':
      return sfx.whoosh();
    case 'explode':
      return sfx.boom();
    case 'zap':
      return sfx.zap();
    case 'fight':
      return sfx.start();
    case 'charm':
    case 'revive':
    case 'luckyDodge':
      return sfx.pop();
    case 'finish':
      return sfx.win();
  }
}
