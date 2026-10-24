/**
 * Commentary — two glyph commentators talking over the match (queued lines, nonsense filler)
 * and speech bubbles popping out of the glyph crowd. All text goes in via textContent.
 */
import type { BattleSimulator } from '../core/battle/BattleSimulator';
import type { BattleEvent } from '../core/battle/types';
import type { ArenaRenderer } from '../render/ArenaRenderer';
import { COMMENTARY, type CommentaryPack } from './commentaryText';
import { getLang } from './i18n';
import { playClip } from './Sfx';

type CrowdMood = keyof CommentaryPack['crowd'];

const IMPORTANT = new Set(['clones', 'lightsOut', 'swallow', 'blameReflect', 'signature', 'ko', 'ringout', 'overRope', 'finish', 'explode', 'suddenDeath', 'timeUp', 'fight', 'ready']);
const CROWD_FOR: Partial<Record<BattleEvent['type'], [CrowdMood, number]>> = {
  hit: ['hit', 0.3], crit: ['hit', 0.9], clash: ['hit', 0.8], down: ['fall', 0.5], trip: ['fall', 1], slip: ['fall', 1], laughFall: ['fall', 1],
  doubleDown: ['fall', 1], wallCrash: ['fall', 0.8], overRope: ['out', 1], ringout: ['out', 1], signature: ['sig', 1], finish: ['finish', 1],
  explode: ['sig', 1], quake: ['sig', 0.7], throw: ['hit', 1], bribe: ['sig', 0.8], pop: ['fall', 0.8], confuse: ['fall', 0.9],
  clones: ['sig', 1], lightsOut: ['fall', 1], countdown: ['idle', 0.3],
  swallow: ['sig', 1], spit: ['hit', 1], blameReflect: ['fall', 1], soot: ['fall', 0.8], vanish: ['sig', 0.8], lazy: ['fall', 0.6], tremor: ['fall', 0.6],
};

