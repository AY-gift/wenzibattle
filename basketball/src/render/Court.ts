/**
 * The arcade arena: a wooden court with lines and three-point arcs, two hoops (pole, backboard,
 * orange rim, a net that swishes), low walls all round with ad boards (the ball bounces off
 * them — no out-of-bounds), and stands with an instanced glyph crowd that jumps when something
 * happens.
 */
import * as THREE from 'three';
import { processInput, type ProcessedInput } from '@shared/core/InputProcessor';
import { hashString, Rng } from '@shared/core/rng';
import { buildGlyphModel, type GlyphTemplate } from '@shared/render/Glyph3DFactory';
import { renderGlyph } from '@shared/render/GlyphRenderer';
import { COURT } from '../sim/types';

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Microsoft YaHei", sans-serif';
export const CROWD_POOL = ['人', '口', '大', '小', '王', 'あ', 'の', 'A', '?', '!', '♪', '🏀', '😀', '👀', '🤩', '😂', '🎉', '📣', '田', '川', '笑', 'ね', 'Z', '★', '♥', '🐱', '🐶', '🙌'];

function tex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface Fan {
  pos: THREE.Vector3;
  yaw: number;
  scale: number;
  phase: number;
  hype: number;
  height: number;
  team: 0 | 1;
}

export class Court {
  readonly group = new THREE.Group();
  private fans: Fan[] = [];
  private batches: { mesh: THREE.InstancedMesh; members: number[]; local: THREE.Matrix4[] }[] = [];
  private templates = new Map<string, GlyphTemplate>();
  private seats: { pos: THREE.Vector3; yaw: number }[] = [];
  private nets: THREE.Mesh[] = [];
  private rims: THREE.Mesh[] = [];
  private netShake = [0, 0];
  private rimShake = [0, 0];
  private time = 0;
  private hype = 0;
  private boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private e = new THREE.Euler();
  private fanMats: THREE.Matrix4[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.buildFloor();
    this.buildHoops();
    this.buildStands();
  }

