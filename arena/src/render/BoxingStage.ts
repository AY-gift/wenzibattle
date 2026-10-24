/**
 * BoxingStage — the boxing-ring venue: ring with springy ropes, a dark arena with
 * spotlights, tiered stands full of random glyph spectators (they cheer and hold signs),
 * and a commentary desk with two glyph commentators.
 */
import * as THREE from 'three';
import { ARENA } from '../core/battle/BattleSimulator';
import type { FighterState } from '../core/battle/FighterController';
import { processInput, type ProcessedInput } from '@shared/core/InputProcessor';
import { hashString, Rng } from '@shared/core/rng';
import { buildGlyphModel, type GlyphInstance, type GlyphTemplate } from '@shared/render/Glyph3DFactory';

interface CrowdBatch {
  mesh: THREE.InstancedMesh;
  members: number[];
  /** Per-member local transform: lift to stand on the seat + scale. */
  local: THREE.Matrix4[];
}
import { renderGlyph } from '@shared/render/GlyphRenderer';

const H = ARENA.half;
const RING_H = ARENA.ringHeight;
const FLOOR_Y = -RING_H;
const ROPE_COLORS = [0xff4f6b, 0xffffff, 0x4f7bff];

// 16 shapes: each distinct shape costs a couple of (instanced) draw calls.
export const AUDIENCE_GLYPHS = ['人', '口', '大', '小', '王', '山', 'あ', 'の', 'A', '?', '!', '♪', '米', '😀', '👀', '🤩'];
/** Everyone who may show up in the stands; each match draws a different crowd from this pool. */
export const AUDIENCE_POOL = [
  ...AUDIENCE_GLYPHS,
  '田', '川', '木', '日', '月', '目', '手', '心', '犬', '猫', '鸟', '中', '天', '水', '火', '花', '笑', '哈',
  'ア', 'ん', 'ね', 'お', 'B', 'Z', 'Q', '★', '♥', '∞', '@', '&', '#',
  '😂', '😎', '🥳', '😮', '🙂', '🤔', '😴', '🐱', '🐶', '🐸', '👻', '🤖', '🍣', '🍙', '🎈',
];

export interface StageTexts {
  title: string;
  apron: string[];
  desk: string;
}

interface Spectator {
  /** Transform holder (and parent of the sign); the glyph itself is drawn instanced. */
  root: THREE.Group;
  scale: number;
  base: THREE.Vector3;
  phase: number;
  hype: number;
  height: number;
  sign?: THREE.Mesh;
}

interface Rope {
  side: number; // 0:+x 1:-x 2:+z 3:-z
  level: number;
  mesh: THREE.Mesh;
  lastKey: string;
}

const ROPE_RINGS = 25;
const ROPE_SIDES = 6;
const ROPE_R = 0.05;

/** Tube with a fixed vertex layout; the centre line is rewritten in place each time it moves. */
function makeRopeGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const count = ROPE_RINGS * (ROPE_SIDES + 1);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const idx: number[] = [];
  for (let i = 0; i < ROPE_RINGS - 1; i++) {
    for (let j = 0; j < ROPE_SIDES; j++) {
      const a = i * (ROPE_SIDES + 1) + j, b = a + ROPE_SIDES + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), H * 2);
  return g;
}

