/**
 * ArenaRenderer — Three.js scene: toy arena, lights, camera director, fighter views and
 * effects. It *reads* BattleSimulator state every frame and never feeds back into it.
 */
import * as THREE from 'three';
import { ARENA, BattleSimulator, DT } from '../core/battle/BattleSimulator';
import type { FighterState } from '../core/battle/FighterController';
import type { BattleEvent } from '../core/battle/types';
import { processInput, type ProcessedInput } from '@shared/core/InputProcessor';
import { hashString } from '@shared/core/rng';
import { MOVE_TABLE } from '@shared/core/SignatureMoves';
import { BoxingStage } from './BoxingStage';
import { Effects } from '@shared/render/Effects';
import type { FighterBundle } from '@shared/render/FighterFactory';
import { buildGlyphModel, type GlyphInstance, type GlyphTemplate } from '@shared/render/Glyph3DFactory';
import { renderGlyph } from '@shared/render/GlyphRenderer';

export type Quality = 'high' | 'low';

export interface ComicWords {
  hit: string[];
  crit: string[];
  wall: string[];
  pop: string[];
  explode: string[];
  trip: string[];
  stomp: string[];
  slip: string[];
  zap: string[];
  throw: string[];
  reflect: string[];
  roar: string[];
  chomp: string[];
  giant: string[];
  coin: string[];
  joke: string[];
  heal: string[];
  gulp: string[];
  spit: string[];
  slap: string[];
  fake: string[];
  glitch: string[];
  pan: string[];
  soot: string[];
}

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const PREVIEW_X = 2.5;

function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

class FighterView {
  readonly root = new THREE.Group();
  readonly tiltG = new THREE.Group();
  readonly bodyG = new THREE.Group();
  readonly shadow: THREE.Mesh;
  inst: GlyphInstance | null = null;
  bundle: FighterBundle | null = null;
  yaw = 0;
  squash = 0;
  squashV = 0;
  flash = 0;
  dropY = 0;
  dropV = 0;
  fxClock = 0;
  previewT = 0;
  hueShift = 0;
  sizeMul = 1;
  /** Horizontal stretch (一刀两断). */
  stretch = 1;
  /** 0‥1 soot darkening (引火烧身). */
  darken = 0;
  /** Which way the held fish is swinging (摸鱼大师). */
  slapSide = 1;
  swing = 0;
  held: { prop: string; inst: GlyphInstance } | null = null;
  private baseColors: THREE.Color[] = [];
  /** Exact local bounds of the model geometry (bevels included), for floor contact. */
  private bounds = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.2), new THREE.Vector3(0.5, 0.5, 0.2));
  private corner = new THREE.Vector3();
  private qAll = new THREE.Quaternion();
  readonly shieldMesh: THREE.Mesh;
  readonly beamMesh: THREE.Group;
  readonly beamMats: THREE.MeshBasicMaterial[] = [];
  private qT = new THREE.Quaternion();
  private qY = new THREE.Quaternion();
  private axis = new THREE.Vector3();

  constructor(
    readonly idx: 0 | 1,
    scene: THREE.Scene,
    shadowTex: THREE.Texture,
  ) {
    this.root.add(this.tiltG);
    this.tiltG.add(this.bodyG);
    scene.add(this.root);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.35 }),
    );
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x9fe3ff, emissive: 0x2a7fff, emissiveIntensity: 0.6, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);
    // Beam: a glowing tube along +Z from the fighter's centre (scaled per frame).
    this.beamMesh = new THREE.Group();
    const tube = (r: number, col: number, op: number) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 1, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      this.beamMesh.add(m);
      this.beamMats.push(m.material as THREE.MeshBasicMaterial);
    };
    tube(0.42, 0xffd23f, 0.35);
    tube(0.18, 0xffffff, 0.9);
    this.beamMesh.visible = false;
    scene.add(this.beamMesh);
  }

  get h(): number {
    return this.bundle?.template.height ?? 1;
  }
  get d(): number {
    return this.bundle?.template.depth ?? 0.3;
  }
  get radius(): number {
    return this.bundle?.spec.radius ?? 0.6;
  }

  setBundle(b: FighterBundle | null, hueShift = 0): void {
    this.inst?.dispose();
    this.inst = null;
    this.bundle = b;
    if (b) {
      this.inst = b.template.instantiate();
      // Always in the transparent pass so fading (ghost phase) never forces a shader rebuild mid-fight.
      for (const m of this.inst.materials) m.transparent = true;
      // Recolour untextured parts so two similar-coloured fighters stay distinguishable.
      if (hueShift) for (const m of this.inst.materials) if (!m.map) m.color.offsetHSL(hueShift / 360, 0, 0);
      this.baseColors = this.inst.materials.map((m) => m.color.clone());
      this.bounds.makeEmpty();
      this.inst.group.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (!g) return;
        g.computeBoundingBox();
        this.bounds.union(g.boundingBox!);
      });
      this.bodyG.add(this.inst.group);
      this.dropY = 3.2;
      this.dropV = 0;
    }
    this.root.visible = !!b;
    this.shadow.visible = !!b;
  }

  kick(squash: number, flash = 0): void {
    this.squashV += squash * 14;
    this.flash = Math.max(this.flash, flash);
  }

  /** Common per-frame animation (squash spring, flash, tint). */
  animate(dt: number, tint: THREE.Color | null, opacity = 1): void {
    this.squashV += (-this.squash * 140 - this.squashV * 13) * dt;
    this.squash += this.squashV * dt;
    const s = Math.max(-0.35, Math.min(0.45, this.squash));
    this.bodyG.scale.set((1 + s * 0.55) * this.stretch, 1 - s, 1 + s * 0.4).multiplyScalar(this.sizeMul);
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.inst) {
      for (const m of this.inst.materials) {
        m.emissive.setRGB(this.flash, this.flash, this.flash);
        if (tint) m.emissive.add(tint);
        m.opacity = opacity;
      }
      this.inst.materials.forEach((m, i) => {
        const base = this.baseColors[i];
        if (base) m.color.copy(base).multiplyScalar(1 - 0.75 * this.darken);
      });
    }
  }

  /** Place the model given a world-space lean vector and a yaw. */
  pose(x: number, baseY: number, z: number, tx: number, tz: number, yaw: number): void {
    const th = Math.hypot(tx, tz);
    if (th > 1e-5) this.qT.setFromAxisAngle(this.axis.set(tz / th, 0, -tx / th), th);
    else this.qT.identity();
    this.qY.setFromAxisAngle(UP, yaw);
    this.tiltG.quaternion.copy(this.qT).multiply(this.qY);
    // Keep the lowest corner of the (scaled, rotated) model box on the floor, so a wide glyph
    // lying on its side or a stretched/grown one never sinks into the canvas.
    this.qAll.copy(this.tiltG.quaternion);
    const sc = this.bodyG.scale, b = this.bounds;
    let minY = Infinity;
    for (let i = 0; i < 8; i++) {
      this.corner.set((i & 1 ? b.max.x : b.min.x) * sc.x, (i & 2 ? b.max.y : b.min.y) * sc.y, (i & 4 ? b.max.z : b.min.z) * sc.z).applyQuaternion(this.qAll);
      if (this.corner.y < minY) minY = this.corner.y;
    }
    this.root.position.set(x, baseY - minY, z);
  }

  placeShadow(x: number, y: number, z: number, onPlatform: boolean, strength: number): void {
    this.shadow.visible = onPlatform && this.root.visible;
    const k = Math.max(0, 1 - y / 5);
    this.shadow.position.set(x, 0.015, z);
    this.shadow.scale.setScalar(this.radius * 2.6 * (0.6 + 0.4 * k));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = strength * k;
  }

  dispose(): void {
    this.setBundle(null);
  }
}