  private buildFloor(): void {
    const { halfL, halfW, hoopX, threeR, cornerZ } = COURT;
    const g = this.group;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2a55, roughness: 1 }));
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    g.add(outer);
    const W = 2048, H = Math.round((W * halfW) / halfL);
    const floorTex = tex(W, H, (ctx) => {
      // Maple planks.
      const planks = 40;
      for (let i = 0; i < planks; i++) {
        ctx.fillStyle = i % 3 === 0 ? '#e2b277' : i % 3 === 1 ? '#dcaa6e' : '#e6b980';
        ctx.fillRect(0, (i * H) / planks, W, H / planks + 1);
      }
      ctx.fillStyle = 'rgba(120,70,20,0.06)';
      for (let i = 0; i < 300; i++) ctx.fillRect(((i * 97) % W), ((i * 53) % H), 60, 2);
      const sx = W / (halfL * 2), sz = H / (halfW * 2);
      const X = (x: number) => (x + halfL) * sx, Z = (z: number) => (z + halfW) * sz;
      // Painted keys.
      for (const s of [-1, 1]) {
        ctx.fillStyle = s < 0 ? 'rgba(255,79,139,0.55)' : 'rgba(122,92,255,0.55)';
        const kx = s > 0 ? X(halfL - 5) : X(-halfL);
        ctx.fillRect(kx, Z(-1.9), 5 * sx, 3.8 * sz);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 6;
      ctx.strokeRect(X(-halfL + 0.15), Z(-halfW + 0.15), (halfL * 2 - 0.3) * sx, (halfW * 2 - 0.3) * sz);
      ctx.beginPath();
      ctx.moveTo(X(0), Z(-halfW));
      ctx.lineTo(X(0), Z(halfW));
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(X(0), Z(0), 1.8 * sx, 1.8 * sz, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (const s of [-1, 1]) {
        // Key outline and free-throw circle.
        const kx = s > 0 ? X(halfL - 5) : X(-halfL);
        ctx.strokeRect(kx, Z(-1.9), 5 * sx, 3.8 * sz);
        ctx.beginPath();
        ctx.ellipse(X(s * (halfL - 5)), Z(0), 1.8 * sx, 1.8 * sz, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Three-point line: straight in the corners, an arc around the rim.
        const hx = s * hoopX;
        const a0 = Math.asin(cornerZ / threeR);
        ctx.beginPath();
        ctx.moveTo(X(s * halfL), Z(-cornerZ));
        ctx.lineTo(X(hx - s * threeR * Math.cos(a0)), Z(-cornerZ));
        for (let i = 0; i <= 48; i++) {
          const a = -a0 + (i / 48) * a0 * 2;
          ctx.lineTo(X(hx - s * threeR * Math.cos(a)), Z(threeR * Math.sin(a)));
        }
        ctx.lineTo(X(s * halfL), Z(cornerZ));
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(43,26,74,0.16)';
      ctx.font = `900 ${Math.round(2.6 * sz)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('字', X(0), Z(0) + 4);
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfL * 2, halfW * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45, metalness: 0.05 }));
    floor.receiveShadow = true;
    g.add(floor);
    // Low walls with ad boards.
    const wallH = 0.75, th = 0.22;
    const walls: [number, number, number, number][] = [
      [0, halfW + th / 2, halfL * 2 + th * 2, th],
      [0, -halfW - th / 2, halfL * 2 + th * 2, th],
      [halfL + th / 2, 0, th, halfW * 2],
      [-halfL - th / 2, 0, th, halfW * 2],
    ];
    for (const [x, z, w, d] of walls) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), this.boardMat);
      b.position.set(x, wallH / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
    }
  }

  setBoardText(texts: string[]): void {
    const t = tex(2048, 128, (ctx) => {
      const n = texts.length * 3;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = ['#ff8a00', '#7a5cff', '#2b1a4a', '#ffd23f', '#48d6c8'][i % 5];
        ctx.fillRect((i * 2048) / n, 0, 2048 / n + 1, 128);
        ctx.fillStyle = i % 5 === 3 ? '#2b1a4a' : '#fff';
        ctx.font = `900 64px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(texts[i % texts.length], ((i + 0.5) * 2048) / n, 66, 2048 / n - 20);
      }
    });
    t.wrapS = THREE.RepeatWrapping;
    this.boardMat.map?.dispose();
    this.boardMat.map = t;
    this.boardMat.needsUpdate = true;
  }

  private buildHoops(): void {
    const { hoopX, rimH, rimR, boardX, boardHalfW, boardBottom, boardTop } = COURT;
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b1a4a, roughness: 0.4, metalness: 0.4 });
    const glassTex = tex(256, 160, (ctx) => {
      ctx.fillStyle = 'rgba(230,245,255,0.55)';
      ctx.fillRect(0, 0, 256, 160);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, 246, 150);
      ctx.strokeStyle = '#ff5b2e';
      ctx.lineWidth = 8;
      ctx.strokeRect(86, 70, 84, 64);
    });
    const glass = new THREE.MeshStandardMaterial({ map: glassTex, transparent: true, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.35, metalness: 0.5, emissive: 0x401000 });
    const netTex = tex(128, 128, (ctx) => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3;
      for (let i = -128; i <= 256; i += 21) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 128, 128);
        ctx.moveTo(i + 128, 0);
        ctx.lineTo(i, 128);
        ctx.stroke();
      }
    });
    netTex.wrapS = THREE.RepeatWrapping;
    netTex.repeat.set(3, 1);
    for (const s of [-1, 1]) {
      const hoop = new THREE.Group();
      // Pole behind the baseline, arm to the board.
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, boardTop + 0.3, 12), steel);
      pole.position.set(s * (boardX + 0.35), (boardTop + 0.3) / 2, 0);
      pole.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.12), steel);
      arm.position.set(s * (boardX + 0.17), boardTop - 0.25, 0);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: s < 0 ? 0xff4f8b : 0x7a5cff, roughness: 0.8 }));
      pad.position.set(s * (boardX + 0.35), 0.35, 0);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(boardHalfW * 2, boardTop - boardBottom), glass);
      board.rotation.y = Math.PI / 2;
      board.position.set(s * boardX, (boardTop + boardBottom) / 2, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.035, 10, 40).rotateX(Math.PI / 2), rimMat);
      rim.position.set(s * hoopX, rimH, 0);
      rim.castShadow = true;
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(boardX - hoopX - rimR, 0.05, 0.12), rimMat);
      bracket.position.set(s * (boardX - (boardX - hoopX - rimR) / 2), rimH, 0);
      const net = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.6, 0.55, 20, 1, true), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      net.position.set(s * hoopX, rimH - 0.29, 0);
      hoop.add(pole, arm, pad, board, rim, bracket, net);
      this.nets.push(net);
      this.rims.push(rim);
      this.group.add(hoop);
    }
  }

  /** A basket at side x (−1 / +1): the net swishes. */
  swish(side: number): void {
    this.netShake[side > 0 ? 1 : 0] = 1;
  }

  /** The rim rattles. */
  clank(side: number): void {
    this.rimShake[side > 0 ? 1 : 0] = 1;
  }

  private buildStands(): void {
    const { halfL, halfW } = COURT;
    const g = this.group;
    const standMat = new THREE.MeshStandardMaterial({ color: 0x3b2f6b, roughness: 0.85 });
    const rows = 4;
    const add = (axis: 'x' | 'z', sign: number, count: number) => {
      for (let r = 0; r < rows; r++) {
        const dist = (axis === 'z' ? halfW : halfL) + 1.8 + r * 1.3;
        const len = axis === 'z' ? halfL * 2 + 5 : halfW * 2 + 5;
        const h = 0.65 * (r + 1);
        const step = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 1.3 : len, h, axis === 'x' ? len : 1.3), standMat);
        step.position.set(axis === 'x' ? sign * dist : 0, h / 2, axis === 'z' ? sign * dist : 0);
        step.receiveShadow = true;
        g.add(step);
        for (let i = 0; i < count; i++) {
          const along = -len / 2 + 1.3 + ((i + (r % 2) * 0.5) / count) * (len - 2.6);
          const pos = axis === 'x' ? new THREE.Vector3(sign * dist, h, along) : new THREE.Vector3(along, h, sign * dist);
          this.seats.push({ pos, yaw: Math.atan2(-pos.x, -pos.z) });
        }
      }
    };
    add('z', -1, 18);
    add('x', -1, 8);
    add('x', 1, 8);
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

  /** Fill the stands with a new random crowd. */
  async populate(seed: number): Promise<void> {
    const rng = new Rng(seed ^ 0xb45c);
    const pool = CROWD_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const tpls: GlyphTemplate[] = [];
    for (const [i, ch] of pool.slice(0, 12).entries()) {
      const t = await this.template(ch);
      if (t) tpls.push(t);
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    if (!tpls.length) return;
    for (const b of this.batches) {
      b.mesh.removeFromParent();
      b.mesh.dispose();
    }
    this.batches = [];
    this.fans = [];
    const byTpl = new Map<GlyphTemplate, number[]>();
    for (const seat of this.seats) {
      if (rng.next() > 0.85) continue;
      const tpl = rng.pick(tpls);
      const scale = 0.4 + rng.next() * 0.2;
      const idx = this.fans.length;
      this.fans.push({ pos: seat.pos.clone(), yaw: seat.yaw + (rng.next() - 0.5) * 0.4, scale, phase: rng.next() * 10, hype: 0, height: tpl.height * scale, team: seat.pos.x < 0 ? 0 : 1 });
      if (!byTpl.has(tpl)) byTpl.set(tpl, []);
      byTpl.get(tpl)!.push(idx);
    }
    for (const [tpl, members] of byTpl) {
      const local = members.map((i) => new THREE.Matrix4().makeScale(this.fans[i].scale, this.fans[i].scale, this.fans[i].scale).setPosition(0, (tpl.height * this.fans[i].scale) / 2, 0));
      for (const part of tpl.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.materials, members.length);
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(mesh);
        this.batches.push({ mesh, members, local });
      }
    }
    this.update(0);
  }

  get fanCount(): number {
    return this.fans.length;
  }

  fanTeam(i: number): 0 | 1 {
    return this.fans[i]?.team ?? 0;
  }

  fanHead(i: number, out: THREE.Vector3): THREE.Vector3 {
    const f = this.fans[i];
    if (!f) return out.set(0, -100, 0);
    return out.set(f.pos.x, f.pos.y + f.height + 0.35, f.pos.z);
  }

  cheer(amount: number, team?: 0 | 1): void {
    this.hype = Math.min(2, this.hype + amount);
    for (const f of this.fans) if (team === undefined || f.team === team || Math.random() < 0.3) f.hype = Math.min(1.6, f.hype + amount * (0.5 + Math.random()));
  }

  update(dt: number): void {
    this.time += dt;
    this.hype *= Math.exp(-dt * 0.6);
    const t = this.time;
    const mats = this.fanMats;
    while (mats.length < this.fans.length) mats.push(new THREE.Matrix4());
    this.fans.forEach((f, i) => {
      f.hype *= Math.exp(-dt * 1.1);
      const jump = Math.max(0, Math.sin(t * 9 + f.phase * 3)) * (0.4 * f.hype + 0.06 * this.hype) + Math.sin(t * 2 + f.phase) * 0.03;
      this.v.set(f.pos.x, f.pos.y + jump, f.pos.z);
      this.q.setFromEuler(this.e.set(0, f.yaw, Math.sin(t * 3 + f.phase) * (0.05 + 0.1 * f.hype)));
      mats[i].compose(this.v, this.q, this.s);
    });
    for (const b of this.batches) {
      b.members.forEach((i, k) => b.mesh.setMatrixAt(k, this.m4.multiplyMatrices(mats[i], b.local[k])));
      b.mesh.instanceMatrix.needsUpdate = true;
    }
    this.nets.forEach((n, i) => {
      this.netShake[i] = Math.max(0, this.netShake[i] - dt * 2);
      const k = this.netShake[i];
      n.scale.set(1 - k * 0.15, 1 + k * 0.35 * Math.abs(Math.sin(this.time * 18)), 1 - k * 0.15);
      n.position.y = COURT.rimH - 0.29 - k * 0.1;
    });
    this.rims.forEach((r, i) => {
      this.rimShake[i] = Math.max(0, this.rimShake[i] - dt * 4);
      r.rotation.z = Math.sin(this.time * 50) * 0.04 * this.rimShake[i];
    });
  }
}
