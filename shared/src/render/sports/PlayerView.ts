/**
 * One glyph player on screen (football and basketball): the character's 3D glyph model (same as in the arena) with a
 * team-coloured base ring, squash & stretch, leaning into runs, lying down when knocked over,
 * diving saves, a shield bubble for 铁壁 moves and celebration hops. Every player wears the team
 * kit: the glyph itself is recoloured in the team colour (emoji keep their face, their edges and
 * the marker above the head take the colour). Collision is the
 * simulation's capsule, never this mesh.
 */
import * as THREE from 'three';
import type { FighterBundle } from '../FighterFactory';
import type { GlyphInstance } from '../Glyph3DFactory';
import type { Kit } from '../../sports/kits';

/** What the view reads from a game's player (each sport has its own Player type). */
export interface ViewPlayer {
  id: number;
  p: { x: number; z: number };
  v: { x: number; z: number };
  y: number;
  face: { x: number; z: number };
  state: string;
  wallT: number;
  ghostT: number;
  attr: { radius: number };
}

const UP = new THREE.Vector3(0, 1, 0);
/** World height of a player (templates are ~1.7 tall). */
export const PLAYER_SCALE = 0.78;

export class PlayerView {
  readonly root = new THREE.Group();
  private tiltG = new THREE.Group();
  private bodyG = new THREE.Group();
  private inst: GlyphInstance | null = null;
  private ring: THREE.Mesh;
  private shadow: THREE.Mesh;
  private shield: THREE.Mesh;
  private bounds = new THREE.Box3();
  private baseColors: THREE.Color[] = [];
  /** The glyph's own colours (the kit colour keeps their light / dark structure). */
  private ownColors: THREE.Color[] = [];
  private marker: THREE.Mesh;
  private squash = 0;
  private squashV = 0;
  private flash = 0;
  private tilt = new THREE.Vector2();
  private yaw = 0;
  private qT = new THREE.Quaternion();
  private qY = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private corner = new THREE.Vector3();
  private qF = new THREE.Quaternion();
  private flipAxis = new THREE.Vector3();
  height = 1.3;
  /** Basketball: flips on dunks and twirls on big jumps (arcade style). */
  acrobatic = false;
  private airT = 0;
  private flipping = false;

