/**
 * Particles and pop-up words. Particles are batched: one THREE.Points draw call per
 * particle kind (instead of one sprite draw per particle), so big hits don't spike the
 * draw-call count. Cheap enough for phones.
 */
import * as THREE from 'three';

export type ParticleKind = 'star' | 'dust' | 'smoke' | 'flame' | 'heart' | 'skull' | 'gas' | 'zzz' | 'confetti' | 'bolt' | 'spark' | 'note' | 'question';

const KINDS: ParticleKind[] = ['star', 'dust', 'smoke', 'flame', 'heart', 'skull', 'gas', 'zzz', 'confetti', 'bolt', 'spark', 'note', 'question'];
const PER_KIND = 96;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  life: number;
  maxLife: number;
  s0: number;
  s1: number;
  rot: number;
  spin: number;
  drag: number;
  r: number;
  g: number;
  b: number;
}

interface Batch {
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  pos: Float32Array;
  col: Float32Array;
  alpha: Float32Array;
  size: Float32Array;
  rot: Float32Array;
  live: Particle[];
}

function canvasTex(draw: (ctx: CanvasRenderingContext2D, s: number) => void, size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function puff(color: string, edge = 'rgba(255,255,255,0)') {
  return (ctx: CanvasRenderingContext2D, s: number) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color);
    g.addColorStop(1, edge);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  };
}

function glyph(ch: string, color: string, font = '900 46px "M PLUS Rounded 1c", sans-serif', stroke = '#fff') {
  return (ctx: CanvasRenderingContext2D, s: number) => {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(ch, s / 2, s / 2 + 2);
    ctx.fillStyle = color;
    ctx.fillText(ch, s / 2, s / 2 + 2);
  };
}

