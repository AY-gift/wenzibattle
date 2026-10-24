/**
 * In-browser self test: builds every required input with the real canvas + font pipeline,
 * checks that each yields a visible 3D model, runs a headless round-robin with the real
 * stats, and measures generation and render timings. Open /selftest.html.
 */
import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import * as THREE from 'three';
import { BattleSimulator } from './core/battle/BattleSimulator';
import { buildFighter, type FighterBundle } from '@shared/render/FighterFactory';

const REQUIRED = ['火', '水', '田', '川', '龍', 'A', 'Z', 'あ', 'ア', '★', '♥', '∞', '😀', '💀', '🍣', 'ಠ_ಠ', '(・ω・)', '(>_<)'];
const EXTRA = ['飛', '飞', '龙', '屁', '王', '¯\\_(ツ)_/¯', '👨‍👩‍👧', '🇯🇵', '1️⃣', 'é', 'é', '·', '﷽', '​', '   ', 'Hello', '寿司🍣', 'ʕ•ᴥ•ʔ'];

const $ = (id: string) => document.getElementById(id)!;
const report: Record<string, unknown> = {};

function cell(tr: HTMLTableRowElement, v: string | number, cls = ''): void {
  const td = document.createElement('td');
  td.textContent = String(v);
  if (cls) td.className = cls;
  tr.appendChild(td);
}