  constructor(
    scene: THREE.Scene,
    readonly bundle: FighterBundle,
    kit: Kit,
    shadowTex: THREE.Texture,
  ) {
    this.inst = bundle.template.instantiate();
    for (const m of this.inst.materials) m.transparent = true;
    this.ownColors = this.inst.materials.map((m) => m.color.clone());
    this.inst.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.geometry) return;
      mesh.castShadow = true;
      mesh.geometry.computeBoundingBox();
      this.bounds.union(mesh.geometry.boundingBox!);
    });
    this.bodyG.add(this.inst.group);
    this.tiltG.add(this.bodyG);
    this.root.add(this.tiltG);
    this.height = bundle.template.height * PLAYER_SCALE;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }));
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.32, 14).rotateX(Math.PI), new THREE.MeshBasicMaterial());
    this.ring.renderOrder = 2;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x7cc8ff, transparent: true, opacity: 0.22, depthWrite: false }));
    this.shield.visible = false;
    scene.add(this.root, this.ring, this.shadow, this.shield, this.marker);
    this.setKit(kit);
  }

  /** Dress the player in a team colour. */
  setKit(kit: Kit): void {
    const team = new THREE.Color(kit.hex);
    const hsl = { h: 0, s: 0, l: 0 };
    team.getHSL(hsl);
    const own = { h: 0, s: 0, l: 0 };
    this.baseColors = (this.inst?.materials ?? []).map((m, i) => {
      // Textured faces (emoji, kaomoji plates) keep their picture; everything else takes the kit.
      if (m.map) return this.ownColors[i].clone();
      this.ownColors[i].getHSL(own);
      return new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(0.92, Math.max(0.12, hsl.l + (own.l - 0.6) * 0.55)));
    });
    (this.ring.material as THREE.MeshBasicMaterial).color.set(kit.hex);
    (this.marker.material as THREE.MeshBasicMaterial).color.set(kit.hex);
  }

  kick(amount: number, flash = 0): void {
    this.squashV += amount * 14;
    this.flash = Math.max(this.flash, flash);
  }

  sync(p: ViewPlayer, dt: number, time: number, camYaw: number, highlight: boolean): void {
    // Squash spring.
    this.squashV += (-this.squash * 140 - this.squashV * 13) * dt;
    this.squash += this.squashV * dt;
    const s = Math.max(-0.35, Math.min(0.45, this.squash));
    const grow = p.wallT > 0 ? 1.25 : 1;
    this.bodyG.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.4).multiplyScalar(PLAYER_SCALE * grow);

    // Lean / lie / dive.
    let tx = 0, tz = 0;
    const sp = Math.hypot(p.v.x, p.v.z);
    if (p.state === 'down') {
      tx = p.face.x * 1.45;
      tz = p.face.z * 1.45;
    } else if (p.state === 'dive' || p.state === 'dunk') {
      tx = (p.v.x / (sp || 1)) * 1.2;
      tz = (p.v.z / (sp || 1)) * 1.2;
    } else if (p.state === 'sleep') {
      tx = 0.9;
    } else if (p.state === 'laugh') {
      tx = Math.sin(time * 18) * 0.35;
    } else if (p.state === 'confuse') {
      tx = Math.sin(time * 6 + p.id) * 0.3;
      tz = Math.cos(time * 5 + p.id) * 0.3;
    } else {
      tx = p.v.x * 0.035;
      tz = p.v.z * 0.035;
      if (p.state === 'kick' || p.state === 'shoot') {
        tx -= p.face.x * 0.25;
        tz -= p.face.z * 0.25;
      }
    }
    const k = Math.min(1, dt * (p.state === 'down' || p.state === 'dive' ? 10 : 7));
    this.tilt.x += (tx - this.tilt.x) * k;
    this.tilt.y += (tz - this.tilt.y) * k;
    // Text stays readable: mostly facing the camera, turned a little toward the run.
    const faceYaw = Math.atan2(p.face.x, p.face.z);
    let dy = faceYaw - camYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const wantYaw = camYaw + Math.max(-0.55, Math.min(0.55, dy * 0.35)) + (p.state === 'celebrate' ? time * 6 : 0);
    this.yaw += (wantYaw - this.yaw) * Math.min(1, dt * 8);

    const th = Math.hypot(this.tilt.x, this.tilt.y);
    if (th > 1e-5) this.qT.setFromAxisAngle(this.axis.set(this.tilt.y / th, 0, -this.tilt.x / th), th);
    else this.qT.identity();
    // Air acrobatics: a full forward flip on a dunk, a twirl on any other big jump.
    let twirl = 0;
    this.qF.identity();
    if (this.acrobatic && p.y > 0.35 && p.state !== 'down') {
      this.airT += dt;
      if (p.state === 'dunk') this.flipping = true;
      if (this.flipping) this.qF.setFromAxisAngle(this.flipAxis.set(p.face.z, 0, -p.face.x), Math.min(Math.PI * 2, this.airT * 8.5));
      else if (p.y > 1.2) twirl = Math.min(Math.PI * 2, (this.airT - 0.15) * 9);
    } else {
      this.airT = 0;
      this.flipping = false;
    }
    this.qY.setFromAxisAngle(UP, this.yaw + Math.max(0, twirl));
    this.tiltG.quaternion.copy(this.qF).multiply(this.qT).multiply(this.qY);
    // Lowest corner of the scaled, rotated model box on the grass.
    const sc = this.bodyG.scale, b = this.bounds;
    let minY = Infinity;
    for (let i = 0; i < 8; i++) {
      this.corner.set((i & 1 ? b.max.x : b.min.x) * sc.x, (i & 2 ? b.max.y : b.min.y) * sc.y, (i & 4 ? b.max.z : b.min.z) * sc.z).applyQuaternion(this.tiltG.quaternion);
      if (this.corner.y < minY) minY = this.corner.y;
    }
    const hop = p.state === 'celebrate' ? Math.abs(Math.sin(time * 8 + p.id)) * 0.6 : sp > 1 && p.state === 'play' ? Math.abs(Math.sin(time * 12 + p.id)) * 0.08 : 0;
    this.root.position.set(p.p.x, p.y + hop - minY, p.p.z);

    // Tints: frozen blue, flash white.
    this.flash = Math.max(0, this.flash - dt * 5);
    const frozen = p.state === 'freeze';
    if (this.inst) {
      this.inst.materials.forEach((m, i) => {
        m.emissive.setRGB(this.flash + (frozen ? 0.05 : 0), this.flash + (frozen ? 0.25 : 0), this.flash + (frozen ? 0.45 : 0) + (highlight ? 0.08 : 0));
        m.opacity = p.ghostT > 0 ? 0.35 : 1;
        const base = this.baseColors[i];
        if (base) m.color.copy(base).multiplyScalar(p.state === 'down' ? 0.8 : 1);
      });
    }
    this.ring.position.set(p.p.x, 0.02, p.p.z);
    this.ring.scale.setScalar(p.attr.radius / 0.55 + (highlight ? 0.15 * Math.sin(time * 10) : 0));
    this.shadow.position.set(p.p.x, 0.012, p.p.z);
    this.shadow.scale.setScalar(p.attr.radius * 3 * (1 - Math.min(0.5, p.y / 6)));
    this.marker.position.set(p.p.x, p.y + this.height + 0.45 + Math.sin(time * 4 + p.id) * 0.06, p.p.z);
    this.marker.visible = p.state !== 'down';
    this.shield.visible = p.wallT > 0;
    if (this.shield.visible) {
      this.shield.position.set(p.p.x, this.height * 0.55, p.p.z);
      this.shield.scale.setScalar(this.height * 0.85 * (1 + Math.sin(time * 10) * 0.03));
    }
  }

  dispose(): void {
    this.inst?.dispose();
    this.root.removeFromParent();
    for (const o of [this.ring, this.shadow, this.shield, this.marker]) {
      o.removeFromParent();
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
}