interface Bubble {
  el: HTMLElement;
  idx: number;
  until: number;
}

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export class Commentary {
  private queue: { speaker: 0 | 1; text: string; skit?: boolean }[] = [];
  /** The reading-a-classic bit happens at most once per match. */
  private skitDone = false;
  private nextAt = 0;
  private lastLineAt = 0;
  private lastByType = new Map<string, number>();
  private bubbles: Bubble[] = [];
  /** The current speech bubble of each commentator (口 / 舌). */
  private talk: [HTMLElement | null, HTMLElement | null] = [null, null];
  private talkUntil: [number, number] = [0, 0];
  private nextBubbleAt = 0;
  private sim: BattleSimulator | null = null;
  private names: [string, string] = ['', ''];

  constructor(
    private panel: HTMLElement,
    private layer: HTMLElement,
    private arena: ArenaRenderer,
  ) {}

  private get pack(): CommentaryPack {
    return COMMENTARY[getLang()];
  }

  setNames(names: [string, string]): void {
    this.names = names;
  }

  start(sim: BattleSimulator): void {
    this.sim = sim;
    this.names = [sim.specs[0].name, sim.specs[1].name];
    this.queue = [];
    this.panel.replaceChildren();
    this.clearTalk();
    this.lastByType.clear();
    this.nextAt = 0;
    // ?skit forces the novel-reading bit (handy for testing); otherwise about every other match.
    this.skitDone = !new URLSearchParams(location.search).has('skit') && Math.random() > 0.5;
  }

  stop(): void {
    this.sim = null;
    this.queue = [];
    this.panel.replaceChildren();
    this.clearTalk();
  }

  private clearTalk(): void {
    this.talk.forEach((t) => t?.remove());
    this.talk = [null, null];
  }

  private fill(s: string, e?: BattleEvent): string {
    const sim = this.sim;
    const a = e ? this.names[e.a] : this.names[0];
    const b = e?.b !== undefined ? this.names[e.b] : this.names[e ? 1 - e.a : 1];
    const w = sim?.result && sim.result.winner !== null ? this.names[sim.result.winner] : a;
    const move = e && sim ? sim.specs[e.a].signature.name[getLang()] : '';
    return s.replace(/\{a\}/g, a).replace(/\{b\}/g, b).replace(/\{w\}/g, w).replace(/\{move\}/g, move);
  }

  onEvent(e: BattleEvent): void {
    const sim = this.sim;
    if (!sim) return;
    const now = performance.now() / 1000;
    let key: string = e.type;
    if (e.type === 'finish') key = sim.result?.winner === null ? 'draw' : 'finish';
    const lines = this.pack.events[key];
    // Mood bubbles from the stands.
    const crowd = CROWD_FOR[e.type];
    if (crowd && Math.random() < crowd[1]) this.spawnBubble(crowd[0], 1 + Math.floor(Math.random() * 2));
    if (!lines) return;
    if (e.type === 'hit' && Math.random() > 0.35) return;
    if ((e.type === 'lecture' || e.type === 'joke' || e.type === 'bribe' || e.type === 'confuse') && !e.v) return;
    const last = this.lastByType.get(key) ?? -9;
    if (now - last < 1.5 && !IMPORTANT.has(key)) return;
    this.lastByType.set(key, now);
    const out: { speaker: 0 | 1; text: string }[] = [];
    if (lines.p?.length) out.push({ speaker: 0, text: this.fill(pick(lines.p), e) });
    if (lines.c?.length && (Math.random() < 0.55 || key === 'ready' || key === 'signature' || key === 'finish')) out.push({ speaker: 1, text: this.fill(pick(lines.c), e) });
    const reading = this.queue.some((q) => q.skit);
    if (reading) {
      // 「舌」 keeps reading no matter what happens in the ring; only the result gets through, afterwards.
      if (key === 'finish' || key === 'draw' || key === 'ringout' || key === 'ko') this.queue.push(...out.slice(0, 1));
      return;
    }
    if (IMPORTANT.has(key)) {
      this.queue = out;
      this.nextAt = 0;
    } else {
      // Keep the queue short so commentary stays roughly in sync with the action.
      this.queue.push(...out);
      if (this.queue.length > 3) this.queue.splice(0, this.queue.length - 3);
    }
  }

  /** Commentators speak in bubbles above the desk; if the desk is off-screen, fall back to the panel. */
  private say(speaker: 0 | 1, text: string): void {
    this.arena.stage.talk(speaker);
    const pos = this.arena.commentatorScreen(speaker);
    if (pos.visible) {
      this.talk[speaker]?.remove();
      const el = document.createElement('div');
      el.className = `bubble talk s${speaker}`;
      const who = document.createElement('b');
      who.textContent = this.pack.speakers[speaker];
      const msg = document.createElement('span');
      msg.textContent = text;
      el.append(who, msg);
      this.layer.appendChild(el);
      this.talk[speaker] = el;
      this.talkUntil[speaker] = performance.now() / 1000 + Math.min(4, 1.8 + text.length * 0.05);
      return;
    }
    this.sayInPanel(speaker, text);
  }

  private sayInPanel(speaker: 0 | 1, text: string): void {
    const row = document.createElement('div');
    row.className = `line s${speaker}`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = this.pack.speakers[speaker];
    const msg = document.createElement('span');
    msg.className = 'msg';
    msg.textContent = text;
    row.append(who, msg);
    this.panel.appendChild(row);
    while (this.panel.children.length > 2) this.panel.firstElementChild!.remove();
  }

  private spawnBubble(mood: CrowdMood, count = 1): void {
    const n = this.arena.stage.spectators.length;
    if (!n) return;
    for (let k = 0; k < count; k++) {
      if (this.bubbles.length >= 5) return;
      let idx = -1;
      for (let tries = 0; tries < 8; tries++) {
        const i = Math.floor(Math.random() * n);
        if (this.bubbles.some((b) => b.idx === i)) continue;
        if (this.arena.spectatorScreen(i).visible) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return;
      const el = document.createElement('div');
      el.className = `bubble mood-${mood}`;
      el.textContent = this.fill(pick(this.pack.crowd[mood]));
      this.layer.appendChild(el);
      this.bubbles.push({ el, idx, until: performance.now() / 1000 + 2.2 + Math.random() * 0.8 });
      this.arena.stage.cheer(0.3);
    }
  }

  /** Call every animation frame. */
  tick(): void {
    const now = performance.now() / 1000;
    const sim = this.sim;
    if (sim && !this.arena.paused) {
      if (!this.skitDone && sim.phase === 'fight' && sim.t > 2 && now >= this.nextAt) {
        // 「舌」 pulls out a classic novel and starts reading, whatever is going on in the ring.
        this.skitDone = true;
        playClip('book_page_flip', 0.7);
        this.queue = this.pack.skit.map(([speaker, text]) => ({ speaker, text: this.fill(text), skit: true }));
      }
      if (this.queue.length && now >= this.nextAt) {
        const line = this.queue.shift()!;
        this.say(line.speaker, line.text);
        this.lastLineAt = now;
        this.nextAt = now + Math.min(3.2, 1.3 + line.text.length * 0.035);
      } else if (!this.queue.length && now - this.lastLineAt > 3.8 && sim.phase === 'fight') {
        this.queue.push({ speaker: 1, text: this.fill(pick(this.pack.idle)) });
      }
    }
    if (now >= this.nextBubbleAt && !this.arena.paused) {
      this.nextBubbleAt = now + (sim ? 0.9 + Math.random() * 1.3 : 1.8 + Math.random() * 2);
      this.spawnBubble(sim ? 'idle' : 'pre');
    }
    // Commentator bubbles follow the desk (two speakers side by side, the newest on top).
    for (const i of [0, 1] as const) {
      const el = this.talk[i];
      if (!el) continue;
      const p = this.arena.commentatorScreen(i);
      if (now > this.talkUntil[i] || !p.visible) {
        el.remove();
        this.talk[i] = null;
        continue;
      }
      const dx = i === 0 ? -70 : 70;
      el.style.transform = `translate(${(p.x + dx).toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      el.style.zIndex = this.talkUntil[i] > this.talkUntil[1 - i] ? '4' : '3';
      el.classList.toggle('fade', now > this.talkUntil[i] - 0.35);
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const p = this.arena.spectatorScreen(b.idx);
      if (now > b.until || !p.visible) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      b.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      b.el.classList.toggle('fade', now > b.until - 0.35);
    }
  }
}
