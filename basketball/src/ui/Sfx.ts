/**
 * Sound for Glyph Basketball: generated .wav files from public/audio/ when present (listed in
 * public/audio/available.json), otherwise small synthesized sounds. Unlocked by a user gesture.
 * Shares the arena's on/off preference.
 */
import type { MatchEvent } from '../sim/types';
import { AUDIO, audioForEvent } from './audioManifest';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
const buffers = new Map<string, AudioBuffer>();
let loops: { id: string; src: AudioBufferSourceNode; gain: GainNode }[] = [];
let wantedScene: 'menu' | 'match' | 'result' | null = null;

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
    /* synth only */
  }
}

export function playClip(id: string, vol = 0.8): boolean {
  const buf = buffers.get(id);
  if (!buf || !ctx || !master || !enabled) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start();
  return true;
}

export function setAudioScene(scene: 'menu' | 'match' | 'result'): void {
  wantedScene = scene;
  if (!ctx || !master) return;
  const want = scene === 'menu' ? ['bgm_menu'] : scene === 'match' ? [buffers.has('bgm_basket') ? 'bgm_basket' : 'bgm_menu', buffers.has('crowd_gym') ? 'crowd_gym' : 'crowd_ambience'] : ['bgm_result', 'crowd_ambience'];
  for (const l of loops.filter((x) => !want.includes(x.id))) {
    l.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    l.src.stop(ctx.currentTime + 1.5);
  }
  loops = loops.filter((x) => want.includes(x.id));
  for (const id of want) {
    const buf = buffers.get(id);
    if (!buf || loops.some((x) => x.id === id)) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = id !== 'bgm_result';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(id.startsWith('crowd') ? 0.25 : 0.3, ctx.currentTime, 0.5);
    src.connect(gain).connect(master);
    src.start();
    loops.push({ id, src, gain });
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

function noise(dur: number, vol = 0.3, filterFreq = 1200, delay = 0): void {
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
  src.start(ctx.currentTime + delay);
}

/** Synthesized stand-ins for the sounds that have no file yet. */
const SYNTH: Record<string, () => void> = {
  dribble_bounce: () => tone(140, 0.08, 'sine', 70, 0.3),
  swish_net: () => noise(0.25, 0.25, 4000),
  rim_clank: () => {
    tone(900, 0.4, 'triangle', 860, 0.3);
    tone(1500, 0.25, 'sine', 1450, 0.12);
  },
  backboard_bang: () => {
    noise(0.08, 0.4, 1200);
    tone(220, 0.15, 'square', 180, 0.15);
  },
  dunk_slam: () => {
    noise(0.2, 0.5, 2000);
    tone(700, 0.5, 'triangle', 650, 0.3, 0.02);
    tone(90, 0.3, 'square', 50, 0.3);
  },
  sneaker_squeak: () => tone(2400, 0.08, 'sawtooth', 3000, 0.08),
  shot_release: () => noise(0.12, 0.15, 2500),
  block_swat: () => {
    noise(0.1, 0.45, 2200);
    tone(300, 0.12, 'square', 150, 0.2);
  },
  buzzer_final: () => tone(180, 1.2, 'sawtooth', 175, 0.25),
  whistle_kickoff: () => tone(2400, 0.35, 'sine', 2300, 0.25),
  signature_start: () => [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'square', undefined, 0.16, i * 0.07)),
  victory_fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', undefined, 0.3, i * 0.12)),
  draw_sad_trombone: () => [392, 370, 349, 330].forEach((f, i) => tone(f, 0.35, 'sawtooth', undefined, 0.15, i * 0.35)),
  crowd_cheer: () => noise(1.2, 0.18, 1500),
  stomp: () => tone(110, 0.2, 'square', 50, 0.25),
  culture_sting: () => [392, 523, 659, 880].forEach((f, i) => tone(f, 0.16, 'square', undefined, 0.15, i * 0.06)),
  backfire_boing: () => {
    tone(300, 0.35, 'sine', 900, 0.25);
    [330, 311, 294].forEach((f, i) => tone(f, 0.25, 'sawtooth', undefined, 0.12, 0.35 + i * 0.22));
  },
};

export function sfxForEvent(e: MatchEvent): void {
  for (const id of audioForEvent(e)) {
    if (!playClip(id, id.startsWith('crowd') ? 0.5 : 0.85)) SYNTH[id]?.();
  }
}

export function click(): void {
  if (!playClip('ui_click', 0.5)) tone(900, 0.05, 'sine', 700, 0.12);
}
