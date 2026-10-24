/**
 * The arcade stadium: striped pitch with lines, boards all round (the ball bounces off them —
 * no throw-ins), two goals with nets, stands on all sides with an instanced glyph crowd that
 * jumps when something happens.
 */
import * as THREE from 'three';
import { processInput, type ProcessedInput } from '@shared/core/InputProcessor';
import { hashString, Rng } from '@shared/core/rng';
import { buildGlyphModel, type GlyphTemplate } from '@shared/render/Glyph3DFactory';
import { renderGlyph } from '@shared/render/GlyphRenderer';
import { FIELD } from '../sim/types';

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Microsoft YaHei", sans-serif';
export const CROWD_POOL = ['人', '口', '大', '小', '王', 'あ', 'の', 'A', '?', '!', '♪', '⚽', '😀', '👀', '🤩', '😂', '🎉', '📣', '田', '川', '笑', 'ね', 'Z', '★', '♥', '🐱', '🐶', '🙌'];

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
  /** Which side the fan cheers for (jumps more for them). */
  team: 0 | 1;
}

export class Stadium {
  readonly group = new THREE.Group();
  private fans: Fan[] = [];
  private batches: { mesh: THREE.InstancedMesh; members: number[]; local: THREE.Matrix4[] }[] = [];
  private templates = new Map<string, GlyphTemplate>();
  private seats: { pos: THREE.Vector3; yaw: number }[] = [];
  private nets: THREE.Mesh[] = [];
  private netShake = [0, 0];
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
    this.buildGround();
    this.buildGoals();
    this.buildStands();
  }

  private buildGround(): void {
    const { halfL, halfW } = FIELD;
    const g = this.group;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(120, 90).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b6a3a, roughness: 1 }));
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    g.add(outer);
    const W = 2048, Hh = Math.round((W * halfW) / halfL);
    const pitchTex = tex(W, Hh, (ctx) => {
      const stripes = 12;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? '#4fb352' : '#46a64a';
        ctx.fillRect((i * W) / stripes, 0, W / stripes + 1, Hh);
      }
      const sx = W / (halfL * 2), sz = Hh / (halfW * 2);
      const X = (x: number) => (x + halfL) * sx, Z = (z: number) => (z + halfW) * sz;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 6;
      ctx.strokeRect(X(-halfL + 0.15), Z(-halfW + 0.15), (halfL * 2 - 0.3) * sx, (halfW * 2 - 0.3) * sz);
      ctx.beginPath();
      ctx.moveTo(X(0), Z(-halfW));
      ctx.lineTo(X(0), Z(halfW));
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(X(0), Z(0), 3.5 * sx, 3.5 * sz, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (const s of [-1, 1]) {
        const bx = s > 0 ? X(halfL - 6) : X(-halfL);
        ctx.strokeRect(bx, Z(-7), 6 * sx, 14 * sz);
        const gx = s > 0 ? X(halfL - 2.4) : X(-halfL);
        ctx.strokeRect(gx, Z(-4.2), 2.4 * sx, 8.4 * sz);
        ctx.beginPath();
        ctx.arc(X(s * (halfL - 4.4)), Z(0), 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = `900 ${Math.round(4.4 * sz)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('字', X(0), Z(0) + 6);
    });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(halfL * 2, halfW * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95 }));
    pitch.receiveShadow = true;
    g.add(pitch);

    // Boards.
    const boardH = 0.8, th = 0.25;
    const sides: [number, number, number, number][] = [
      [0, halfW + th / 2, halfL * 2 + th * 2, th],
      [0, -halfW - th / 2, halfL * 2 + th * 2, th],
    ];
    for (const [x, z, w, d] of sides) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, boardH, d), this.boardMat);
      b.position.set(x, boardH / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
    }
    // End boards beside each goal mouth.
    const endLen = halfW - FIELD.goalHalfW;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(th, boardH, endLen), this.boardMat);
        b.position.set(sx * (halfL + th / 2), boardH / 2, sz * (FIELD.goalHalfW + endLen / 2));
        b.castShadow = true;
        g.add(b);
      }
    }
  }

  setBoardText(texts: string[]): void {
    const t = tex(2048, 128, (ctx) => {
      const n = texts.length * 3;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = ['#ff4f8b', '#7a5cff', '#2b1a4a', '#ffd23f', '#48d6c8'][i % 5];
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

  private buildGoals(): void {
    const { halfL, goalHalfW, goalH, goalDepth, postR } = FIELD;
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 });
    const netTex = tex(256, 256, (ctx) => {
      ctx.clearRect(0, 0, 256, 256);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      for (let i = 0; i <= 256; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }
    });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    for (const sx of [-1, 1]) {
      const goal = new THREE.Group();
      const post = (h: number) => new THREE.CylinderGeometry(postR, postR, h, 12);
      for (const sz of [-1, 1]) {
        const p = new THREE.Mesh(post(goalH), white);
        p.position.set(sx * halfL, goalH / 2, sz * goalHalfW);
        p.castShadow = true;
        goal.add(p);
        const back = new THREE.Mesh(post(goalH), white);
        back.position.set(sx * (halfL + goalDepth), goalH / 2, sz * goalHalfW);
        goal.add(back);
      }
      const bar = new THREE.Mesh(post(goalHalfW * 2).rotateX(Math.PI / 2), white);
      bar.position.set(sx * halfL, goalH, 0);
      bar.castShadow = true;
      goal.add(bar);
      const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const backNet = new THREE.Mesh(new THREE.PlaneGeometry(goalHalfW * 2, goalH), netMat.clone());
      (backNet.material as THREE.MeshBasicMaterial).map = netTex.clone();
      (backNet.material as THREE.MeshBasicMaterial).map!.repeat.set(4, 2);
      backNet.rotation.y = Math.PI / 2;
      backNet.position.set(sx * (halfL + goalDepth), goalH / 2, 0);
      goal.add(backNet);
      this.nets.push(backNet);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(goalDepth, goalHalfW * 2), netMat);
      top.rotation.x = -Math.PI / 2;
      top.position.set(sx * (halfL + goalDepth / 2), goalH, 0);
      goal.add(top);
      for (const sz of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(goalDepth, goalH), netMat);
        side.position.set(sx * (halfL + goalDepth / 2), goalH / 2, sz * goalHalfW);
        goal.add(side);
      }
      this.group.add(goal);
    }
  }

  /** A goal into the net at side x (−1 / +1): the net bulges. */
  shakeNet(side: number): void {
    this.netShake[side > 0 ? 1 : 0] = 1;
  }

  private buildStands(): void {
    const { halfL, halfW } = FIELD;
    const g = this.group;
    const standMat = new THREE.MeshStandardMaterial({ color: 0x3b2f6b, roughness: 0.85 });
    const rows = 4;
    const add = (axis: 'x' | 'z', sign: number, count: number) => {
      for (let r = 0; r < rows; r++) {
        const dist = (axis === 'z' ? halfW : halfL) + 2.2 + r * 1.4;
        const len = axis === 'z' ? halfL * 2 + 6 : halfW * 2 + 6;
        const h = 0.7 * (r + 1);
        const step = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 1.4 : len, h, axis === 'x' ? len : 1.4), standMat);
        step.position.set(axis === 'x' ? sign * dist : 0, h / 2, axis === 'z' ? sign * dist : 0);
        step.receiveShadow = true;
        g.add(step);
        for (let i = 0; i < count; i++) {
          const along = -len / 2 + 1.5 + ((i + (r % 2) * 0.5) / count) * (len - 3);
          const pos = axis === 'x' ? new THREE.Vector3(sign * dist, h, along) : new THREE.Vector3(along, h, sign * dist);
          this.seats.push({ pos, yaw: Math.atan2(-pos.x, -pos.z) });
        }
      }
    };
    add('z', -1, 22);
    // No stand on the camera side: it would block the view of the pitch.
    add('x', -1, 9);
    add('x', 1, 9);
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

  /** Fill the stands with a new random crowd (a different one every match). */
  async populate(seed: number): Promise<void> {
    const rng = new Rng(seed ^ 0xfa45);
    const pool = CROWD_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const kinds = pool.slice(0, 12);
    const tpls: GlyphTemplate[] = [];
    for (const [i, ch] of kinds.entries()) {
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

  /** Which side a spectator supports (fans sit behind their team's half). */
  fanTeam(i: number): 0 | 1 {
    return this.fans[i]?.team ?? 0;
  }

  /** World position just above a spectator's head (for speech bubbles). */
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
      this.netShake[i] = Math.max(0, this.netShake[i] - dt * 1.5);
      const k = this.netShake[i];
      n.scale.set(1, 1 + Math.sin(this.time * 30) * 0.04 * k, 1);
      n.position.x = (i ? 1 : -1) * (FIELD.halfL + FIELD.goalDepth + k * 0.35 * Math.abs(Math.sin(this.time * 12)));
    });
  }
}
