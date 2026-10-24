/**
 * Glyph Basketball renderer: drives the simulation in fixed steps (slow motion for dunks, blocks
 * and buzzer beaters), shows players / ball / arena, turns events into effects, and runs a
 * broadcast camera that follows the ball (drag to orbit, wheel / pinch to zoom).
 */
import * as THREE from 'three';
import { buildFighter, type FighterBundle } from '@shared/render/FighterFactory';
import { Effects, type ParticleKind } from '@shared/render/Effects';
import type { GlyphInstance, GlyphTemplate } from '@shared/render/Glyph3DFactory';
import { PlayerView } from '@shared/render/sports/PlayerView';
import { KITS, type Kit } from '@shared/sports/kits';
import type { Match } from '../sim/Match';
import { COURT, DT, type MatchEvent, type Player } from '../sim/types';
import { Court } from './Court';

export interface RenderLabels {
  move(p: Player): string;
  combo(team: 0 | 1): string;
  word(key: 'score2' | 'score3' | 'dunk' | 'superDunk' | 'airCrash' | 'block' | 'steal' | 'rebound' | 'miss' | 'brawl' | 'ko' | 'shotClock' | 'lucky' | 'swish' | 'airball' | 'overtime'): string;
  prim(kind: string): string;
}

const FX_PARTICLE: Record<string, { kind: ParticleKind; color?: number }> = {
  fire: { kind: 'flame' },
  water: { kind: 'dust', color: 0x6fc3ff },
  thunder: { kind: 'bolt' },
  plant: { kind: 'dust', color: 0x7ddc6a },
  ice: { kind: 'dust', color: 0xbff0ff },
  earth: { kind: 'dust', color: 0xc9a46b },
  dark: { kind: 'smoke' },
  light: { kind: 'spark' },
  star: { kind: 'star' },
  culture: { kind: 'star', color: 0xffd23f },
};

const STATUS_FX: Partial<Record<Player['state'], { kind: ParticleKind; color?: number }>> = {
  sleep: { kind: 'zzz' },
  confuse: { kind: 'question' },
  laugh: { kind: 'note' },
  money: { kind: 'star', color: 0xffd23f },
  charm: { kind: 'heart' },
  freeze: { kind: 'dust', color: 0xbff0ff },
  down: { kind: 'star' },
};