async function main(): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  const bundles: FighterBundle[] = [];
  const table = document.createElement('table');
  const head = table.insertRow();
  for (const h of ['input', 'kind', 'mode', 'model', 'tris', 'w×h', 'ms', 'wt', 'spd', 'atk', 'def', 'stb', 'luck', 'tags', 'warnings', 'visible']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  }
  let failures = 0;
  for (const text of [...REQUIRED, ...EXTRA]) {
    const tr = table.insertRow();
    const res = await buildFighter(text);
    cell(tr, JSON.stringify(text), 'l');
    if (!res.ok) {
      cell(tr, `rejected: ${res.reason}`);
      const required = REQUIRED.includes(text);
      if (required) failures++;
      rows.push({ text, rejected: res.reason });
      tr.className = required ? 'bad' : '';
      continue;
    }
    const b = res.bundle;
    const s = b.spec.stats;
    const visible = b.template.triangles > 0 && b.template.width > 0.1 && b.template.height > 0.1;
    if (!visible && REQUIRED.includes(text)) failures++;
    [b.input.kind, b.raster.mode, b.template.method, b.template.triangles, `${b.template.width.toFixed(2)}×${b.template.height.toFixed(2)}`, b.buildMs.toFixed(0), s.weight, s.speed, s.attack, s.defense, s.stability, s.luck, b.spec.tags.join(','), b.warnings.map((w) => w.key).join(','), visible ? 'yes' : 'NO'].forEach((v) => cell(tr, v));
    if (!visible) tr.className = 'bad';
    rows.push({ text, kind: b.input.kind, mode: b.raster.mode, method: b.template.method, tris: b.template.triangles, ms: Math.round(b.buildMs), stats: s, mass: +b.spec.mass.toFixed(2), radius: +b.spec.radius.toFixed(2), tags: b.spec.tags, warnings: b.warnings.map((w) => w.key), visible });
    if (REQUIRED.includes(text)) bundles.push(b);
  }
  $('fighters').appendChild(table);
  report.fighters = rows;

  // Determinism: rebuilding the same input returns identical stats.
  const again = await buildFighter('火');
  report.deterministic = again.ok && JSON.stringify(again.bundle.spec.stats) === JSON.stringify(bundles[0].spec.stats);

  // Round-robin.
  const wins = new Map<string, number>(), games = new Map<string, number>();
  const tally = { ko: 0, ringout: 0, timeup: 0, draw: 0 };
  let n = 0, timeSum = 0;
  const t0 = performance.now();
  for (let i = 0; i < bundles.length; i++) {
    for (let j = 0; j < bundles.length; j++) {
      if (i === j) continue;
      for (let s = 0; s < 2; s++) {
        const r = new BattleSimulator([bundles[i].spec, bundles[j].spec], i * 1000 + j * 10 + s).runToEnd();
        n++;
        tally[r.reason]++;
        timeSum += r.time;
        for (const k of [0, 1] as const) {
          const name = (k === 0 ? bundles[i] : bundles[j]).spec.name;
          games.set(name, (games.get(name) ?? 0) + 1);
          if (r.winner === k) wins.set(name, (wins.get(name) ?? 0) + 1);
        }
      }
    }
  }
  const simMs = performance.now() - t0;
  const rates = [...games.keys()].map((k) => ({ name: k, winRate: Math.round(((wins.get(k) ?? 0) / games.get(k)!) * 100) })).sort((a, b) => b.winRate - a.winRate);
  $('battles').textContent = `${n} battles in ${simMs.toFixed(0)} ms · outcomes ${JSON.stringify(tally)} · avg decided at ${(timeSum / n).toFixed(1)}s · win%: ${rates.map((r) => `${r.name} ${r.winRate}`).join(' / ')}`;
  report.battles = { n, simMs: Math.round(simMs), tally, avgTime: +(timeSum / n).toFixed(2), rates };

  // Render all required models in a grid and measure frame time.
  const canvas = $('view') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc7e6ff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffc9de, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(3, 6, 8);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(35, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  cam.position.set(0, 1.5, 21);
  cam.lookAt(0, 0, 0);
  const cols = 6;
  const groups: THREE.Group[] = [];
  bundles.forEach((b, i) => {
    const g = b.template.instantiate().group;
    g.position.set(((i % cols) - (cols - 1) / 2) * 3.1, (1 - Math.floor(i / cols)) * 2.8, 0);
    scene.add(g);
    groups.push(g);
  });
  // Timed synchronously (render + 1-pixel readback forces the GPU to finish), so the
  // numbers don't depend on requestAnimationFrame throttling.
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const timeFrames = (n: number, draw: (i: number) => void): { avg: number; p95: number } => {
    const ts: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      draw(i);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b);
    return { avg: ts.reduce((a, b) => a + b, 0) / n, p95: ts[Math.floor(n * 0.95)] };
  };
  const grid = timeFrames(120, (i) => {
    groups.forEach((g, k) => (g.rotation.y = Math.sin(i * 0.05 + k) * 0.7));
    renderer.render(scene, cam);
  });
  const tris = bundles.reduce((s, b) => s + b.template.triangles, 0);

  // Full game scene: arena + effects + a running battle, high and low quality.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px;opacity:0;pointer-events:none';
  document.body.appendChild(host);
  const { ArenaRenderer } = await import('./render/ArenaRenderer');
  const arena = new ArenaRenderer(host);
  arena.renderer.setAnimationLoop(null);
  const battle: Record<string, { avg: number; p95: number }> = {};
  for (const q of ['high', 'low'] as const) {
    arena.setQuality(q);
    arena.setFighter(0, bundles[4]);
    arena.setFighter(1, bundles[16]);
    arena.startBattle(new BattleSimulator([bundles[4].spec, bundles[16].spec], 99));
    const agl = arena.renderer.getContext();
    const ts: number[] = [];
    for (let i = 0; i < 360; i++) {
      const t0 = performance.now();
      arena.advance(1 / 60);
      agl.readPixels(0, 0, 1, 1, agl.RGBA, agl.UNSIGNED_BYTE, px);
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b);
    battle[q] = { avg: ts.reduce((a, b) => a + b, 0) / ts.length, p95: ts[Math.floor(ts.length * 0.95)] };
  }
  arena.renderer.dispose();
  host.remove();
  const f = (x: { avg: number; p95: number }) => `avg ${x.avg.toFixed(2)} ms · p95 ${x.p95.toFixed(2)} ms`;
  $('perf').textContent = `Model grid (18 models, ${tris} tris): ${f(grid)} | Battle scene 960×540 high: ${f(battle.high)} | low: ${f(battle.low)} | slowest glyph build ${Math.max(...bundles.map((b) => b.buildMs)).toFixed(0)} ms`;
  report.perf = { triangles: tris, grid, battleHigh: battle.high, battleLow: battle.low, maxBuildMs: Math.round(Math.max(...bundles.map((b) => b.buildMs))) };
  report.requiredFailures = failures;
  $('status').textContent = failures === 0 ? `PASS — all ${REQUIRED.length} required inputs produced visible fighters` : `FAIL — ${failures} required inputs failed`;
  $('json').textContent = JSON.stringify(report, null, 1);
  (window as unknown as { __selftest: unknown }).__selftest = report;
}

void main().catch((e) => {
  $('status').textContent = 'ERROR: ' + (e as Error).message;
  console.error(e);
});