export class ArenaRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  readonly effects: Effects;
  private views: [FighterView, FighterView];
  private sun: THREE.DirectionalLight;
  readonly stage: BoxingStage;
  private timer = new THREE.Timer();
  private time = 0;
  sim: BattleSimulator | null = null;
  paused = false;
  quality: Quality = 'high';
  words: ComicWords = { hit: ['POW!'], crit: ['KAPOW!'], wall: ['BONK!'], pop: ['BOING!'], explode: ['BOOM!'], trip: ['OOPS!'], stomp: ['STOMP!'], slip: ['WHOOPS!'], zap: ['ZAP!'], throw: ['HEAVE!'], reflect: ['BLOCKED!'], roar: ['ROAR!'], chomp: ['CHOMP!'], giant: ['GIANT!'], coin: ['$$$'], joke: ['...'], heal: ['HEAL'], gulp: ['GULP!'], spit: ['PTOOEY!'], slap: ['SLAP!'], fake: ['FAKE!'], glitch: ['404'], pan: ['CLANG!'], soot: ['*cough*'] };
  onEvent: ((e: BattleEvent) => void) | null = null;
  onBattleDone: ((sim: BattleSimulator) => void) | null = null;
  onQualityAutoDrop: (() => void) | null = null;
  /** Localised signature-move name for the pop-up title. */
  moveLabel: (f: FighterState) => string = (f) => f.spec.signature.name.en;
  /** Things in flight: meteors (fireball mesh) and props (glyph models: ⌨️ ┻━┻ GG 🔨 …). */
  private flying: { obj: THREE.Object3D; prop: string; inst: GlyphInstance | null; from: THREE.Vector3; x: number; z: number; t: number; dur: number; arc: boolean; size: number }[] = [];
  private propTemplates = new Map<string, GlyphTemplate>();
  private propPool = new Map<string, GlyphInstance[]>();
  /** 全家出动: little copies of a fighter closing in on the opponent. */
  private clones: { inst: GlyphInstance; ang: number; cx: number; cz: number; t: number }[] = [];
  /** 一键关灯: seconds of darkness left, and the current light level (1 = normal). */
  private darkT = 0;
  private lightLevel = 1;
  private hemiBase = 1.1;
  private meteorGeo = new THREE.SphereGeometry(0.45, 14, 10);
  private meteorMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 1.2, roughness: 0.4 });
  private acc = 0;
  private hitStop = 0;
  private slowMo = 0;
  private shake = 0;
  private doneReported = false;
  // Camera state.
  private camAz = 0;
  private camEl = 0.3;
  private camDist = 14;
  private camTarget = new THREE.Vector3(0, 0.9, 0);
  private userYaw = 0;
  private userPitch = 0;
  private userZoom = 1;
  private focusOffset = { x: 0, y: 0 };
  private frameTimes: number[] = [];
  private autoQuality = true;
  /** Last resort when even low quality is slow: render below native resolution. */
  private potato = false;
  private spots: THREE.SpotLight[] = [];
  private hemi = new THREE.HemisphereLight(0xc9c4ff, 0x2a1f55, 1.1);
  /** Smoothed frames per second (for the ?fps overlay). */
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'stage';
    container.appendChild(this.renderer.domElement);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.1);
    this.buildLights();
    this.stage = new BoxingStage(this.scene);
    this.effects = new Effects(this.scene);
    const shadowTex = this.radialTexture('rgba(40,20,70,0.9)', 'rgba(40,20,70,0)');
    this.views = [new FighterView(0, this.scene, shadowTex), new FighterView(1, this.scene, shadowTex)];
    this.views.forEach((v) => v.setBundle(null));
    this.setQuality('high');
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- world

  private radialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildLights(): void {
    const s = this.scene;
    // Dark arena: navy-to-purple backdrop, warm key light on the ring, coloured rims.
    const sky = document.createElement('canvas');
    sky.width = 4;
    sky.height = 256;
    const sctx = sky.getContext('2d')!;
    const sg = sctx.createLinearGradient(0, 0, 0, 256);
    sg.addColorStop(0, '#0d0b22');
    sg.addColorStop(0.6, '#2a1f55');
    sg.addColorStop(1, '#4a2f6e');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(sky);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    s.background = skyTex;
    s.fog = new THREE.Fog(0x1d1638, 26, 60);

    s.add(this.hemi);
    this.sun.position.set(4, 14, 7);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -9;
    sc.right = sc.top = 9;
    sc.near = 2;
    sc.far = 40;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    s.add(this.sun);
    for (const [col, x, z] of [[0xff5fa0, -9, 6], [0x5fd0ff, 9, 6], [0xffd23f, 0, -10]] as const) {
      const spot = new THREE.SpotLight(col, 60, 30, 0.45, 0.6, 1.4);
      spot.position.set(x, 10, z);
      spot.target.position.set(0, 0, 0);
      s.add(spot, spot.target);
      this.spots.push(spot);
    }
  }

  // ---------------------------------------------------------------- public API

  setFighter(slot: 0 | 1, b: FighterBundle | null, hueShift = 0): void {
    if (this.views[slot].bundle === b && this.views[slot].hueShift === hueShift) return;
    this.views[slot].hueShift = hueShift;
    this.views[slot].setBundle(b, hueShift);
    this.views[slot].previewT = 0;
  }

  /** Shift the rendered view (fractions of the canvas) so UI panels don't cover the action. */
  setFocusOffset(fracX: number, fracY: number): void {
    this.focusOffset = { x: fracX, y: fracY };
    this.resize();
  }

  startBattle(sim: BattleSimulator): void {
    this.sim = sim;
    this.stage.busy = true;
    this.paused = false;
    this.acc = 0;
    this.slowMo = 0;
    this.hitStop = 0;
    this.doneReported = false;
    this.effects.clear();
    this.clearFlying();
    this.clearClones();
    this.views.forEach((v) => {
      this.releaseHeld(v);
      v.stretch = 1;
      v.darken = 0;
      v.squash = v.squashV = 0;
      v.yaw = this.camAz;
    });
  }

  stopBattle(): void {
    this.stage.busy = false;
    this.sim = null;
    this.effects.clear();
    this.clearFlying();
    this.views.forEach((v) => this.releaseHeld(v));
    this.clearClones();
    this.views.forEach((v) => {
      v.sizeMul = 1;
      v.shieldMesh.visible = false;
      v.beamMesh.visible = false;
    });
    this.views.forEach((v) => {
      v.dropY = 3.2;
      v.dropV = 0;
      v.previewT = 0;
      v.root.visible = !!v.bundle;
    });
  }

  resetCamera(): void {
    this.userYaw = this.userPitch = 0;
    this.userZoom = 1;
  }

  setQuality(q: Quality, auto = false): void {
    this.quality = q;
    if (!auto) this.autoQuality = false;
    const high = q === 'high';
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.sun.shadow.mapSize.set(high ? 1024 : 512, high ? 1024 : 512);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    // Pixel count dominates GPU cost; even "high" stops at 1.5× on retina screens.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.5 : 1) * (this.potato ? 0.75 : 1));
    // Coloured spotlights and light beams are expensive per pixel; low quality brightens the fill light instead.
    for (const sp of this.spots) sp.visible = high;
    this.hemiBase = high ? 1.1 : 1.8;
    this.hemi.intensity = this.hemiBase * this.lightLevel;
    this.stage?.setQuality(high);
    if (this.effects) this.effects.density = high ? 1 : 0.45;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  /** Build the 3D props used by signature moves (from the move table) with the glyph pipeline. */
  async loadProps(): Promise<void> {
    const texts = new Set<string>(['🐟', '🍳']);
    for (const e of MOVE_TABLE) {
      if (e.opts?.prop) texts.add(e.opts.prop);
      for (const p of e.opts?.props ?? []) texts.add(p);
    }
    for (const t of texts) {
      if (this.propTemplates.has(t)) continue;
      const p = processInput(t);
      if (!p.ok) continue;
      try {
        const raster = await renderGlyph(p as ProcessedInput);
        this.propTemplates.set(t, buildGlyphModel(raster, hashString(t) % 360).template);
      } catch {
        /* a missing prop falls back to the fireball */
      }
    }
  }

  private acquireProp(text: string, size: number): GlyphInstance | null {
    const tpl = this.propTemplates.get(text);
    if (!tpl) return null;
    const inst = this.propPool.get(text)?.pop() ?? tpl.instantiate();
    inst.group.scale.setScalar(size / Math.max(tpl.width, tpl.height));
    inst.group.rotation.set(0, 0, 0);
    inst.group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.scene.add(inst.group);
    return inst;
  }

  private releaseProp(text: string, inst: GlyphInstance): void {
    inst.group.removeFromParent();
    if (!this.propPool.has(text)) this.propPool.set(text, []);
    this.propPool.get(text)!.push(inst);
  }

  private releaseHeld(v: FighterView): void {
    if (v.held) this.releaseProp(v.held.prop, v.held.inst);
    v.held = null;
  }

  private clearClones(): void {
    for (const c of this.clones) c.inst.dispose();
    this.clones.length = 0;
    this.darkT = 0;
  }

  private clearFlying(): void {
    for (const m of this.flying) {
      if (m.inst) this.releaseProp(m.prop, m.inst);
      else m.obj.removeFromParent();
    }
    this.flying.length = 0;
  }

  /** Something flies to (x, z): a fireball, or a prop that falls or is thrown in an arc. */
  private launch(prop: string, from: THREE.Vector3, x: number, z: number, dur: number, arc: boolean, size: number): void {
    const inst = prop ? this.acquireProp(prop, size) : null;
    let obj: THREE.Object3D;
    if (inst) obj = inst.group;
    else {
      obj = new THREE.Mesh(this.meteorGeo, this.meteorMat);
      obj.castShadow = true;
      this.scene.add(obj);
    }
    this.flying.push({ obj, prop, inst, from: from.clone(), x, z, t: 0, dur, arc, size });
  }

  /**
   * Compile every effect's shader up front (meteors, beams, shields, particles, words), so the
   * first special move of a match doesn't hitch while the GPU builds programs.
   */
  async warmUp(): Promise<void> {
    const temp: THREE.Object3D[] = [new THREE.Mesh(this.meteorGeo, this.meteorMat), new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }))];
    for (const t of this.propTemplates.values()) temp.push(t.instantiate().group);
    temp.forEach((o) => {
      o.position.set(0, -50, 0);
      this.scene.add(o);
    });
    const shown: THREE.Object3D[] = [];
    for (const v of this.views) {
      for (const o of [v.shieldMesh, v.beamMesh]) {
        if (!o.visible) {
          o.visible = true;
          shown.push(o);
        }
      }
    }
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    shown.forEach((o) => (o.visible = false));
    temp.forEach((o) => o.removeFromParent());
  }

  /** Render the current frame and copy it (for the result image). */
  capture(): HTMLCanvasElement {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d')!.drawImage(src, 0, 0);
    return c;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.effects?.setViewport(this.renderer.getDrawingBufferSize(new THREE.Vector2()).y, this.camera.fov);
    if (this.focusOffset.x || this.focusOffset.y) this.camera.setViewOffset(w, h, w * this.focusOffset.x, h * this.focusOffset.y, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- input

  private bindPointer(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let lastTap = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      const now = performance.now();
      if (now - lastTap < 300) this.resetCamera();
      lastTap = now;
    });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 1) {
        this.userYaw -= dx * 0.006;
        this.userPitch = Math.max(-0.25, Math.min(0.8, this.userPitch + dy * 0.004));
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.userZoom = Math.max(0.55, Math.min(1.7, this.userZoom * (pinch / d)));
        pinch = d;
      }
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.userZoom = Math.max(0.55, Math.min(1.7, this.userZoom * Math.exp(e.deltaY * 0.001)));
      },
      { passive: false },
    );
  }

  // ---------------------------------------------------------------- frame loop

  private frame(): void {
    this.timer.update();
    const dtReal = Math.min(0.05, this.timer.getDelta());
    this.trackPerformance(dtReal);
    this.tick(dtReal);
    this.renderer.render(this.scene, this.camera);
  }

  /** Debug/testing: simulate `seconds` of frames at 60 fps, then render once. */
  advance(seconds: number): void {
    for (let i = 0; i < Math.round(seconds * 60); i++) this.tick(1 / 60);
    this.renderer.render(this.scene, this.camera);
  }

  private tick(dtReal: number): void {
    this.time += dtReal;
    // 一键关灯: fade the arena lights down and back up.
    this.darkT = Math.max(0, this.darkT - dtReal);
    const lightTarget = this.darkT > 0 ? 0.22 : 1;
    if (Math.abs(lightTarget - this.lightLevel) > 0.001) {
      this.lightLevel += (lightTarget - this.lightLevel) * Math.min(1, dtReal * 6);
      this.hemi.intensity = this.hemiBase * this.lightLevel;
      this.sun.intensity = 2.1 * this.lightLevel;
      for (const sp of this.spots) sp.intensity = 60 * (0.4 + 0.6 * this.lightLevel);
    }
    if (this.sim) this.updateBattle(dtReal);
    else this.updatePreview(dtReal);
    this.effects.update(dtReal * (this.sim && this.slowMo > 0 ? 0.5 : 1));
    this.stage.update(dtReal, this.sim ? this.sim.fighters : null, this.sim ? this.sim.ropeLevel : 1);
    this.updateCamera(dtReal);
  }

  private trackPerformance(dt: number): void {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = this.fpsFrames = 0;
    }
    if (!this.autoQuality || this.potato || document.hidden) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (this.quality === 'high' && avg > 1 / 45) {
      this.setQuality('low', true);
      this.onQualityAutoDrop?.();
    } else if (this.quality === 'low' && avg > 1 / 32) {
      this.potato = true;
      this.setQuality('low', true);
    }
  }

  private updatePreview(dt: number): void {
    for (const v of this.views) {
      if (!v.bundle) continue;
      v.previewT += dt;
      v.dropV -= 26 * dt;
      v.dropY += v.dropV * dt;
      if (v.dropY <= 0) {
        if (v.dropV < -3) v.kick(Math.min(0.4, -v.dropV * 0.035));
        v.dropY = 0;
        v.dropV = v.dropV < -3 ? -v.dropV * 0.28 : 0;
      }
      const sgn = v.idx === 0 ? -1 : 1;
      const yaw = this.camAz + Math.sin(v.previewT * 0.9 + v.idx * 1.7) * 0.6;
      const lean = Math.sin(v.previewT * 2.2 + v.idx) * 0.06;
      v.squash += Math.sin(v.previewT * 4 + v.idx) * 0.0015;
      v.animate(dt, null);
      v.pose(sgn * PREVIEW_X, v.dropY, 0, lean, 0, yaw);
      v.placeShadow(sgn * PREVIEW_X, v.dropY, 0, true, this.quality === 'high' ? 0.22 : 0.4);
    }
  }

  private updateBattle(dtReal: number): void {
    const sim = this.sim!;
    let scale = 1;
    if (this.hitStop > 0) {
      this.hitStop -= dtReal;
      scale = 0.2;
    } else if (this.slowMo > 0) {
      this.slowMo -= dtReal;
      scale = 0.35;
    }
    if (!this.paused && sim.phase !== 'done') {
      this.acc += dtReal * scale;
      let n = 0;
      while (this.acc >= DT && n < 6) {
        sim.step();
        this.acc -= DT;
        n++;
        for (const e of sim.drainEvents()) this.handleEvent(e);
        if (this.hitStop > 0) {
          this.acc = 0;
          break;
        }
      }
    }
    if (sim.phase === 'done' && !this.doneReported) {
      this.doneReported = true;
      this.stage.busy = false;
      this.onBattleDone?.(sim);
    }
    const dtAnim = this.paused ? 0 : dtReal;
    for (const v of this.views) this.syncView(v, sim.fighters[v.idx], dtAnim);
    // 全家出动 clones: converge on the opponent, jostle, then scatter.
    for (let i = this.clones.length - 1; i >= 0; i--) {
      const c = this.clones[i];
      c.t += dtAnim * scale;
      const r = c.t < 0.8 ? 2.6 - (c.t / 0.8) * 1.6 : c.t < 1.3 ? 1.0 + Math.sin(c.t * 40) * 0.08 : 1.0 + (c.t - 1.3) * 12;
      const a = c.ang + c.t * 2;
      c.inst.group.position.set(c.cx + Math.cos(a) * r, 0.45 + Math.abs(Math.sin(c.t * 14)) * 0.35, c.cz + Math.sin(a) * r);
      c.inst.group.rotation.set(0, this.camAz, Math.sin(c.t * 18) * 0.25);
      if (c.t > 1.7) {
        c.inst.dispose();
        this.clones.splice(i, 1);
      }
    }
    // Meteors and props in flight.
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const m = this.flying[i];
      m.t += dtAnim * scale;
      const k = Math.min(1, m.t / m.dur);
      if (m.arc) {
        // Thrown: parabola from the thrower, flipping end over end (掀桌 / 甩锅 / paperwork).
        m.obj.position.set(m.from.x + (m.x - m.from.x) * k, m.from.y + (0.4 - m.from.y) * k + Math.sin(Math.PI * k) * 3, m.from.z + (m.z - m.from.z) * k);
        m.obj.rotation.set(k * Math.PI * 2, Math.atan2(m.x - m.from.x, m.z - m.from.z), 0);
      } else {
        m.obj.position.set(m.x - (1 - k) * 1.5, 9 * (1 - k) + 0.5 * m.size, m.z);
        m.obj.rotation.x += dtAnim * (m.inst ? 4 : 8);
        if (!m.inst && dtAnim > 0 && Math.random() < 0.6) this.effects.emit('flame', m.obj.position, 1, { speed: 0.4, up: 0.5, gravity: 0, life: 0.35, size: 0.55, grow: 1.5 });
      }
      if (k >= 1) {
        if (m.inst) this.releaseProp(m.prop, m.inst);
        else m.obj.removeFromParent();
        this.flying.splice(i, 1);
      }
    }
  }

  private syncView(v: FighterView, f: FighterState, dt: number): void {
    if (!v.bundle) return;
    // Face the audience (camera), turning a little toward where it is going / attacking.
    const rx = Math.cos(this.camAz), rz = -Math.sin(this.camAz);
    const vRight = f.v.x * rx + f.v.z * rz;
    const fRight = f.face.x * rx + f.face.z * rz;
    const turn = Math.max(-0.6, Math.min(0.6, vRight * 0.06 + fRight * 0.35));
    const target = this.camAz + turn;
    v.yaw += angleDiff(target, v.yaw) * Math.min(1, dt * 7);
    let jx = 0, jz = 0, sink = 0;
    const angry = f.has('angry') || f.angryBuff > 0;
    if (f.state === 'windup' || f.state === 'dashWind' || f.state === 'fuse' || (angry && f.state === 'idle')) {
      const amp = f.state === 'fuse' ? 0.05 : 0.025;
      jx = (Math.random() - 0.5) * amp * 2;
      jz = (Math.random() - 0.5) * amp * 2;
    }
    if (f.state === 'windup' || f.state === 'dashWind' || f.state === 'pounceWind') v.squash += (0.12 - v.squash) * Math.min(1, dt * 12);
    if (f.state === 'sleep') {
      sink = -0.06;
      v.squash += (0.1 - v.squash) * Math.min(1, dt * 4);
    }
    if (f.state === 'idle' || f.state === 'circle') v.squash += Math.sin(this.time * 5 + v.idx) * 0.002;
    v.sizeMul = f.sizeMul;
    // A held broom (扫把) does the reaching; the glyph itself keeps its width.
    const stretchTarget = f.spec.signature.opts?.noStretch ? 1 : f.stretch;
    v.stretch += (stretchTarget - v.stretch) * Math.min(1, dt * 14);
    v.darken = Math.min(1, f.sootT / 1.2);
    // Scale first (squash/stretch/size), then pose, so floor contact uses this frame's shape.
    let tint: THREE.Color | null = null;
    if (f.state === 'charmed') tint = new THREE.Color(0.35, 0.05, 0.18).multiplyScalar(0.6 + 0.4 * Math.sin(this.time * 10));
    else if (f.state === 'fuse') tint = Math.sin(this.time * (14 + f.stateT * 30)) > 0 ? new THREE.Color(0.6, 0.05, 0) : null;
    else if (f.state === 'stunned') tint = new THREE.Color(0.12, 0.12, 0);
    else if (f.state === 'frozen') tint = new THREE.Color(0.15, 0.4, 0.75);
    else if (f.state === 'signature' && f.stateT < 0.35) tint = new THREE.Color(0.45, 0.35, 0.1).multiplyScalar(1 - f.stateT / 0.35);
    else if (f.poisonT > 0) tint = new THREE.Color(0.1, 0.35, 0.02).multiplyScalar(0.6 + 0.4 * Math.sin(this.time * 8));
    const kindNow = f.state === 'signature' ? f.sigKind : null;
    if (kindNow === 'rage' || f.burning) tint = new THREE.Color(0.5, 0.06, 0).multiplyScalar(0.7 + 0.3 * Math.sin(this.time * 18));
    v.animate(dt, tint, f.phasing ? 0.35 : 1);
    v.pose(f.p.x + jx, f.y + sink, f.p.z + jz, f.tilt.x, f.tilt.z, v.yaw + f.spin);
    // Swallowed (一口吞掉) or vanished (404) fighters are not drawn.
    const hidden = f.swallowedBy >= 0 || f.hiddenT > 0;
    v.root.visible = f.y > -9 && !hidden;
    const kind = f.state === 'signature' ? f.sigKind : null;
    // Held prop: the big fish of 摸鱼大师 swings; bento, umbrella, coffee… are carried along.
    const sigOpts = f.spec.signature.opts;
    const fish = kind === 'fishSlap';
    const wantHeld = kind && (fish || sigOpts?.hold) ? (sigOpts?.prop ?? (fish ? '🐟' : null)) : null;
    if (wantHeld && !v.held) {
      const inst = this.acquireProp(wantHeld, fish ? 1.5 : 1.1);
      if (inst) v.held = { prop: wantHeld, inst };
    } else if (!wantHeld && v.held) this.releaseHeld(v);
    if (v.held) {
      if (fish) v.swing += (v.slapSide * 1.2 - v.swing) * Math.min(1, dt * 16);
      else if (kind === 'sweep') v.swing += dt * 24; // the broom circles the fighter
      else v.swing += (0.9 - v.swing) * Math.min(1, dt * 10);
      const ca = Math.cos(v.swing), sa = Math.sin(v.swing);
      const dx = f.face.x * ca - f.face.z * sa, dz = f.face.x * sa + f.face.z * ca;
      const reach = v.radius * f.sizeMul + (fish || kind === 'sweep' ? 0.7 : 0.45);
      const bob = fish ? 0 : Math.sin(this.time * 9) * 0.08;
      v.held.inst.group.position.set(f.p.x + dx * reach, f.y + v.h * (fish ? 0.55 : 0.75) + bob, f.p.z + dz * reach);
      // Swung props face their swing; carried ones face the audience so they read clearly.
      v.held.inst.group.rotation.set(0, fish || kind === 'sweep' ? Math.atan2(dx, dz) + Math.PI / 2 : this.camAz, fish ? Math.sin(this.time * 20) * 0.2 : Math.sin(this.time * 5) * 0.12);
    } else v.swing = 0;
    // Signature-move visuals.
    v.shieldMesh.visible = f.shieldT > 0 && kind !== 'lazy';
    if (f.shieldT > 0) v.shieldMesh.scale.setScalar(Math.max(v.h, v.radius * 2) * 0.72 * f.sizeMul * (1 + Math.sin(this.time * 12) * 0.03));
    const firing = (kind === 'beam' || kind === 'glare') && f.stateT >= 0.45 && f.stateT < 0.8;
    v.beamMesh.visible = firing;
    if (firing) {
      // 死亡凝视 is a red stare; normal beams are golden.
      v.beamMats[0].color.set(kind === 'glare' ? 0xff2a2a : 0xffd23f);
      v.beamMats[1].color.set(kind === 'glare' ? 0xffd0d0 : 0xffffff);
      v.beamMesh.position.set(f.p.x, f.y + v.h * 0.5 * f.sizeMul, f.p.z);
      v.beamMesh.lookAt(f.p.x + f.face.x, f.y + v.h * 0.5 * f.sizeMul, f.p.z + f.face.z);
      const w = 1 + Math.sin(this.time * 60) * 0.12;
      v.beamMesh.scale.set(w, w, 9);
    }

    const inRing = Math.max(Math.abs(f.p.x), Math.abs(f.p.z)) <= ARENA.half + 0.5;
    v.placeShadow(f.p.x, Math.max(0, f.y), f.p.z, inRing && !f.out && f.y > -0.3 && !hidden, this.quality === 'high' ? 0.2 : 0.4);

    // Continuous state effects.
    v.fxClock -= dt;
    if (v.fxClock > 0 || dt === 0 || hidden) return;
    if (f.burning) {
      this.effects.emit('flame', new THREE.Vector3(f.p.x, f.y + v.h * 0.5, f.p.z), 3, { speed: 1.2, up: 2, gravity: -2, life: 0.5, size: 0.7, grow: 1.6 });
      v.fxClock = 0.04;
      return;
    }
    if (f.sootT > 0) this.effects.emit('smoke', new THREE.Vector3(f.p.x, f.y + v.h, f.p.z), 1, { speed: 0.4, up: 1.2, gravity: -0.5, life: 1, size: 0.5, grow: 2 });
    if (kind === 'lazy') {
      this.effects.emit('zzz', new THREE.Vector3(f.p.x, f.y + 1, f.p.z), 1, { speed: 0.3, up: 0.9, gravity: -0.5, life: 1.3, size: 0.5, grow: 1.4 });
      v.fxClock = 0.4;
      return;
    }
    const head = new THREE.Vector3(f.p.x, f.y + v.h + 0.3, f.p.z);
    const front = new THREE.Vector3(f.p.x + f.face.x * (f.radius + 0.4), f.y + v.h * 0.5, f.p.z + f.face.z * (f.radius + 0.4));
    switch (f.state) {
      case 'flame':
        this.effects.emit('flame', front, 3, { speed: 1.2, up: 1.2, gravity: -2, life: 0.45, size: 0.55, grow: 1.8, dir: new THREE.Vector3(f.face.x * 3, 0, f.face.z * 3) });
        v.fxClock = 0.03;
        break;
      case 'sleep':
        this.effects.emit('zzz', head, 1, { speed: 0.3, up: 0.9, gravity: -0.5, life: 1.3, size: 0.45, grow: 1.4 });
        v.fxClock = 0.55;
        break;
      case 'stunned':
        this.effects.emit('star', head, 1, { speed: 1.4, up: 0.5, gravity: 0, life: 0.6, size: 0.3 });
        v.fxClock = 0.12;
        break;
      case 'confused':
        this.effects.emit('question', head, 1, { speed: 0.8, up: 0.8, gravity: 0, life: 0.8, size: 0.4 });
        v.fxClock = 0.3;
        break;
      case 'charmed':
        this.effects.emit('heart', head, 1, { speed: 0.6, up: 1, gravity: -0.5, life: 0.9, size: 0.35 });
        v.fxClock = 0.25;
        break;
      case 'spin':
      case 'dash':
      case 'panic':
        if (f.grounded) this.effects.emit('dust', new THREE.Vector3(f.p.x, 0.15, f.p.z), 1, { speed: 0.8, up: 0.6, gravity: 0, life: 0.5, size: 0.45, grow: 1.6 });
        v.fxClock = 0.05;
        break;
      case 'taunt':
      case 'laugh':
        this.effects.emit('note', head, 1, { speed: 0.8, up: 1.2, gravity: 0, life: 0.8, size: 0.35 });
        v.fxClock = 0.3;
        break;
      case 'victory':
        this.effects.emit('confetti', head, 4, { speed: 2.5, up: 4, gravity: 5, life: 1.4, size: 0.18 });
        v.fxClock = 0.2;
        break;
      case 'fuse':
        this.effects.emit('spark', head, 2, { speed: 1.5, up: 1.5, gravity: 2, life: 0.4, size: 0.25 });
        v.fxClock = 0.06;
        break;
      default:
        v.fxClock = 0.1;
    }
  }

  private pick(list: string[]): string {
    return list[Math.floor(Math.random() * list.length)] ?? '';
  }

  private handleEvent(e: BattleEvent): void {
    const sim = this.sim!;
    const fa = sim.fighters[e.a];
    const va = this.views[e.a];
    const vb = e.b !== undefined ? this.views[e.b] : null;
    const fb = e.b !== undefined ? sim.fighters[e.b] : null;
    const at = new THREE.Vector3(e.x ?? fa.p.x, (e.y ?? fa.y) + 0.6, e.z ?? fa.p.z);
    const fx = this.effects;
    switch (e.type) {
      case 'land':
        va.kick(Math.min(0.4, (e.v ?? 6) * 0.035));
        fx.emit('dust', new THREE.Vector3(fa.p.x, 0.12, fa.p.z), 8, { speed: 3, up: 0.6, gravity: 0, life: 0.6, size: 0.5, grow: 1.8, drag: 4 });
        if ((e.v ?? 0) > 11) this.shake = Math.max(this.shake, 0.15);
        break;
      case 'hit':
      case 'crit': {
        const crit = e.type === 'crit';
        const hy = (e.y ?? 0.6) + Math.max(fa.y, fb?.y ?? 0);
        const p = new THREE.Vector3(e.x ?? fa.p.x, hy + 0.3, e.z ?? fa.p.z);
        fx.emit('star', p, crit ? 12 : 6, { speed: crit ? 5 : 3.5, up: 2.5, life: 0.7, size: crit ? 0.42 : 0.32 });
        if (crit) fx.emit('spark', p, 10, { speed: 6, up: 2, life: 0.35, size: 0.6 });
        fx.word(this.pick(crit ? this.words.crit : this.words.hit), p.clone().add(new THREE.Vector3(0, 1.0, 0)), crit ? '#ffd23f' : '#ff4f7a', crit ? 1.5 : 1.1);
        if (vb) vb.kick(crit ? 0.35 : 0.22, 1);
        if (fb?.has('skull')) fx.emit('skull', p, crit ? 12 : 7, { speed: 4, up: 4, gravity: 4, life: 1.1, size: 0.6 });
        this.shake = Math.max(this.shake, crit ? 0.3 : 0.13);
        // Short impact freeze (kept brief so it reads as a hit, not a stutter).
        this.hitStop = crit ? 0.07 : 0.035;
        break;
      }
      case 'clash':
        fx.emit('spark', at, 14, { speed: 6, up: 2, life: 0.4, size: 0.7 });
        fx.word(this.pick(this.words.crit), at.clone().add(new THREE.Vector3(0, 1.2, 0)), '#7a5cff', 1.4);
        this.shake = 0.3;
        this.hitStop = 0.06;
        break;
      case 'wallCrash':
      case 'slam': {
        const p = new THREE.Vector3(e.x ?? fa.p.x, 0.6, e.z ?? fa.p.z);
        fx.emit('smoke', p, 8, { speed: 2, up: 1.5, gravity: -0.5, life: 0.9, size: 0.6, grow: 2 });
        fx.emit('star', p, 6, { speed: 3, up: 3, life: 0.7, size: 0.35 });
        fx.word(this.pick(this.words.wall), p.clone().add(new THREE.Vector3(0, 1.4, 0)), '#ff9f43', 1.3);
        va.kick(0.35, 0.8);
        this.shake = 0.35;
        this.hitStop = 0.045;
        break;
      }
      case 'ropeBounce':
      case 'slingshot':
        va.kick(-0.2);
        fx.emit('dust', at.clone().setY(0.6), 5, { speed: 2, up: 0.5, gravity: 0, life: 0.5, size: 0.4, grow: 1.5 });
        if (e.type === 'slingshot') fx.word(this.pick(this.words.pop), at.clone().add(new THREE.Vector3(0, 1.4, 0)), '#48d6c8', 1.2);
        break;
      case 'overRope':
        fx.word(this.pick(this.words.wall), at.clone().add(new THREE.Vector3(0, 1.6, 0)), '#ffd23f', 1.4);
        this.shake = Math.max(this.shake, 0.25);
        break;
      case 'ringout':
        fx.emit('dust', new THREE.Vector3(fa.p.x, -1, fa.p.z), 12, { speed: 3, up: 1.5, gravity: 0, life: 1, size: 0.9, grow: 2 });
        break;
      case 'ko':
        fx.emit('star', at.clone().setY(fa.y + va.h), 14, { speed: 4, up: 4, life: 1, size: 0.4 });
        if (fa.has('skull')) fx.emit('skull', at, 16, { speed: 5, up: 5, gravity: 4, life: 1.4, size: 0.8 });
        this.shake = 0.4;
        break;
      case 'dodge':
        fx.emit('dust', new THREE.Vector3(fa.p.x, 0.15, fa.p.z), 5, { speed: 2, up: 0.5, gravity: 0, life: 0.5, size: 0.4, grow: 1.5 });
        break;
      case 'luckyDodge':
        fx.emit('star', at.clone().setY(fa.y + va.h), 8, { speed: 2, up: 2, gravity: 1, life: 0.9, size: 0.3, color: 0xfff1a8 });
        break;
      case 'trip':
        fx.word(this.pick(this.words.trip), at.clone().add(new THREE.Vector3(0, 1.4, 0)), '#48b8ff', 1.1);
        fx.emit('dust', new THREE.Vector3(fa.p.x, 0.15, fa.p.z), 8, { speed: 2.5, up: 0.8, gravity: 0, life: 0.6, size: 0.5, grow: 1.7 });
        break;
      case 'pop':
        fx.word(this.pick(this.words.pop), at.clone().add(new THREE.Vector3(0, 1.6, 0)), '#ff7aa2', 1.4);
        fx.emit('dust', at.clone().setY(0.2), 12, { speed: 4, up: 1, gravity: 0, life: 0.6, size: 0.5, grow: 1.6 });
        this.views.forEach((v) => v.kick(-0.3));
        this.shake = 0.2;
        break;
      case 'burn':
        if (fb) fx.emit('flame', new THREE.Vector3(fb.p.x, fb.y + 0.8, fb.p.z), 10, { speed: 2, up: 2, gravity: -2, life: 0.6, size: 0.6, grow: 1.5 });
        if (vb) vb.kick(0.15, 0.6);
        break;
      case 'steam':
        if (fb) fx.emit('dust', new THREE.Vector3(fb.p.x, fb.y + 1, fb.p.z), 14, { speed: 1.5, up: 2.5, gravity: -1.5, life: 1.1, size: 0.6, grow: 2.2 });
        break;
      case 'gas': {
        const dir = fb ? new THREE.Vector3(fb.p.x - fa.p.x, 0, fb.p.z - fa.p.z).normalize() : new THREE.Vector3();
        fx.emit('gas', at, 16, { speed: 3, up: 0.8, gravity: -0.3, life: 1.2, size: 0.8, grow: 2.4, dir, drag: 2 });
        if (e.v) this.shake = 0.25;
        break;
      }
      case 'charm':
        if (fb) fx.emit('heart', new THREE.Vector3(fb.p.x, fb.y + vb!.h + 0.2, fb.p.z), 8, { speed: 1.5, up: 2, gravity: 0, life: 1, size: 0.4 });
        break;
      case 'stomp':
        fx.word(this.pick(this.words.stomp), at.clone().add(new THREE.Vector3(0, 1.5, 0)), '#9b6bff', 1.2);
        fx.emit('dust', new THREE.Vector3(fb?.p.x ?? fa.p.x, 0.15, fb?.p.z ?? fa.p.z), 10, { speed: 3.5, up: 0.6, gravity: 0, life: 0.6, size: 0.5, grow: 1.8 });
        break;
      case 'hop':
      case 'pounce':
        fx.emit('dust', new THREE.Vector3(fa.p.x, 0.12, fa.p.z), 6, { speed: 2, up: 0.4, gravity: 0, life: 0.5, size: 0.4, grow: 1.6 });
        va.kick(-0.25);
        break;
      case 'laughFall':
      case 'slip':
        fx.word(this.pick(this.words.slip), at.clone().add(new THREE.Vector3(0, 1.4, 0)), '#48b8ff', 1.1);
        break;
      case 'rudeAwakening':
        fx.word('!?', at.clone().add(new THREE.Vector3(0, 1.6, 0)), '#ff3b3b', 1.2);
        break;
      case 'revive':
        fx.emit('spark', at, 12, { speed: 3, up: 3, life: 0.6, size: 0.5 });
        break;
      case 'explode': {
        const p = new THREE.Vector3(fa.p.x, fa.y + 0.8, fa.p.z);
        fx.emit('flame', p, 30, { speed: 7, up: 4, gravity: -1, life: 0.8, size: 1.1, grow: 2 });
        fx.emit('smoke', p, 16, { speed: 4, up: 3, gravity: -1, life: 1.6, size: 1.2, grow: 2.5 });
        fx.word(this.pick(this.words.explode), p.clone().add(new THREE.Vector3(0, 2, 0)), '#ff5a1f', 2);
        this.shake = 0.7;
        this.hitStop = 0.09;
        break;
      }
      case 'zap':
        if (fb) fx.emit('bolt', new THREE.Vector3(fb.p.x, fb.y + 1, fb.p.z), 6, { speed: 3, up: 2, gravity: 0, life: 0.5, size: 0.5 });
        fx.word(this.pick(this.words.zap), at.clone().add(new THREE.Vector3(0, 1.4, 0)), '#ffe600', 1.1);
        break;
      case 'panic':
        fx.word('!!', at.clone().add(new THREE.Vector3(0, 1.5, 0)), '#ff3b3b', 1.1);
        break;
      case 'suddenDeath':
        this.shake = 0.25;
        break;
      case 'signature': {
        // Visual props that announce the move (stool under 坐, ❌ at the opponent for 不要 …).
        const so = fa.spec.signature.opts;
        if (so?.prop && so.propAt && fb) {
          if (so.propAt === 'self') this.launch(so.prop, new THREE.Vector3(fa.p.x, 9, fa.p.z), fa.p.x, fa.p.z, 0.5, false, 1.6);
          else this.launch(so.prop, new THREE.Vector3(fa.p.x, fa.y + va.h, fa.p.z), fb.p.x, fb.p.z, 0.45, true, 1.3);
        }
        // Dramatic pause + the move's name above the fighter.
        this.slowMo = Math.max(this.slowMo, 0.6);
        this.shake = Math.max(this.shake, 0.2);
        const p = new THREE.Vector3(fa.p.x, fa.y + va.h * fa.sizeMul + 1.2, fa.p.z);
        fx.word(this.moveLabel(fa), p, '#ffd23f', 1.35);
        fx.emit('spark', p.clone().setY(fa.y + va.h * 0.5), 16, { speed: 4, up: 2, gravity: 0, life: 0.5, size: 0.6 });
        va.kick(-0.3, 0.6);
        break;
      }
      case 'giant':
        fx.word(this.pick(this.words.giant), at.clone().add(new THREE.Vector3(0, 2.4, 0)), '#ff9f43', 1.4);
        fx.emit('star', at.clone().setY(fa.y + 1), 14, { speed: 4, up: 3, life: 0.9, size: 0.45 });
        this.shake = 0.35;
        break;
      case 'quake':
        fx.emit('dust', new THREE.Vector3(fa.p.x, 0.15, fa.p.z), 26, { speed: 8, up: 0.8, gravity: 0, life: 0.8, size: 0.8, grow: 2.2, drag: 3 });
        fx.emit('smoke', new THREE.Vector3(fa.p.x, 0.3, fa.p.z), 8, { speed: 3, up: 1, gravity: 0, life: 1, size: 1, grow: 2 });
        this.stage.cheer(1);
        this.shake = 0.7;
        this.hitStop = 0.05;
        break;
      case 'beam':
        if (e.v && fb) fx.emit('spark', new THREE.Vector3(fb.p.x, fb.y + 0.8, fb.p.z), 18, { speed: 6, up: 2, life: 0.4, size: 0.7 });
        this.shake = 0.3;
        break;
      case 'freeze':
        if (fb) fx.emit('dust', new THREE.Vector3(fb.p.x, fb.y + 0.8, fb.p.z), 20, { speed: 3, up: 2, gravity: 2, life: 0.9, size: 0.45, color: 0x9fe3ff });
        break;
      case 'heal':
        fx.emit('spark', at.clone().setY(fa.y + 0.8), 14, { speed: 1.5, up: 3, gravity: -1, life: 1, size: 0.4, color: 0x7be37b });
        fx.word(`${this.pick(this.words.heal)} +${Math.round(e.v ?? 0)}`, at.clone().add(new THREE.Vector3(0, 1.8, 0)), '#3ddc84', 1.1);
        break;
      case 'meteor':
      case 'propArc': {
        const big = !!e.move && (fa.spec.signature.opts?.count ?? 1) === 1;
        const from = new THREE.Vector3(fa.p.x, fa.y + va.h, fa.p.z);
        this.launch(e.move ?? '', from, e.x ?? 0, e.z ?? 0, e.v ?? 0.5, e.type === 'propArc', big ? 2.2 : 1.0);
        break;
      }
      case 'meteorImpact': {
        const p = new THREE.Vector3(e.x ?? 0, 0.3, e.z ?? 0);
        if (e.move) {
          // Props hit with a thud: dust ring, stars, and keycaps / paper for 键盘侠 / 乙方.
          fx.emit('dust', p, 14, { speed: 4, up: 0.8, gravity: 0, life: 0.7, size: 0.7, grow: 1.8, drag: 3 });
          fx.emit('star', p.clone().setY(1), 6, { speed: 3, up: 3, life: 0.7, size: 0.35 });
          if (e.move === '⌨️' || e.move === '📄') fx.emit('confetti', p.clone().setY(0.8), 18, { speed: 5, up: 4, gravity: 8, life: 1.2, size: 0.25, color: 0xffffff });
          fx.word(this.pick(this.words.wall), p.clone().setY(2.2), '#ffd23f', 1.1);
        } else {
          fx.emit('flame', p, 12, { speed: 4, up: 3, gravity: 2, life: 0.6, size: 0.8, grow: 1.6 });
          fx.emit('dust', p, 8, { speed: 3, up: 0.5, gravity: 0, life: 0.6, size: 0.6, grow: 1.8 });
        }
        this.shake = Math.max(this.shake, 0.25);
        break;
      }
      case 'swallow':
        fx.word(this.pick(this.words.gulp), at.clone().add(new THREE.Vector3(0, 2, 0)), '#ff7aa2', 1.4);
        va.kick(-0.4);
        this.shake = Math.max(this.shake, 0.2);
        break;
      case 'spit':
        fx.word(this.pick(this.words.spit), at.clone().add(new THREE.Vector3(0, 2, 0)), '#48d6c8', 1.4);
        fx.emit('dust', at.clone().setY(0.8), 14, { speed: 5, up: 1, gravity: 0, life: 0.6, size: 0.6, grow: 1.8, dir: new THREE.Vector3(fa.face.x, 0, fa.face.z) });
        va.kick(0.35);
        this.shake = 0.35;
        this.hitStop = 0.06;
        break;
      case 'soot':
        fx.emit('smoke', at.clone().setY(fa.y + 1), 14, { speed: 2, up: 2, gravity: -0.5, life: 1.2, size: 0.8, grow: 2.2, color: 0x333333 });
        fx.word(this.pick(this.words.soot), at.clone().add(new THREE.Vector3(0, 1.8, 0)), '#888888', 1);
        break;
      case 'lazy':
        fx.emit('zzz', at.clone().setY(fa.y + 1.2), 4, { speed: 0.5, up: 1, gravity: -0.5, life: 1.4, size: 0.5 });
        break;
      case 'feint':
        fx.word(this.pick(this.words.fake), at.clone().add(new THREE.Vector3(0, 1.9, 0)), '#9b6bff', 1.2);
        fx.emit('dust', new THREE.Vector3(fa.p.x, 0.15, fa.p.z), 6, { speed: 2, up: 0.5, gravity: 0, life: 0.5, size: 0.4, grow: 1.6 });
        break;
      case 'slap':
        va.slapSide = e.v ?? 1;
        fx.word(this.pick(this.words.slap), at.clone().add(new THREE.Vector3((e.v ?? 1) * 0.6, 1.8, 0)), '#48b8ff', 1);
        break;
      case 'blame':
        fx.emit('spark', at.clone().setY(fa.y + 1), 8, { speed: 2, up: 2, life: 0.5, size: 0.4, color: 0xc0c0c0 });
        break;
      case 'blameReflect': {
        // 这不是我的锅: a frying pan flies from the blamer to the attacker.
        if (fb) this.launch(fa.spec.signature.opts?.prop ?? '🍳', new THREE.Vector3(fa.p.x, fa.y + 1.2, fa.p.z), fb.p.x, fb.p.z, 0.35, true, 0.9);
        fx.word(this.pick(this.words.pan), at.clone().add(new THREE.Vector3(0, 2, 0)), '#c0c0c0', 1.3);
        this.hitStop = 0.05;
        break;
      }
      case 'vanish':
        fx.emit('question', at.clone().setY(fa.y + 1), 8, { speed: 2, up: 2, gravity: 0, life: 0.8, size: 0.45 });
        fx.emit('spark', at.clone().setY(fa.y + 0.8), 10, { speed: 3, up: 1, gravity: 0, life: 0.4, size: 0.5, color: 0x48d6c8 });
        fx.word(this.pick(this.words.glitch), at.clone().add(new THREE.Vector3(0, 1.8, 0)), '#48d6c8', 1.3);
        break;
      case 'tremor':
        fx.emit('dust', new THREE.Vector3(fa.p.x, 0.15, fa.p.z), e.v ? 22 : 12, { speed: e.v ? 7 : 5, up: 0.5, gravity: 0, life: 0.6, size: 0.6, grow: 2, drag: 3 });
        fx.emit('note', at.clone().setY(fa.y + 1.4), 3, { speed: 1.5, up: 1.5, gravity: 0, life: 0.8, size: 0.4 });
        this.shake = Math.max(this.shake, e.v ? 0.45 : 0.25);
        break;
      case 'throw':
        if (e.v) fx.word(this.pick(this.words.throw), at.clone().add(new THREE.Vector3(0, 1.8, 0)), '#ff7aa2', 1.3);
        break;
      case 'reflect':
        fx.emit('spark', at, 14, { speed: 5, up: 2, life: 0.4, size: 0.6, color: 0x9fe3ff });
        fx.word(this.pick(this.words.reflect), at.clone().add(new THREE.Vector3(0, 1.6, 0)), '#48b8ff', 1.2);
        this.hitStop = 0.05;
        break;
      case 'countdown':
        fx.word(String(e.v ?? 1), new THREE.Vector3(fa.p.x, fa.y + va.h + 1.4, fa.p.z), (e.v ?? 1) === 3 ? '#ff3b3b' : '#ffd23f', 1.8);
        va.kick(-0.25);
        break;
      case 'lightsOut':
        this.darkT = e.v ?? 2;
        break;
      case 'clones': {
        const tpl = va.bundle?.template;
        if (!tpl || !fb) break;
        for (let k = 0; k < 3; k++) {
          const inst = tpl.instantiate();
          inst.group.scale.setScalar(0.45);
          this.scene.add(inst.group);
          this.clones.push({ inst, ang: (k / 3) * Math.PI * 2 + 0.5, cx: fb.p.x, cz: fb.p.z, t: 0 });
        }
        fx.emit('confetti', new THREE.Vector3(fb.p.x, 1.5, fb.p.z), 12, { speed: 3, up: 3, gravity: 5, life: 1, size: 0.2 });
        break;
      }
      case 'roar': {
        // Flavoured waves: tears (哭 / 宝宝 / (T_T)), cold mist (冰箱), a gust out the door (拜拜).
        const rfx = fa.spec.signature.opts?.fx;
        const fwd = new THREE.Vector3(fa.face.x, 0, fa.face.z);
        if (rfx === 'water') fx.emit('dust', at.clone().setY(0.7), 22, { speed: 6, up: 1, gravity: 4, life: 0.8, size: 0.45, color: 0x6fc3ff, dir: fwd });
        else if (rfx === 'ice') fx.emit('dust', at.clone().setY(0.8), 22, { speed: 5, up: 0.6, gravity: 0, life: 0.9, size: 0.7, grow: 2, color: 0xbff0ff, dir: fwd });
        else if (rfx === 'wind') fx.emit('dust', at.clone().setY(0.9), 18, { speed: 8, up: 0.2, gravity: 0, life: 0.6, size: 0.4, grow: 2.5, dir: fwd });
        if (rfx) {
          this.shake = Math.max(this.shake, 0.25);
          break;
        }
        fx.word(this.pick(this.words.roar), at.clone().add(new THREE.Vector3(0, 2, 0)), '#ff3b3b', 1.6);
        fx.emit('dust', new THREE.Vector3(fa.p.x, 0.5, fa.p.z), 18, { speed: 7, up: 0.3, gravity: 0, life: 0.5, size: 0.6, grow: 2, drag: 2 });
        this.shake = 0.4;
        break;
      }
      case 'magnet':
        if (fb) fx.emit('heart', new THREE.Vector3(fb.p.x, fb.y + 1.2, fb.p.z), 10, { speed: 2, up: 2, gravity: 0, life: 0.9, size: 0.4 });
        break;
      case 'poison':
        fx.emit('gas', new THREE.Vector3(e.x ?? fa.p.x, 0.6, e.z ?? fa.p.z), 18, { speed: 2.2, up: 0.8, gravity: -0.3, life: 1.6, size: 0.9, grow: 2.4, color: 0x9be35a });
        break;
      case 'bribe':
        fx.emit('star', new THREE.Vector3(e.x ?? 0, 3, e.z ?? 0), 24, { speed: 2.5, up: 1, gravity: 6, life: 1.2, size: 0.3, color: 0xffd23f });
        fx.word(this.pick(this.words.coin), at.clone().add(new THREE.Vector3(0, 1.8, 0)), '#ffd23f', 1.2);
        break;
      case 'lecture':
        if (fb && e.v) fx.emit('zzz', new THREE.Vector3(fb.p.x, fb.y + 1.6, fb.p.z), 4, { speed: 0.5, up: 1, gravity: -0.5, life: 1.4, size: 0.5 });
        fx.emit('note', at.clone().setY(fa.y + 1.4), 6, { speed: 1.5, up: 1.5, gravity: 0, life: 1, size: 0.4 });
        break;
      case 'joke':
        fx.word(this.pick(this.words.joke), at.clone().add(new THREE.Vector3(0, 1.8, 0)), '#9fe3ff', 1.1);
        break;
      case 'confuse':
        if (e.v && fb) {
          fx.emit('question', new THREE.Vector3(fb.p.x, fb.y + vb!.h + 0.3, fb.p.z), 6, { speed: 1.5, up: 1.5, gravity: 0, life: 1, size: 0.45 });
          fx.word('？？？', new THREE.Vector3(fb.p.x, fb.y + vb!.h + 1.2, fb.p.z), '#7a5cff', 1.2);
        }
        break;
      case 'chomp':
        fx.word(this.pick(this.words.chomp), at.clone().add(new THREE.Vector3(0, 1.6, 0)), '#ff3b6b', 1.4);
        this.shake = 0.3;
        break;
      case 'finish':
        this.slowMo = 1.3;
        this.shake = Math.max(this.shake, 0.25);
        break;
    }
    const cheer: Partial<Record<BattleEvent['type'], number>> = {
      signature: 1.2, quake: 1, beam: 0.8, confuse: 0.8, swallow: 1.2, spit: 1.2, blameReflect: 1, soot: 0.6, vanish: 0.7, tremor: 0.5, meteorImpact: 0.4, throw: 1, reflect: 0.7, chomp: 0.8, giant: 1,
      hit: 0.35, crit: 0.9, clash: 0.7, wallCrash: 0.8, slam: 0.9, overRope: 1.4, ringout: 1.2, ko: 1.5, pop: 0.8,
      explode: 1.4, upset: 1, slingshot: 0.9, stomp: 0.7, doubleDown: 0.9, fight: 0.8, finish: 1.5, ropeBounce: 0.4,
    };
    if (cheer[e.type]) this.stage.cheer(cheer[e.type]!);
    this.onEvent?.(e);
  }

  /** Screen position (CSS px) above a commentator (口 / 舌), clamped onto the screen. */
  commentatorScreen(i: 0 | 1): { x: number; y: number; visible: boolean } {
    const v = this.stage.commentatorHead(i, new THREE.Vector3()).project(this.camera);
    const el = this.renderer.domElement;
    const w = el.clientWidth, h = el.clientHeight;
    const onScreen = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
    return { x: Math.min(w - 90, Math.max(90, ((v.x + 1) / 2) * w)), y: Math.min(h - 120, Math.max(130, ((1 - v.y) / 2) * h)), visible: onScreen };
  }

  /** Screen position (CSS px) of a spectator's head, for speech bubbles. */
  spectatorScreen(i: number): { x: number; y: number; visible: boolean } {
    if (i < 0 || i >= this.stage.spectators.length) return { x: 0, y: 0, visible: false };
    const v = this.stage.spectatorHead(i, new THREE.Vector3()).project(this.camera);
    const el = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight, visible: v.z < 1 && Math.abs(v.x) < 0.95 && v.y < 0.92 && v.y > -0.95 };
  }

  // ---------------------------------------------------------------- camera

  private updateCamera(dt: number): void {
    const aspect = this.camera.aspect;
    const fit = Math.pow(Math.max(1, 1.25 / aspect), 0.85);
    let tgt: THREE.Vector3, dist: number, az: number, el: number;
    const res = this.sim?.result;
    if (this.sim && res && res.winner !== null && this.sim.phase !== 'fight') {
      // Victory lap: close-up on the winner.
      const w = this.sim.fighters[res.winner];
      tgt = new THREE.Vector3(w.p.x * 0.9, 0.9 + Math.max(0, w.y) * 0.3, w.p.z * 0.9);
      dist = 10 * fit;
      az = this.camAz;
      el = 0.3;
    } else if (this.sim) {
      const live = this.sim.fighters.filter((f) => f.y > -2.5);
      const pts = (live.length ? live : this.sim.fighters).map((f) => new THREE.Vector3(f.p.x, Math.max(0, f.y), f.p.z));
      const mid = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length);
      const sep = pts.length > 1 ? pts[0].distanceTo(pts[1]) : 2;
      mid.x *= 0.75;
      mid.z *= 0.75;
      tgt = new THREE.Vector3(mid.x, 0.9 + mid.y * 0.4, mid.z);
      dist = Math.min(20, Math.max(14, sep * 1.0 + 11)) * fit;
      if (pts.length > 1) {
        let perp = Math.atan2(-(pts[1].z - pts[0].z), pts[1].x - pts[0].x);
        if (perp > Math.PI / 2) perp -= Math.PI;
        if (perp < -Math.PI / 2) perp += Math.PI;
        az = Math.max(-0.55, Math.min(0.55, perp));
        if (sep < 1.5) az = this.camAz; // too close to tell; keep steady
      } else az = this.camAz;
      el = 0.52;
    } else {
      tgt = new THREE.Vector3(0, 1.1, 0);
      dist = 13.5 * fit;
      az = 0;
      el = 0.2;
    }
    const k = Math.min(1, dt * 2.2);
    this.camTarget.lerp(tgt, k);
    this.camDist += (dist - this.camDist) * k;
    this.camAz += angleDiff(az, this.camAz) * Math.min(1, dt * 0.9);
    this.camEl += (el - this.camEl) * k;
    const A = this.camAz + this.userYaw;
    const E = Math.max(0.04, Math.min(1.25, this.camEl + this.userPitch));
    const D = this.camDist * this.userZoom;
    this.camera.position.set(this.camTarget.x + Math.sin(A) * Math.cos(E) * D, this.camTarget.y + Math.sin(E) * D, this.camTarget.z + Math.cos(A) * Math.cos(E) * D);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 7);
    }
    this.camera.lookAt(this.camTarget);
  }
}