export class BasketRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  readonly court: Court;
  readonly effects: Effects;
  private sun = new THREE.DirectionalLight(0xffffff, 2.0);
  private views: (PlayerView | undefined)[] = [];
  private ball: THREE.Mesh;
  private ghost: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private shadowTex: THREE.Texture;
  private timer = new THREE.Timer();
  private sim: Match | null = null;
  private acc = 0;
  private slowMo = 0;
  private time = 0;
  paused = false;
  speed = 1;
  labels: RenderLabels | null = null;
  kits: [Kit, Kit] = [KITS[0], KITS[1]];
  onEvent: ((e: MatchEvent) => void) | null = null;
  onDone: ((m: Match) => void) | null = null;
  private doneReported = false;
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3(0, 14, 20);
  private camAz = 0;
  private camZoom = 1;
  private focus: { x: number; z: number; t: number; zoom: number } | null = null;
  private focusOffset = { x: 0, y: 0 };
  private propTemplates = new Map<string, GlyphTemplate>();
  private falling: { inst: GlyphInstance; x: number; z: number; y: number; vy: number; spin: number; life: number }[] = [];
  private crates = new Map<object, THREE.Mesh>();
  private crateGeo = new THREE.BoxGeometry(1, 0.9, 1);
  private crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
  private puddles = new Map<object, THREE.Mesh>();
  private puddleGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  private puddleMat = new THREE.MeshBasicMaterial({ color: 0x7cc8ff, transparent: true, opacity: 0.35, depthWrite: false });
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private slowFrames = 0;
  quality: 'high' | 'low' = 'high';

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.buildLights();
    this.court = new Court(this.scene);
    this.effects = new Effects(this.scene);
    this.shadowTex = radial('rgba(40,20,10,0.5)', 'rgba(40,20,10,0)');
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballR, 28, 18), new THREE.MeshStandardMaterial({ map: basketballTexture(), roughness: 0.6 }));
    this.ball.castShadow = true;
    this.ghost = new THREE.Mesh(this.ball.geometry, new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ghost.visible = false;
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }));
    this.scene.add(this.ball, this.ghost, this.ballShadow);
    this.setQuality('high');
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private buildLights(): void {
    const s = this.scene;
    s.background = new THREE.Color(0x24183f);
    s.fog = new THREE.Fog(0x24183f, 40, 90);
    s.add(new THREE.HemisphereLight(0xfff4e6, 0x3a2a55, 1.7));
    this.sun.position.set(-8, 22, 12);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -18;
    sc.right = sc.top = 18;
    sc.near = 5;
    sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    s.add(this.sun);
  }

  setQuality(q: 'high' | 'low'): void {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.5 : 1));
    this.renderer.shadowMap.enabled = q === 'high';
    this.sun.castShadow = q === 'high';
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 512, q === 'high' ? 2048 : 512);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.effects.density = q === 'high' ? 1 : 0.5;
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => (x.needsUpdate = true));
      else if (mat) mat.needsUpdate = true;
    });
    this.resize();
  }

  setTeams(bundles: [FighterBundle[] | null, FighterBundle[] | null]): void {
    for (const v of this.views) v?.dispose();
    this.views = [];
    bundles.forEach((list, team) => list?.forEach((b, i) => {
      const v = new PlayerView(this.scene, b, this.kits[team], this.shadowTex);
      v.acrobatic = true;
      this.views[team * 2 + i] = v;
    }));
  }

  setKits(kits: [Kit, Kit]): void {
    this.kits = kits;
    this.views.forEach((v, i) => v?.setKit(kits[i < 2 ? 0 : 1]));
  }

  async loadProps(texts: string[]): Promise<void> {
    for (const t of new Set(texts)) {
      if (this.propTemplates.has(t)) continue;
      const r = await buildFighter(t);
      if (r.ok) this.propTemplates.set(t, r.bundle.template);
    }
  }

  start(m: Match): void {
    this.sim = m;
    this.acc = 0;
    this.slowMo = 0;
    this.doneReported = false;
    this.paused = false;
    this.focus = null;
    this.effects.clear();
    this.clearFalling();
    this.syncZones(null);
  }

  stop(): void {
    this.sim = null;
    this.clearFalling();
    this.syncZones(null);
  }

  setFocusOffset(x: number, y: number): void {
    this.focusOffset = { x, y };
    this.resize();
  }

  // ---------------------------------------------------------------- loop

  private frame(): void {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    this.trackFps(dt);
    this.tick(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Debug / headless: simulate `seconds` of frames. */
  advance(seconds: number): void {
    for (let i = 0; i < Math.round(seconds * 60); i++) this.tick(1 / 60);
    this.renderer.render(this.scene, this.camera);
  }

  private tick(dt: number): void {
    this.time += dt;
    const m = this.sim;
    if (m && !this.paused) {
      this.slowMo = Math.max(0, this.slowMo - dt);
      const scale = (this.slowMo > 0 ? 0.35 : 1) * this.speed;
      this.acc += dt * scale;
      let n = 0;
      while (this.acc >= DT && n < 8) {
        m.step();
        this.acc -= DT;
        n++;
        for (const e of m.drain()) this.handle(e);
      }
      if (m.phase === 'done' && !this.doneReported) {
        this.doneReported = true;
        this.onDone?.(m);
      }
    }
    const animDt = this.paused ? 0 : dt * (this.slowMo > 0 ? 0.5 : 1);
    if (m) {
      const camYaw = Math.atan2(this.camera.position.x - this.camTarget.x, this.camera.position.z - this.camTarget.z);
      m.players.forEach((p, i) => {
        const v = this.views[i];
        if (!v) return;
        v.sync(p, animDt, this.time, camYaw, m.ball.owner === p.id);
        this.statusFx(p, v);
      });
      this.syncBall(m, animDt);
      this.syncZones(m);
      // Flying glyphs leave a trail (fire on dunks).
      if (animDt > 0) for (const p of m.players) {
        if (p.y < 1 || Math.random() > 0.5) continue;
        const v = this.views[p.id];
        const at = new THREE.Vector3(p.p.x, p.y + (v?.height ?? 1.3) * 0.5, p.p.z);
        if (p.state === 'dunk') this.effects.emit('flame', at, 1, { speed: 0.5, up: 0.2, life: 0.35, size: 0.6, gravity: 0 });
        else this.effects.emit('star', at, 1, { speed: 0.4, up: 0, life: 0.3, size: 0.35, gravity: 0, color: this.kits[p.team].hex });
      }
      for (const team of [0, 1] as const) {
        if (!m.teams[team].fx.sprint || animDt <= 0) continue;
        for (const q of m.teamOf(team)) if (Math.random() < 0.15) this.effects.emit('dust', new THREE.Vector3(q.p.x, 0.2, q.p.z), 1, { speed: 0.8, up: 0.4, life: 0.4, size: 0.5, color: this.kits[team].hex });
      }
    } else this.syncPreview(dt);
    this.updateFalling(animDt);
    this.effects.update(animDt);
    this.court.update(dt);
    this.updateCamera(dt);
  }

  private statusFx(p: Player, v: PlayerView): void {
    const f = STATUS_FX[p.state];
    if (!f || Math.random() > 0.08) return;
    this.effects.emit(f.kind, new THREE.Vector3(p.p.x, v.height + 0.3, p.p.z), 1, { speed: 0.6, up: 1.2, life: 0.9, size: 0.45, gravity: 0, color: f.color });
  }

  /** Team screen: the two pairs face each other at centre court. */
  private syncPreview(dt: number): void {
    this.views.forEach((v, i) => {
      const team = i < 2 ? 0 : 1;
      const k = i % 2;
      const fake = {
        id: i, p: { x: (team ? 1 : -1) * (1.2 + k * 1.6), z: k ? 0.9 : -0.6 }, v: { x: 0, z: 0 }, y: 0, face: { x: team ? -1 : 1, z: 0.3 },
        state: 'play', wallT: 0, ghostT: 0, attr: { radius: 0.5 },
      };
      v?.sync(fake, dt, this.time + i, 0, false);
    });
    this.ball.position.set(0, COURT.ballR + Math.abs(Math.sin(this.time * 3)) * 0.9, 1.2);
    this.ballShadow.position.set(0, 0.012, 1.2);
    this.ghost.visible = false;
  }

  private syncBall(m: Match, dt: number): void {
    const b = m.ball;
    const prev = this.ball.position.clone();
    this.ball.position.set(b.p.x, b.p.y, b.p.z);
    const dx = b.p.x - prev.x, dz = b.p.z - prev.z, d = Math.hypot(dx, dz);
    if (d > 1e-4 && d < 3) this.ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dz / d, 0, -dx / d), d / COURT.ballR));
    else if (b.owner < 0 && b.shot) this.ball.rotation.z += dt * 12;
    this.ballShadow.position.set(b.p.x, 0.012, b.p.z);
    this.ballShadow.scale.setScalar(0.7 * (1 - Math.min(0.6, b.p.y / 8)));
    const speed = Math.hypot(b.v.x, b.v.z, b.v.y);
    if (b.owner < 0 && speed > 7 && dt > 0) {
      const f = b.fx ? FX_PARTICLE[b.fx] ?? FX_PARTICLE.star : null;
      if (f) this.effects.emit(f.kind, this.ball.position, 2, { speed: 0.6, up: 0.3, life: 0.45, size: 0.45, gravity: 0, color: f.color });
    }
    // Ghost ball (decoy): visual only.
    this.ghost.visible = !!m.ghost;
    if (m.ghost) this.ghost.position.set(m.ghost.x, COURT.ballR + Math.abs(Math.sin(this.time * 9)) * 0.7, m.ghost.z);
  }

  /** Crates for 'box' zones, slippery puddles for 'slip' zones, gas for 'cloud' zones. */
  private syncZones(m: Match | null): void {
    const boxes = new Set<object>(m ? m.zones.filter((z) => z.kind === 'box') : []);
    const slips = new Set<object>(m ? m.zones.filter((z) => z.kind === 'slip') : []);
    for (const [z, mesh] of this.crates) if (!boxes.has(z)) {
      mesh.removeFromParent();
      this.crates.delete(z);
    }
    for (const [z, mesh] of this.puddles) if (!slips.has(z)) {
      mesh.removeFromParent();
      this.puddles.delete(z);
    }
    if (!m) return;
    for (const z of m.zones) {
      if (z.kind === 'box') {
        let mesh = this.crates.get(z);
        if (!mesh) {
          mesh = new THREE.Mesh(this.crateGeo, this.crateMat);
          mesh.castShadow = true;
          mesh.scale.setScalar(z.r * 1.7);
          mesh.position.set(z.x, 5, z.z);
          mesh.rotation.y = Math.random() * Math.PI;
          this.scene.add(mesh);
          this.crates.set(z, mesh);
        }
        const groundY = 0.45 * mesh.scale.y;
        if (mesh.position.y > groundY) {
          mesh.position.y = Math.max(groundY, mesh.position.y - 0.3);
          if (mesh.position.y === groundY) this.effects.emit('dust', new THREE.Vector3(z.x, 0.2, z.z), 10, { speed: 3, up: 1, life: 0.5, size: 0.7 });
        }
      } else if (z.kind === 'slip') {
        let mesh = this.puddles.get(z);
        if (!mesh) {
          mesh = new THREE.Mesh(this.puddleGeo, this.puddleMat);
          mesh.position.set(z.x, 0.015, z.z);
          mesh.scale.setScalar(z.r);
          this.scene.add(mesh);
          this.puddles.set(z, mesh);
        }
      } else if (z.kind === 'cloud' && Math.random() < 0.5) {
        this.effects.emit('gas', new THREE.Vector3(z.x + (Math.random() - 0.5) * z.r * 1.6, 0.4, z.z + (Math.random() - 0.5) * z.r * 1.6), 1, { speed: 0.6, up: 0.6, life: 1.4, size: 1.1, grow: 1.5, gravity: 0 });
      }
    }
  }

  // ---------------------------------------------------------------- events → effects

  private handle(e: MatchEvent): void {
    const m = this.sim!;
    const fx = this.effects;
    const p = e.a >= 0 ? m.players[e.a] : null;
    const v = e.a >= 0 ? this.views[e.a] : null;
    const at = new THREE.Vector3(e.x ?? 0, 1, e.z ?? 0);
    const L = this.labels;
    const hoopSide = (team: 0 | 1) => Math.sign(m.attackHoop(team).x) || 1;
    switch (e.type) {
      case 'tipoff':
        this.court.cheer(0.5);
        break;
      case 'shot':
        v?.kick(0.35, 0.3);
        if ((e.v ?? 2) === 3) this.court.cheer(0.5, e.team);
        break;
      case 'pass':
        v?.kick(0.15);
        break;
      case 'airCrash':
        if (p && L) fx.word(L.word('airCrash'), new THREE.Vector3(p.p.x, p.y + 3, p.p.z), '#ff3b3b', 1.6);
        fx.emit('star', new THREE.Vector3(e.x ?? 0, (p?.y ?? 2) + 1, e.z ?? 0), 16, { speed: 5, up: 2, life: 0.7, size: 0.55 });
        fx.emit('spark', new THREE.Vector3(e.x ?? 0, (p?.y ?? 2) + 1, e.z ?? 0), 10, { speed: 6, up: 1, life: 0.35, size: 0.5 });
        this.slowMo = Math.max(this.slowMo, 0.5);
        this.court.cheer(1.2);
        break;
      case 'dunk':
        if (p && v) {
          const sup = e.kind === 'super';
          if (L) fx.word(L.word(sup ? 'superDunk' : 'dunk'), new THREE.Vector3(p.p.x, sup ? 5 : 3.6, p.p.z), this.kits[e.team].css, sup ? 3 : 2.2);
          if (sup) for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            fx.emit('dust', new THREE.Vector3(m.ball.p.x, 0.4, m.ball.p.z), 1, { speed: 9, up: 0.5, life: 0.6, size: 1, grow: 2, gravity: 0, dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) });
          }
          fx.emit('spark', new THREE.Vector3(m.ball.p.x, COURT.rimH, m.ball.p.z), 18, { speed: 5, up: 2, life: 0.5, size: 0.55 });
          this.court.clank(hoopSide(e.team));
          this.slowMo = sup ? 1.1 : 0.7;
          this.focus = { x: m.attackHoop(e.team).x * 0.8, z: 0, t: sup ? 1.6 : 1.2, zoom: sup ? 0.66 : 0.72 };
          this.court.cheer(1.4, e.team);
        }
        break;
      case 'score': {
        const side = hoopSide(e.team);
        this.court.swish(side);
        const hx = side * COURT.hoopX;
        const word = e.kind === 'dunk' ? null : (e.v ?? 2) === 3 ? 'score3' : 'score2';
        if (L && word) fx.word(L.word(word), new THREE.Vector3(hx * 0.9, 4, 0), this.kits[e.team].css, (e.v ?? 2) === 3 ? 2.4 : 1.8);
        fx.emit('confetti', new THREE.Vector3(hx, 3, 0), (e.v ?? 2) === 3 ? 34 : 18, { speed: 5, up: 4, gravity: 6, life: 1.4, size: 0.24, color: this.kits[e.team].hex });
        this.court.cheer((e.v ?? 2) === 3 ? 2 : 1.3, e.team);
        if (m.clock > 85 || (e.v ?? 2) === 3) this.slowMo = Math.max(this.slowMo, 0.6);
        break;
      }
      case 'rim':
        this.court.clank(Math.sign(m.ball.p.x) || 1);
        fx.emit('spark', new THREE.Vector3(m.ball.p.x, m.ball.p.y, m.ball.p.z), 5, { speed: 3, up: 1, life: 0.3, size: 0.35 });
        break;
      case 'miss':
        if (L && Math.random() < 0.25) fx.word(L.word('miss'), at.setY(2.4), '#ffffff', 0.9);
        break;
      case 'block':
        if (p && L) fx.word(L.word('block'), new THREE.Vector3(p.p.x, 3.2, p.p.z), '#ff3b3b', 2);
        fx.emit('star', new THREE.Vector3(m.ball.p.x, m.ball.p.y, m.ball.p.z), 14, { speed: 4, up: 2, life: 0.6, size: 0.5 });
        this.slowMo = 0.6;
        this.court.cheer(1.5, e.team);
        break;
      case 'steal':
      case 'intercept':
        fx.emit('dust', at.setY(0.4), 8, { speed: 3, up: 1, life: 0.5, size: 0.6 });
        if (L && Math.random() < 0.6) fx.word(L.word('steal'), at.setY(2.4), '#ffd23f', 1.1);
        this.court.cheer(0.7, e.team);
        break;
      case 'rebound':
        if (L && Math.random() < 0.3) fx.word(L.word('rebound'), at.setY(2.6), '#48d6c8', 0.9);
        break;
      case 'shotClock':
        if (L) fx.word(L.word('shotClock'), at.setY(2.8), '#ff8a00', 1.4);
        break;
      case 'knockdown':
        fx.emit('star', at.setY(1.1), 6, { speed: 2.5, up: 2, life: 0.6, size: 0.45 });
        v?.kick(0.4);
        break;
      case 'luckyRoll':
        if (L) fx.word(L.word('lucky'), new THREE.Vector3(m.ball.p.x, 3.4, m.ball.p.z), '#ffd23f', 1.6);
        break;
      case 'skill':
        if (p && v && L) {
          fx.word(L.move(p), new THREE.Vector3(p.p.x, v.height + 1.4, p.p.z), this.kits[e.team].css, 1.5);
          v.kick(-0.3, 0.8);
          this.slowMo = 0.4;
          this.focus = { x: THREE.MathUtils.clamp(p.p.x, -8, 8), z: p.p.z * 0.5, t: 0.9, zoom: 0.78 };
          this.skillBurst(e.kind ?? '', p);
          this.court.cheer(0.8);
        }
        break;
      case 'skillHit':
        if (e.b !== undefined && e.b >= 0) {
          const t = m.players[e.b];
          fx.emit('star', new THREE.Vector3(t.p.x, 1.2, t.p.z), 8, { speed: 3, up: 2, life: 0.6, size: 0.5 });
        }
        break;
      case 'combo':
        if (L && e.kind) {
          const ts = m.teams[e.team];
          const mates = m.teamOf(e.team);
          const cx = (mates[0].p.x + mates[1].p.x) / 2, cz = (mates[0].p.z + mates[1].p.z) / 2;
          fx.word(`${ts.input.name}「${L.combo(e.team)}」`, new THREE.Vector3(cx, 3.6, cz), '#ffd23f', 2);
          fx.emit('confetti', new THREE.Vector3(cx, 2, cz), 22, { speed: 5, up: 4, gravity: 6, life: 1.2, size: 0.24, color: this.kits[e.team].hex });
          this.slowMo = 0.5;
          this.court.cheer(1.2, e.team);
        }
        break;
      case 'prim':
        if (e.kind) this.primFx(e, p);
        break;
      case 'rivalry':
        if (e.label) fx.word(`⚔ ${e.label} ⚔`, new THREE.Vector3(0, 4.2, 0), '#ffd23f', 2.4);
        fx.emit('confetti', new THREE.Vector3(0, 2.5, 0), 30, { speed: 6, up: 5, gravity: 6, life: 1.4, size: 0.28 });
        this.court.cheer(1.6);
        this.slowMo = 0.6;
        break;
      case 'fight':
        if (p && v && L) {
          fx.word(L.move(p), new THREE.Vector3(p.p.x, v.height + 1.3, p.p.z), '#ff3b3b', 1.3);
          v.kick(-0.35, 0.6);
          if (e.kind === 'flyingKick') fx.emit('dust', at.clone().setY(0.3), 10, { speed: 4, up: 0.5, life: 0.5, size: 0.7, dir: new THREE.Vector3(p.face.x, 0, p.face.z) });
          if (e.kind === 'roar') fx.emit('dust', at.clone().setY(1), 18, { speed: 8, up: 0.3, gravity: 0, life: 0.5, size: 0.8, grow: 2, dir: new THREE.Vector3(p.face.x, 0, p.face.z) });
          if (e.kind === 'freeze') fx.emit('dust', at.clone().setY(1), 14, { speed: 5, up: 0.5, gravity: 0, life: 0.7, size: 0.7, color: 0xbff0ff, dir: new THREE.Vector3(p.face.x, 0, p.face.z) });
          if (!this.focus && Math.random() < 0.6) this.focus = { x: THREE.MathUtils.clamp(p.p.x, -8, 8), z: p.p.z * 0.5, t: 0.8, zoom: 0.8 };
          this.slowMo = Math.max(this.slowMo, 0.25);
        }
        break;
      case 'fightHit': {
        const t = e.b !== undefined && e.b >= 0 ? m.players[e.b] : p;
        if (t) {
          const pos = new THREE.Vector3(t.p.x, 1.2, t.p.z);
          fx.emit('star', pos, 12, { speed: 4, up: 3, life: 0.7, size: 0.55 });
          fx.emit('spark', pos, 8, { speed: 5, up: 2, life: 0.35, size: 0.5 });
          if (L && (e.v ?? 1) >= 2) fx.word(`${L.word('ko')} ×${e.v}`, pos.clone().setY(2.6), '#ffd23f', 1.4);
        }
        this.court.cheer(0.9);
        break;
      }
      case 'fightMiss':
        if (L && v) fx.word(L.word('miss'), new THREE.Vector3(e.x ?? 0, 2, e.z ?? 0), '#ffffff', 0.9);
        break;
      case 'brawl':
        if (L) fx.word(L.word('brawl'), at.clone().setY(3.4), '#ff3b3b', 2.6);
        fx.emit('smoke', at.clone().setY(0.6), 30, { speed: 3, up: 1.2, life: 1.4, size: 1.5, grow: 1.6 });
        this.focus = { x: THREE.MathUtils.clamp(e.x ?? 0, -8, 8), z: (e.z ?? 0) * 0.5, t: 2.2, zoom: 0.75 };
        this.court.cheer(2);
        break;
      case 'overtime':
        if (L) fx.word(L.word('overtime'), new THREE.Vector3(0, 4, 0), '#ffd23f', 2.6);
        break;
      case 'finish':
        this.court.cheer(2, e.v === 1 ? 1 : 0);
        break;
    }
    this.onEvent?.(e);
  }

  private primFx(e: MatchEvent, p: Player | null): void {
    const m = this.sim!;
    const fx = this.effects;
    const kind = e.kind!;
    const risk = kind.startsWith('risk:');
    const at = new THREE.Vector3(p?.p.x ?? e.x ?? 0, 1, p?.p.z ?? e.z ?? 0);
    const team = m.teamOf(e.team);
    const other = m.teamOf(e.team === 0 ? 1 : 0);
    if (this.labels && !(kind === 'lucky' && e.label === 'roll')) fx.word(this.labels.prim(kind), at.clone().setY(risk ? 2.6 : 3), risk ? '#ff5b5b' : this.kits[e.team].css, risk ? 1.1 : 1.2);
    switch (kind) {
      case 'pushWave':
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          fx.emit('dust', at.clone().setY(0.6), 1, { speed: 8, up: 0.3, life: 0.5, size: 0.8, grow: 2, gravity: 0, dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) });
        }
        break;
      case 'stunCarrier':
        if (e.b !== undefined && e.b >= 0) fx.emit('dust', new THREE.Vector3(m.players[e.b].p.x, 1.2, m.players[e.b].p.z), 14, { speed: 2, up: 1.5, life: 0.8, size: 0.6, color: 0xbff0ff });
        break;
      case 'swap':
      case 'swapPass':
        for (const q of team) fx.emit('smoke', new THREE.Vector3(q.p.x, 0.8, q.p.z), 6, { speed: 1.5, up: 1, life: 0.6, size: 0.9 });
        break;
      case 'markWrong':
      case 'decoyBall':
      case 'spotlight':
        for (const q of other) if (q.state === 'confuse') fx.emit('question', new THREE.Vector3(q.p.x, 2.2, q.p.z), 2, { speed: 0.8, up: 1, life: 1, size: 0.6, gravity: 0 });
        if (kind === 'spotlight') fx.emit('spark', at.clone().setY(2.5), 16, { speed: 2, up: 3, life: 0.9, size: 0.6, color: 0xfff2a8 });
        break;
      case 'paintWall':
      case 'blockBoost':
      case 'calm':
      case 'screen':
        fx.emit('spark', at.clone().setY(1.2), 14, { speed: 3, up: 1, life: 0.6, size: 0.6, color: 0x7cc8ff });
        break;
      case 'lowGravity':
        for (const q of team) fx.emit('star', new THREE.Vector3(q.p.x, 0.5, q.p.z), 4, { speed: 1, up: 2, life: 1, size: 0.4, gravity: -1, color: 0xd8e6ff });
        break;
      case 'recover':
        for (const q of team) fx.emit('heart', new THREE.Vector3(q.p.x, 1.8, q.p.z), 2, { speed: 1, up: 1.5, life: 0.9, size: 0.45 });
        break;
      case 'sprint':
      case 'fastBreak':
      case 'crossover':
      case 'pickAndRoll':
      case 'powerDunk':
      case 'stealBoost':
      case 'doubleTeam':
        fx.emit('flame', at.clone().setY(0.6), 10, { speed: 3, up: 1, life: 0.5, size: 0.6 });
        break;
      case 'lucky':
        fx.emit('star', at.clone().setY(2), 12, { speed: 3, up: 2, life: 0.8, size: 0.55, color: 0xffd23f });
        break;
      default:
        fx.emit('star', at.clone().setY(risk ? 1.1 : 1.5), 8, { speed: 3, up: 2, life: 0.5, size: 0.45 });
    }
  }

  private skillBurst(kind: string, p: Player): void {
    const fx = this.effects;
    const at = new THREE.Vector3(p.p.x, 0.8, p.p.z);
    switch (kind) {
      case 'shockwave':
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          fx.emit('dust', at, 1, { speed: 8, up: 0.4, life: 0.5, size: 0.9, grow: 2, gravity: 0, dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) });
        }
        break;
      case 'powerShot':
      case 'dash':
        fx.emit('flame', at, 12, { speed: 3, up: 1, life: 0.5, size: 0.6 });
        break;
      case 'curveShot':
      case 'blink':
      case 'decoy':
        fx.emit('smoke', at, 14, { speed: 2, up: 1.5, life: 0.7, size: 0.9 });
        fx.emit('question', at.clone().setY(2), 3, { speed: 1, up: 1.5, life: 1, size: 0.6, gravity: 0 });
        break;
      case 'disable':
        fx.emit('spark', at.clone().setY(1.5), 10, { speed: 3, up: 2, life: 0.6, size: 0.5 });
        break;
      case 'steal':
        fx.emit('heart', at.clone().setY(1.6), 6, { speed: 2, up: 1.5, life: 0.8, size: 0.5 });
        break;
      case 'wall':
        fx.emit('spark', at.clone().setY(1.2), 16, { speed: 3, up: 1, life: 0.6, size: 0.6, color: 0x7cc8ff });
        break;
      case 'rally':
        fx.emit('heart', at.clone().setY(1.6), 10, { speed: 2, up: 2, life: 1, size: 0.6 });
        break;
      case 'cloud':
        fx.emit('gas', at, 18, { speed: 2, up: 1, life: 1.2, size: 1.2, grow: 1.6 });
        break;
      case 'rain': {
        const z = this.sim!.zones.filter((q) => q.kind === 'rain').pop();
        const props = p.skill.opts?.props ?? (p.skill.opts?.prop ? [p.skill.opts.prop] : ['🏀']);
        if (z) for (let i = 0; i < 4; i++) this.dropProp(props[i % props.length], z.x + (Math.random() - 0.5) * 2, z.z + (Math.random() - 0.5) * 2, 7 + i * 1.2);
        break;
      }
      default:
        fx.emit('star', at.clone().setY(1.5), 12, { speed: 4, up: 2, life: 0.6, size: 0.5 });
    }
  }

  private dropProp(text: string, x: number, z: number, y: number): void {
    const tpl = this.propTemplates.get(text);
    if (!tpl) {
      this.effects.emit('star', new THREE.Vector3(x, 0.5, z), 6, { speed: 3, up: 3, life: 0.6, size: 0.6 });
      return;
    }
    const inst = tpl.instantiate();
    inst.group.scale.setScalar(1 / Math.max(tpl.width, tpl.height));
    inst.group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.scene.add(inst.group);
    this.falling.push({ inst, x, z, y, vy: 0, spin: (Math.random() - 0.5) * 6, life: 2.2 });
  }

  private updateFalling(dt: number): void {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.life -= dt;
      if (f.y > 0.4) {
        f.vy -= 22 * dt;
        f.y = Math.max(0.4, f.y + f.vy * dt);
        if (f.y === 0.4) this.effects.emit('dust', new THREE.Vector3(f.x, 0.3, f.z), 8, { speed: 3, up: 1, life: 0.4, size: 0.6 });
      }
      f.inst.group.position.set(f.x, f.y, f.z);
      f.inst.group.rotation.set(0, this.camAz, f.spin * f.life * 0.3);
      if (f.life <= 0) {
        f.inst.dispose();
        f.inst.group.removeFromParent();
        this.falling.splice(i, 1);
      }
    }
  }

  private clearFalling(): void {
    for (const f of this.falling) {
      f.inst.dispose();
      f.inst.group.removeFromParent();
    }
    this.falling = [];
  }

  // ---------------------------------------------------------------- camera

  private updateCamera(dt: number): void {
    const m = this.sim;
    let tx = 0, tz = 0.5, zoom = 0.85;
    if (m) {
      const b = m.ball;
      tx = THREE.MathUtils.clamp(b.p.x + b.v.x * 0.2, -7.5, 7.5);
      tz = THREE.MathUtils.clamp(b.p.z * 0.35, -2.5, 2.5);
      zoom = m.phase === 'intro' ? 1.15 : 1;
      if (this.focus) {
        this.focus.t -= dt;
        tx = this.focus.x;
        tz = this.focus.z;
        zoom = this.focus.zoom;
        if (this.focus.t <= 0) this.focus = null;
      }
    }
    const k = Math.min(1, dt * 3);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.z += (tz - this.camTarget.z) * k;
    const dist = 19 * zoom * this.camZoom;
    const pitch = m ? 0.55 : 0.34;
    // Look up with the action when glyphs fly.
    const high = m ? Math.max(m.ball.p.y, ...m.players.map((q) => q.y + 1)) : 1;
    this.camTarget.y += (THREE.MathUtils.clamp(high * 0.45 + 0.4, 1, 3.2) - this.camTarget.y) * Math.min(1, dt * 2);
    const want = new THREE.Vector3(this.camTarget.x + Math.sin(this.camAz) * dist, dist * pitch + this.camTarget.y * 0.5, this.camTarget.z + Math.cos(this.camAz) * dist);
    this.camPos.lerp(want, Math.min(1, dt * 2.5));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget.x, this.camTarget.y, this.camTarget.z);
  }

  private bindPointer(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) this.camAz = THREE.MathUtils.clamp(this.camAz - (e.clientX - prev.x) * 0.006, -1.2, 1.2);
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.camZoom = THREE.MathUtils.clamp(this.camZoom * (pinch / d), 0.5, 1.6);
        pinch = d;
      }
    });
    const up = (e: PointerEvent) => pts.delete(e.pointerId);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camZoom = THREE.MathUtils.clamp(this.camZoom * (1 + Math.sign(e.deltaY) * 0.08), 0.5, 1.6);
    }, { passive: false });
    el.addEventListener('dblclick', () => {
      this.camAz = 0;
      this.camZoom = 1;
    });
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 58 : 40;
    this.effects?.setViewport(this.renderer.getDrawingBufferSize(new THREE.Vector2()).y, this.camera.fov);
    if (this.focusOffset.x || this.focusOffset.y) this.camera.setViewOffset(w, h, w * this.focusOffset.x, h * this.focusOffset.y, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private trackFps(dt: number): void {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc < 1) return;
    this.fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = this.fpsFrames = 0;
    if (document.hidden) return;
    this.slowFrames = this.fps < 40 ? this.slowFrames + 1 : 0;
    if (this.slowFrames >= 3 && this.quality === 'high') this.setQuality('low');
  }

  fanScreen(i: number): { x: number; y: number; visible: boolean } {
    const v = this.court.fanHead(i, new THREE.Vector3()).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    const visible = v.z < 1 && v.x > -0.95 && v.x < 0.95 && v.y > -0.9 && v.y < 0.85;
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, visible };
  }

  capture(): HTMLCanvasElement {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d')!.drawImage(src, 0, 0);
    return c;
  }

  async warmUp(): Promise<void> {
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      /* optional */
    }
  }
}

function radial(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cardboard with packing tape (culture obstacle boxes). */
function crateTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c99a5b';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e8d3a3';
  g.fillRect(52, 0, 24, 128);
  g.strokeStyle = '#7a5530';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 122);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Orange ball with black seams (equirectangular map). */
function basketballTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#f08a2c');
  g.addColorStop(0.5, '#ff9a3c');
  g.addColorStop(1, '#e07a22');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(120,50,10,0.18)';
  for (let i = 0; i < 1400; i++) ctx.fillRect((i * 131) % 512, (i * 71) % 256, 2, 2);
  ctx.strokeStyle = '#2b1a12';
  ctx.lineWidth = 6;
  // Equator and two meridians.
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(512, 128);
  for (const x of [128, 384]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
  }
  ctx.stroke();
  // Curved side seams.
  for (const cx of [0, 256, 512]) {
    ctx.beginPath();
    for (let y = 0; y <= 256; y += 4) {
      const x = cx + Math.sin((y / 256) * Math.PI) * 70 * (cx === 256 ? 1 : cx === 0 ? 1 : -1);
      if (y) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