function starShape(color: string) {
  return (ctx: CanvasRenderingContext2D, s: number) => {
    ctx.translate(s / 2, s / 2);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? s * 0.46 : s * 0.2;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fill();
  };
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
attribute float aRot;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying float vRot;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // ×1.41 so the texture still fills its size after the in-shader rotation shrink.
  gl_PointSize = aSize * 1.41 * uScale / max(0.1, -mv.z);
  vColor = aColor;
  vAlpha = aAlpha;
  vRot = aRot;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
varying float vRot;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vRot), co = cos(vRot);
  vec2 uv = vec2(co * c.x - s * c.y, s * c.x + co * c.y) * 1.41 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 t = texture2D(uMap, vec2(uv.x, 1.0 - uv.y));
  gl_FragColor = vec4(t.rgb * vColor, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Effects {
  private batches = new Map<ParticleKind, Batch>();
  private pool: Particle[] = [];
  private total = 0;
  private uScale = { value: 600 };
  private wordTex = new Map<string, THREE.CanvasTexture>();
  private words: { sprite: THREE.Sprite; life: number; maxLife: number; base: number; aspect: number }[] = [];
  /** 1 = full, 0.45 = reduced (low quality). */
  density = 1;
  private readonly max = 220;
  private tmpColor = new THREE.Color();

  constructor(private scene: THREE.Scene) {
    const tex: Record<ParticleKind, THREE.Texture> = {
      star: canvasTex(starShape('#ffd23f')),
      spark: canvasTex(puff('rgba(255,250,200,1)', 'rgba(255,200,80,0)')),
      dust: canvasTex(puff('rgba(255,255,255,0.95)')),
      smoke: canvasTex(puff('rgba(140,130,150,0.9)', 'rgba(140,130,150,0)')),
      flame: canvasTex(puff('rgba(255,240,120,1)', 'rgba(255,60,0,0)')),
      heart: canvasTex(glyph('♥', '#ff4f8b')),
      skull: canvasTex(glyph('💀', '#fff', '46px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif', 'rgba(0,0,0,0)')),
      gas: canvasTex(puff('rgba(170,220,90,0.95)', 'rgba(140,200,60,0)')),
      zzz: canvasTex(glyph('Z', '#6b7bff')),
      question: canvasTex(glyph('?', '#7a5cff')),
      confetti: canvasTex((ctx, s) => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(s * 0.2, s * 0.3, s * 0.6, s * 0.4);
      }),
      bolt: canvasTex(glyph('⚡', '#ffe600', '900 50px sans-serif', '#7a5cff')),
      note: canvasTex(glyph('♪', '#ff8a00')),
    };
    for (const kind of KINDS) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(PER_KIND * 3);
      const col = new Float32Array(PER_KIND * 3);
      const alpha = new Float32Array(PER_KIND);
      const size = new Float32Array(PER_KIND);
      const rot = new Float32Array(PER_KIND);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setDrawRange(0, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: tex[kind] }, uScale: this.uScale },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: kind === 'flame' || kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = 10;
      scene.add(points);
      this.batches.set(kind, { points, geo, pos, col, alpha, size, rot, live: [] });
    }
  }

  /** Point sizes are in world units; this converts them to pixels for the current viewport. */
  setViewport(drawingBufferHeight: number, fovDeg: number): void {
    this.uScale.value = drawingBufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(kind: ParticleKind, at: THREE.Vector3, count: number, o: { speed?: number; up?: number; life?: number; size?: number; grow?: number; gravity?: number; color?: THREE.ColorRepresentation; spread?: number; drag?: number; dir?: THREE.Vector3 } = {}): void {
    const batch = this.batches.get(kind)!;
    const n = Math.max(1, Math.round(count * this.density));
    if (o.color !== undefined) this.tmpColor.set(o.color);
    for (let i = 0; i < n; i++) {
      if (this.total >= this.max || batch.live.length >= PER_KIND) return;
      const p = this.pool.pop() ?? ({} as Particle);
      const sp = (o.speed ?? 3) * (0.5 + Math.random() * 0.7);
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.2) * (o.spread ?? 1);
      p.vx = Math.cos(a) * sp;
      p.vy = (o.up ?? 2) * (0.6 + Math.random() * 0.8) + el;
      p.vz = Math.sin(a) * sp;
      if (o.dir) {
        p.vx += o.dir.x * sp * 1.2;
        p.vy += o.dir.y * sp * 1.2;
        p.vz += o.dir.z * sp * 1.2;
      }
      p.x = at.x + (Math.random() - 0.5) * 0.3;
      p.y = at.y + (Math.random() - 0.5) * 0.3;
      p.z = at.z + (Math.random() - 0.5) * 0.3;
      p.life = p.maxLife = (o.life ?? 0.8) * (0.7 + Math.random() * 0.6);
      p.s0 = (o.size ?? 0.4) * (0.7 + Math.random() * 0.6);
      p.s1 = p.s0 * (o.grow ?? 1);
      p.gravity = o.gravity ?? 6;
      p.drag = o.drag ?? 1.5;
      p.rot = 0;
      p.spin = (Math.random() - 0.5) * 6;
      if (o.color !== undefined) {
        p.r = this.tmpColor.r;
        p.g = this.tmpColor.g;
        p.b = this.tmpColor.b;
      } else if (kind === 'confetti') {
        this.tmpColor.setHSL(Math.random(), 0.85, 0.6);
        p.r = this.tmpColor.r;
        p.g = this.tmpColor.g;
        p.b = this.tmpColor.b;
      } else p.r = p.g = p.b = 1;
      batch.live.push(p);
      this.total++;
    }
  }

  /** Big comic word (e.g. "ドカッ!") that pops and floats. */
  word(text: string, at: THREE.Vector3, color = '#ff3b6b', size = 1.3): void {
    if (this.words.length > 6) {
      const old = this.words.shift()!;
      old.sprite.removeFromParent();
      (old.sprite.material as THREE.Material).dispose();
    }
    let tex = this.wordTex.get(text + color);
    if (!tex) {
      const c = document.createElement('canvas');
      const font = '900 120px "M PLUS Rounded 1c", "Arial Black", sans-serif';
      const probe = c.getContext('2d')!;
      probe.font = font;
      // Long move names get a wider canvas instead of being clipped.
      c.width = Math.min(2048, Math.max(512, Math.ceil(probe.measureText(text).width + 70)));
      c.height = 192;
      const ctx = c.getContext('2d')!;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 26;
      ctx.strokeStyle = '#2a1a4a';
      ctx.strokeText(text, c.width / 2, 100);
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(text, c.width / 2, 100);
      ctx.fillStyle = color;
      ctx.fillText(text, c.width / 2, 100);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.wordTex.set(text + color, tex);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sprite.renderOrder = 20;
    sprite.position.copy(at);
    (sprite.material as THREE.SpriteMaterial).rotation = (Math.random() - 0.5) * 0.4;
    this.scene.add(sprite);
    const aspect = (tex.image as HTMLCanvasElement).width / 192;
    // Long titles stay on screen a little longer so they can be read.
    const life = aspect > 3.5 ? 1.5 : 0.9;
    this.words.push({ sprite, life, maxLife: life, base: size, aspect });
  }

  update(dt: number): void {
    for (const b of this.batches.values()) {
      const live = b.live;
      let w = 0;
      for (let i = 0; i < live.length; i++) {
        const p = live[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.pool.push(p);
          this.total--;
          continue;
        }
        p.vy -= p.gravity * dt;
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr;
        p.vy *= dr;
        p.vz *= dr;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rot += p.spin * dt;
        const k = 1 - p.life / p.maxLife;
        live[w] = p;
        b.pos[w * 3] = p.x;
        b.pos[w * 3 + 1] = p.y;
        b.pos[w * 3 + 2] = p.z;
        b.col[w * 3] = p.r;
        b.col[w * 3 + 1] = p.g;
        b.col[w * 3 + 2] = p.b;
        b.alpha[w] = Math.min(1, (1 - k) * 2.2);
        b.size[w] = p.s0 + (p.s1 - p.s0) * k;
        b.rot[w] = p.rot;
        w++;
      }
      live.length = w;
      b.geo.setDrawRange(0, w);
      if (w > 0) for (const name of ['position', 'aColor', 'aAlpha', 'aSize', 'aRot']) (b.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
    for (let i = this.words.length - 1; i >= 0; i--) {
      const wd = this.words[i];
      wd.life -= dt;
      if (wd.life <= 0) {
        wd.sprite.removeFromParent();
        (wd.sprite.material as THREE.Material).dispose();
        this.words.splice(i, 1);
        continue;
      }
      const k = 1 - wd.life / wd.maxLife;
      const pop = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
      wd.sprite.scale.set(wd.base * wd.aspect * pop, wd.base * pop, 1);
      wd.sprite.position.y += dt * 0.6;
      (wd.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, wd.life * 3);
    }
  }

  clear(): void {
    for (const b of this.batches.values()) {
      for (const p of b.live) this.pool.push(p);
      b.live.length = 0;
      b.geo.setDrawRange(0, 0);
    }
    this.total = 0;
    for (const w of this.words) {
      w.sprite.removeFromParent();
      (w.sprite.material as THREE.Material).dispose();
    }
    this.words.length = 0;
  }
}