const _t = new THREE.Vector3();
const _s = new THREE.Vector3();
const _u = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function writeRope(g: THREE.BufferGeometry, pts: THREE.Vector3[]): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < ROPE_RINGS; i++) {
    _t.subVectors(pts[Math.min(ROPE_RINGS - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    _s.crossVectors(_t, _up).normalize();
    _u.crossVectors(_s, _t);
    for (let j = 0; j <= ROPE_SIDES; j++) {
      const a = (j / ROPE_SIDES) * Math.PI * 2;
      const nx = Math.cos(a) * _u.x + Math.sin(a) * _s.x;
      const ny = Math.cos(a) * _u.y + Math.sin(a) * _s.y;
      const nz = Math.cos(a) * _u.z + Math.sin(a) * _s.z;
      const k = i * (ROPE_SIDES + 1) + j;
      nor.setXYZ(k, nx, ny, nz);
      pos.setXYZ(k, pts[i].x + nx * ROPE_R, pts[i].y + ny * ROPE_R, pts[i].z + nz * ROPE_R);
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FONT = '"M PLUS Rounded 1c", "Microsoft YaHei", "Hiragino Maru Gothic ProN", sans-serif';

export class BoxingStage {
  readonly group = new THREE.Group();
  readonly spectators: Spectator[] = [];
  private ropes: Rope[] = [];
  private ropeMats = ROPE_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }));
  private canvasMats: THREE.MeshStandardMaterial[] = [];
  private apronMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  private deskMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  private bannerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private commentators: { root: THREE.Group; talk: number; inst: GlyphInstance | null }[] = [];
  private beams: THREE.Mesh[] = [];
  private templates = new Map<string, GlyphTemplate>();
  private seats: { pos: THREE.Vector3; yaw: number }[] = [];
  private hype = 0;
  private time = 0;
  private signTexts: string[] = [];
  private batches: CrowdBatch[] = [];
  /** Glyphs whose model is built and can sit in the stands right away. */
  private ready: string[] = [];
  private prefetching = false;
  /** Set while a match runs: background glyph building pauses so it can't cause a hitch. */
  busy = false;
  private ropePts = Array.from({ length: ROPE_RINGS }, () => new THREE.Vector3());
  private _m = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.buildVenue();
    this.buildRing();
    this.buildRopes();
    this.buildDesk();
  }

  // ---------------------------------------------------------------- building

  private buildVenue(): void {
    const g = this.group;
    // Floor with a soft spotlight pool.
    const floorTex = canvasTexture(512, 512, (ctx) => {
      const grd = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
      grd.addColorStop(0, '#5a4a8a');
      grd.addColorStop(0.5, '#2e2550');
      grd.addColorStop(1, '#16122b');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 512, 512);
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    g.add(floor);

    // Tiered stands on the left, right and back; a single floor-level row in front.
    const standMat = new THREE.MeshStandardMaterial({ color: 0x3b2f6b, roughness: 0.85 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 });
    const sides: { axis: 'x' | 'z'; sign: number; rows: number; count: number }[] = [
      { axis: 'z', sign: -1, rows: 3, count: 10 },
      { axis: 'x', sign: -1, rows: 3, count: 7 },
      { axis: 'x', sign: 1, rows: 3, count: 7 },
      { axis: 'z', sign: 1, rows: 1, count: 8 },
    ];
    for (const s of sides) {
      for (let r = 0; r < s.rows; r++) {
        const dist = H + 3.6 + r * 1.5;
        const y = FLOOR_Y + (s.rows > 1 ? r * 0.95 : 0);
        const len = (dist + 1) * 2;
        if (s.rows > 1) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(s.axis === 'x' ? 1.5 : len, 0.95 * (r + 1), s.axis === 'x' ? len : 1.5), standMat);
          step.position.set(s.axis === 'x' ? s.sign * dist : 0, FLOOR_Y + (0.95 * (r + 1)) / 2 - 0.95, s.axis === 'z' ? s.sign * dist : 0);
          step.receiveShadow = true;
          g.add(step);
          const lip = new THREE.Mesh(new THREE.BoxGeometry(s.axis === 'x' ? 0.08 : len, 0.06, s.axis === 'x' ? len : 0.08), edgeMat);
          lip.position.set(s.axis === 'x' ? s.sign * (dist - 0.75) : 0, FLOOR_Y + 0.95 * r + 0.01, s.axis === 'z' ? s.sign * (dist - 0.75) : 0);
          g.add(lip);
        }
        const span = s.rows > 1 ? dist - 0.5 : H + 1;
        for (let i = 0; i < s.count; i++) {
          const along = -span + ((i + 0.5) / s.count) * span * 2 + (r % 2 ? 0.4 : 0);
          const pos = s.axis === 'x' ? new THREE.Vector3(s.sign * dist, y + (s.rows > 1 ? 0.0 : 0), along) : new THREE.Vector3(along, y, s.sign * dist);
          if (s.rows === 1) pos.z = s.sign * (H + 2.6);
          this.seats.push({ pos, yaw: Math.atan2(-pos.x, -pos.z) });
        }
      }
    }

    // Big hanging banner behind the back stand.
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.2), this.bannerMat);
    banner.position.set(0, 6.2, -(H + 9));
    g.add(banner);

    // Light beams from the ceiling (fake volumetric cones).
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z] of [[-4, -3], [4, -3], [0, 4], [-6, 5], [6, 5]]) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 14, 24, 1, true), beamMat);
      beam.position.set(x * 0.6, 7, z * 0.6);
      beam.lookAt(x, 0, z);
      beam.rotateX(-Math.PI / 2);
      g.add(beam);
      this.beams.push(beam);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
      lamp.position.set(x * 0.6, 14, z * 0.6);
      g.add(lamp);
    }
  }

  private buildRing(): void {
    const g = this.group;
    const size = (H + 0.6) * 2;
    const canvasTex = canvasTexture(1024, 1024, (ctx) => {
      ctx.fillStyle = '#e8f1ff';
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.strokeStyle = '#c9d8f5';
      ctx.lineWidth = 18;
      ctx.strokeRect(70, 70, 884, 884);
      ctx.fillStyle = '#ffe1ea';
      ctx.beginPath();
      ctx.arc(512, 512, 170, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `900 200px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff7aa2';
      ctx.fillText('字', 512, 525);
      ctx.fillStyle = '#ff4f6b';
      ctx.fillRect(190, 480, 30, 64);
      ctx.fillStyle = '#4f7bff';
      ctx.fillRect(804, 480, 30, 64);
    });
    const top = new THREE.MeshStandardMaterial({ map: canvasTex, roughness: 0.85 });
    this.canvasMats = [this.apronMat, this.apronMat, top, this.apronMat, this.apronMat, this.apronMat];
    const ring = new THREE.Mesh(new THREE.BoxGeometry(size, RING_H, size), this.canvasMats);
    ring.position.y = -RING_H / 2;
    ring.receiveShadow = true;
    g.add(ring);

    // Corner posts: red (A) and blue (B) corners, two white neutral corners.
    const postCols = { '-1,1': 0xff4f6b, '1,-1': 0x4f7bff, '-1,-1': 0xf5f5ff, '1,1': 0xf5f5ff } as Record<string, number>;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const col = postCols[`${sx},${sz}`];
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.75, 12), new THREE.MeshStandardMaterial({ color: 0xc8c8d8, metalness: 0.6, roughness: 0.3 }));
        post.position.set(sx * (H + 0.1), 0.8, sz * (H + 0.1));
        post.castShadow = true;
        g.add(post);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.15, 0.42), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
        pad.position.set(sx * (H - 0.05), 0.82, sz * (H - 0.05));
        pad.rotation.y = Math.PI / 4;
        pad.castShadow = true;
        g.add(pad);
      }
    }
    // Steps up to the red corner.
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4 * (i + 1), 0.5), new THREE.MeshStandardMaterial({ color: 0x8a7bd0, roughness: 0.8 }));
      step.position.set(-H + 1, FLOOR_Y + 0.2 * (i + 1), H + 0.6 + 1.5 - i * 0.5);
      g.add(step);
    }
  }

  private buildRopes(): void {
    for (let side = 0; side < 4; side++) {
      for (let level = 0; level < 3; level++) {
        const mesh = new THREE.Mesh(makeRopeGeometry(), this.ropeMats[level]);
        this.group.add(mesh);
        this.ropes.push({ side, level, mesh, lastKey: '' });
      }
    }
    this.updateRopes([], 1);
  }

  private buildDesk(): void {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 1.0), [this.deskMat, this.deskMat, new THREE.MeshStandardMaterial({ color: 0x2b2250 }), this.deskMat, this.deskMat, this.deskMat]);
    desk.position.set(-(H + 1.5), FLOOR_Y + 0.5, -(H + 1.5));
    desk.rotation.y = Math.PI / 4;
    desk.castShadow = true;
    this.group.add(desk);
    for (let i = 0; i < 2; i++) {
      const root = new THREE.Group();
      const local = new THREE.Vector3(-0.7 + i * 1.4, 1.0, -0.55);
      root.position.copy(local.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4).add(desk.position).setY(FLOOR_Y + 1.0));
      root.rotation.y = Math.PI / 4;
      // Microphone.
      const mic = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.4 }));
      mic.position.set(0.25, 0.25, 0.5);
      root.add(mic);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x777788 }));
      stand.position.set(0.25, 0.1, 0.5);
      root.add(stand);
      this.group.add(root);
      this.commentators.push({ root, talk: 0, inst: null });
    }
  }

  // ---------------------------------------------------------------- dynamic content

  /** Language-dependent printed text: ring apron, desk sign, banner. */
  setTexts(t: StageTexts): void {
    const apron = canvasTexture(1024, 128, (ctx) => {
      ctx.fillStyle = '#2b2250';
      ctx.fillRect(0, 0, 1024, 128);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(0, 0, 1024, 10);
      ctx.fillRect(0, 118, 1024, 10);
      ctx.font = `800 54px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const parts = t.apron;
      parts.forEach((p, i) => {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ff9fbe';
        ctx.fillText(p, ((i + 0.5) / parts.length) * 1024, 68, 1024 / parts.length - 20);
      });
    });
    this.apronMat.map?.dispose();
    this.apronMat.map = apron;
    this.apronMat.needsUpdate = true;
    const desk = canvasTexture(512, 128, (ctx) => {
      ctx.fillStyle = '#ff4f8b';
      ctx.fillRect(0, 0, 512, 128);
      ctx.font = `800 64px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(t.desk, 256, 68, 480);
    });
    this.deskMat.map?.dispose();
    this.deskMat.map = desk;
    this.deskMat.needsUpdate = true;
    const banner = canvasTexture(1024, 140, (ctx) => {
      const grd = ctx.createLinearGradient(0, 0, 1024, 0);
      grd.addColorStop(0, '#ff4f6b');
      grd.addColorStop(1, '#7a5cff');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 1024, 140);
      ctx.font = `900 84px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(t.title, 512, 76, 980);
    });
    this.bannerMat.map?.dispose();
    this.bannerMat.map = banner;
    this.bannerMat.needsUpdate = true;
  }

  private async template(ch: string): Promise<GlyphTemplate | null> {
    const hit = this.templates.get(ch);
    if (hit) return hit;
    const p = processInput(ch);
    if (!p.ok) return null;
    try {
      const raster = await renderGlyph(p as ProcessedInput);
      const { template } = buildGlyphModel(raster, hashString(ch) % 360);
      this.templates.set(ch, template);
      return template;
    } catch {
      return null;
    }
  }

  /**
   * Fill the seats with random glyph spectators (deterministic per venue seed).
   * Every glyph shape is drawn with one InstancedMesh per part, so ~80 spectators cost
   * a few dozen draw calls instead of ~200.
   */
  async populate(seed = 7): Promise<void> {
    for (const [i, ch] of AUDIENCE_GLYPHS.entries()) {
      if (await this.template(ch)) this.ready.push(ch);
      // Yield occasionally so building the crowd never blocks a frame for long.
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    this.seatCrowd(new Rng(seed), AUDIENCE_GLYPHS, 1);
    const people = ['口', '舌'];
    for (let i = 0; i < 2; i++) {
      const tpl = await this.template(people[i]);
      if (!tpl) continue;
      const inst = tpl.instantiate();
      inst.group.scale.setScalar(0.6);
      inst.group.position.y = tpl.height * 0.3;
      this.commentators[i].root.add(inst.group);
      this.commentators[i].inst = inst;
    }
    void this.prefetchPool();
  }

  /**
   * A new crowd for a new match: a fresh mix of 10–16 glyph kinds from the ready pool, a different
   * share of empty seats, sizes and poses. Synchronous and cheap (models are cached).
   */
  reshuffle(seed: number): void {
    if (!this.ready.length) return;
    const rng = new Rng(seed ^ 0x5eed);
    const pool = this.ready.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const kinds = pool.slice(0, Math.min(pool.length, rng.int(10, 16)));
    this.clearCrowd();
    this.seatCrowd(rng, kinds, 0.8 + rng.next() * 0.2);
    this.applySigns();
    void this.prefetchPool();
  }

  /** Build the rest of the audience pool in the background, one glyph at a time, between matches. */
  private async prefetchPool(): Promise<void> {
    if (this.prefetching) return;
    this.prefetching = true;
    try {
      for (const ch of AUDIENCE_POOL) {
        if (this.ready.includes(ch)) continue;
        while (this.busy) await new Promise((r) => setTimeout(r, 500));
        await new Promise((r) => setTimeout(r, 120));
        if (this.busy) continue;
        if (await this.template(ch)) this.ready.push(ch);
      }
    } finally {
      this.prefetching = false;
    }
  }

  private clearCrowd(): void {
    for (const sp of this.spectators) {
      if (sp.sign) {
        (sp.sign.material as THREE.MeshStandardMaterial).map?.dispose();
        (sp.sign.material as THREE.Material).dispose();
        sp.sign.geometry.dispose();
      }
      sp.root.removeFromParent();
    }
    this.spectators.length = 0;
    // The geometry and materials belong to the cached glyph templates; only the instance buffers go.
    for (const b of this.batches) {
      b.mesh.removeFromParent();
      b.mesh.dispose();
    }
    this.batches.length = 0;
  }

  private seatCrowd(rng: Rng, kinds: readonly string[], fill: number): void {
    const byTemplate = new Map<GlyphTemplate, number[]>();
    for (const seat of this.seats) {
      if (rng.next() > fill) continue;
      const tpl = this.templates.get(rng.pick(kinds));
      if (!tpl) continue;
      const root = new THREE.Group();
      const scale = 0.38 + rng.next() * 0.22;
      root.position.copy(seat.pos);
      root.rotation.y = seat.yaw + (rng.next() - 0.5) * 0.5;
      this.group.add(root);
      const idx = this.spectators.length;
      this.spectators.push({ root, scale, base: seat.pos.clone(), phase: rng.next() * 10, hype: 0, height: tpl.height * scale });
      if (!byTemplate.has(tpl)) byTemplate.set(tpl, []);
      byTemplate.get(tpl)!.push(idx);
    }
    for (const [tpl, members] of byTemplate) {
      const local = members.map((i) => {
        const sc = this.spectators[i].scale;
        return new THREE.Matrix4().makeScale(sc, sc, sc).setPosition(0, (tpl.height * sc) / 2, 0);
      });
      for (const part of tpl.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.materials, members.length);
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(mesh);
        this.batches.push({ mesh, members, local });
      }
    }
    this.updateCrowdMatrices();
    this.applySigns();
  }

  /** Cardboard signs held up by a few spectators (fighter names etc.). */
  setSigns(texts: string[]): void {
    this.signTexts = texts;
    this.applySigns();
  }

  private applySigns(): void {
    for (const s of this.spectators) {
      if (s.sign) {
        (s.sign.material as THREE.MeshStandardMaterial).map?.dispose();
        (s.sign.material as THREE.Material).dispose();
        s.sign.removeFromParent();
        s.sign = undefined;
      }
    }
    if (!this.signTexts.length || !this.spectators.length) return;
    const step = Math.max(1, Math.floor(this.spectators.length / (this.signTexts.length * 2)));
    this.signTexts.forEach((text, i) => {
      for (const k of [i * step * 2, i * step * 2 + step]) {
        const s = this.spectators[(k * 7 + 3) % this.spectators.length];
        if (!s || s.sign) continue;
        const tex = canvasTexture(256, 128, (ctx) => {
          ctx.fillStyle = i % 2 ? '#fff6c2' : '#ffffff';
          ctx.fillRect(0, 0, 256, 128);
          ctx.strokeStyle = '#2b2250';
          ctx.lineWidth = 8;
          ctx.strokeRect(4, 4, 248, 120);
          ctx.font = `900 52px ${FONT}, "Segoe UI Emoji", "Apple Color Emoji"`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = i % 2 ? '#4f7bff' : '#ff4f6b';
          ctx.fillText(text, 128, 68, 236);
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
        sign.position.set(0, s.height + 0.55, 0.05);
        s.root.add(sign);
        s.sign = sign;
        break;
      }
    });
  }

  /** Crowd excitement 0‥2 (decays by itself). */
  cheer(amount: number): void {
    this.hype = Math.min(2, this.hype + amount);
    for (const s of this.spectators) if (Math.random() < 0.6) s.hype = Math.min(1.5, s.hype + amount * (0.5 + Math.random()));
  }

  talk(i: number): void {
    if (this.commentators[i]) this.commentators[i].talk = 1.4;
  }

  commentatorHead(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.commentators[i]?.root.position ?? out.set(0, 0, 0)).setY(FLOOR_Y + 2.4);
  }

  spectatorHead(i: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.spectators[i];
    return out.copy(s.root.position).setY(s.root.position.y + s.height + (s.sign ? 0.9 : 0.25));
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number, fighters: FighterState[] | null, ropeLevel: number): void {
    this.time += dt;
    this.hype *= Math.exp(-dt * 0.6);
    const t = this.time;
    for (const s of this.spectators) {
      s.hype *= Math.exp(-dt * 1.2);
      const idle = Math.sin(t * 2 + s.phase) * 0.03;
      const jump = Math.max(0, Math.sin(t * 9 + s.phase * 3)) * (0.35 * s.hype + 0.08 * this.hype);
      s.root.position.y = s.base.y + idle + jump;
      s.root.rotation.z = Math.sin(t * 3 + s.phase) * (0.05 + 0.12 * s.hype);
      if (s.sign) s.sign.rotation.z = Math.sin(t * 5 + s.phase) * 0.2 * (0.3 + s.hype);
    }
    this.updateCrowdMatrices();
    for (const c of this.commentators) {
      c.talk = Math.max(0, c.talk - dt);
      const k = c.talk > 0 ? 1 : 0;
      c.root.position.y = FLOOR_Y + 1.0 + k * Math.abs(Math.sin(t * 14)) * 0.12;
      c.root.rotation.z = k * Math.sin(t * 9) * 0.12;
    }
    for (const [i, b] of this.beams.entries()) (b.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.03 * Math.sin(t * 0.7 + i) + this.hype * 0.02;
    this.updateRopes(fighters ?? [], ropeLevel);
  }

  private updateCrowdMatrices(): void {
    for (const s of this.spectators) s.root.updateMatrix();
    for (const b of this.batches) {
      b.members.forEach((i, k) => b.mesh.setMatrixAt(k, this._m.multiplyMatrices(this.spectators[i].root.matrix, b.local[k])));
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Light beams are pure fill-rate; drop them on low quality. */
  setQuality(high: boolean): void {
    for (const b of this.beams) b.visible = high;
  }

  /** Ropes bulge where a fighter presses into them and sag when slack. */
  private updateRopes(fighters: FighterState[], ropeLevel: number): void {
    const N = ROPE_RINGS - 1;
    for (const rope of this.ropes) {
      const height = ARENA.ropes[rope.level] * (0.55 + 0.45 * ropeLevel);
      const sag = (1 - ropeLevel) * 0.6;
      const along: { at: number; push: number }[] = [];
      for (const f of fighters) {
        if (f.out) continue;
        const edge = H - f.radius * 0.55;
        const onAxis = rope.side < 2 ? f.p.x : f.p.z;
        const across = rope.side < 2 ? f.p.z : f.p.x;
        const sign = rope.side % 2 === 0 ? 1 : -1;
        const pen = onAxis * sign - edge;
        const ropeY = height;
        if (pen > 0 && f.y < ropeY + 0.4 && f.y + f.spec.height > ropeY - 0.2) along.push({ at: across, push: Math.min(1.2, pen) });
      }
      const key = `${height.toFixed(3)}|${along.map((a) => `${a.at.toFixed(2)},${a.push.toFixed(2)}`).join(';')}`;
      if (key === rope.lastKey) continue;
      rope.lastKey = key;
      const pts = this.ropePts;
      for (let i = 0; i <= N; i++) {
        const u = -H + (i / N) * 2 * H;
        let push = 0;
        for (const a of along) push = Math.max(push, a.push * Math.exp(-((u - a.at) ** 2) / 1.1));
        const mid = 1 - (u / H) ** 2;
        const out = H + push;
        const y = height - sag * mid;
        const sign = rope.side % 2 === 0 ? 1 : -1;
        if (rope.side < 2) pts[i].set(sign * out, y, u);
        else pts[i].set(u, y, sign * out);
      }
      writeRope(rope.mesh.geometry, pts);
    }
  }
}
