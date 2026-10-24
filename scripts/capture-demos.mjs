/**
 * Records the landing page's gameplay clips from the real games (portal/media/<game>.mp4 + .jpg poster).
 *
 * Headless Chrome plays the built site (dist/) under a virtual clock: performance.now, Date.now,
 * timers and requestAnimationFrame only move when this script steps them, one video frame at a
 * time, so the clips are perfectly smooth however slowly the software renderer draws.
 *
 *   npm run build
 *   node scripts/capture-demos.mjs capture [game…]   → .demo-frames/<game>/00000.jpg … (gitignored)
 *   node scripts/capture-demos.mjs encode  [game…]   → portal/media/<game>.mp4 / .jpg from the CUTS below
 *
 * Needs Chrome (or Edge) and ffmpeg on PATH. The matches are fixed lineups + seeds, so a re-run
 * records the same games (the cuts point at moments in them).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const framesRoot = join(root, '.demo-frames');
const media = join(root, 'portal', 'media');
const FPS = 30;
const SIZE = 960; // square: cropped to tall columns on desktop and wide bands on phones

/** What to record: a lineup link, the start button, how long. */
const DEMOS = {
  arena: { path: 'arena/?a=%E9%BE%8D&b=%E7%8C%AB&seed=4242&lang=zh&bo=1', start: '#btn-fight', seconds: 30 },
  soccer: { path: 'soccer/?mode=soccer&v=1&how=split&an=%E9%BE%99%E9%A3%9E%E5%87%A4%E8%88%9E&bh=split&bn=%E9%A3%8E%E5%B9%B3%E6%B5%AA%E9%9D%99&seed=3&lang=zh', start: '#btn-kickoff', seconds: 28 },
  basketball: { path: 'basketball/?mode=basketball&v=1&how=split&an=%E7%86%8A%E7%8C%AB&bh=split&bn=%E9%BE%99%E8%99%8E&seed=31&lang=zh', start: '#btn-kickoff', seconds: 30 },
};

/**
 * Seconds (in the recording) stitched into each clip, the poster frame, and a centre crop (share of
 * the frame kept) that brings the players closer.
 */
const CUTS = {
  arena: { parts: [[2, 16.5]], poster: 9, crop: 0.8 },
  soccer: { parts: [[10, 17], [23, 27.5]], poster: 15.3, crop: 0.72 },
  basketball: { parts: [[6, 10.2], [19.5, 24.5]], poster: 22.2, crop: 0.8 },
};

/** Page chrome hidden in the clips (menus, buttons, commentary); scoreboards and banners stay. */
const HIDE_CSS = `.topbar, .cam-hint, .game-switcher, .hud-buttons, .commentary, .credits, #toast, .pause-overlay { display: none !important; }`;

/** Virtual clock, installed before any page script runs. */
const SHIM = `(() => {
  let now = 0;
  const t0 = Date.now();
  const raf = new Map();
  let rid = 0, tid = 0, timers = [];
  performance.now = () => now;
  Date.now = () => t0 + now;
  window.requestAnimationFrame = (cb) => (raf.set(++rid, cb), rid);
  window.cancelAnimationFrame = (id) => raf.delete(id);
  window.setTimeout = (fn, ms = 0, ...a) => (timers.push({ id: ++tid, at: now + Math.max(0, +ms || 0), fn, a }), tid);
  window.setInterval = (fn, ms = 0, ...a) => (timers.push({ id: ++tid, at: now + Math.max(1, +ms || 0), iv: Math.max(1, +ms || 0), fn, a }), tid);
  window.clearTimeout = window.clearInterval = (id) => { timers = timers.filter((t) => t.id !== id); };
  window.__advance = (ms) => {
    const end = now + ms;
    for (let guard = 0; guard < 5000; guard++) {
      let next = null;
      for (const t of timers) if (t.at <= end && (!next || t.at < next.at)) next = t;
      if (!next) break;
      now = Math.max(now, next.at);
      if (next.iv) next.at += next.iv;
      else timers = timers.filter((t) => t !== next);
      try { if (typeof next.fn === 'function') next.fn(...next.a); } catch (e) { console.error(e); }
    }
    now = end;
    const cbs = [...raf.values()];
    raf.clear();
    for (const cb of cbs) try { cb(now); } catch (e) { console.error(e); }
  };
})();`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.mp4': 'video/mp4' };

function serve() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(dist, p));
      if (!file.startsWith(dist) || !existsSync(file)) return res.writeHead(404).end();
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function findChrome() {
  const c = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  const hit = c.find((x) => x && existsSync(x));
  if (!hit) throw new Error('Chrome/Edge not found (set CHROME=…)');
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpConnect(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)));
        let id = 0;
        const pending = new Map();
        ws.onmessage = (m) => {
          const d = JSON.parse(m.data);
          if (d.method === 'Runtime.exceptionThrown') console.warn('page error:', d.params.exceptionDetails.exception?.description?.split('\n')[0]);
          const p = d.id && pending.get(d.id);
          if (!p) return;
          pending.delete(d.id);
          d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
        };
        return {
          send: (method, params = {}) => new Promise((res, rej) => (pending.set(++id, { res, rej }), ws.send(JSON.stringify({ id, method, params })))),
          close: () => ws.close(),
        };
      }
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  throw new Error('could not reach Chrome');
}

async function capture(game, base) {
  const demo = DEMOS[game];
  const out = join(framesRoot, game);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const port = 9400 + Object.keys(DEMOS).indexOf(game);
  const profile = join(tmpdir(), `glyph-demo-${game}`);
  const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', `--window-size=${SIZE},${SIZE}`, 'about:blank'], { stdio: 'ignore' });
  try {
    const cdp = await cdpConnect(port);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: SIZE, height: SIZE, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
    await cdp.send('Page.navigate', { url: base + demo.path });
    const ev = (expression) => cdp.send('Runtime.evaluate', { expression, awaitPromise: false, returnByValue: true }).then((r) => r.result?.value);
    // Let it load (fonts, glyph models, audio index) with the clock creeping along.
    for (let i = 0; i < 150; i++) {
      await sleep(40);
      if (await ev('typeof __advance === "function"')) await ev('__advance(33)');
    }
    await ev(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(HIDE_CSS)}; document.head.append(s); })()`);
    const ok = await ev(`(() => { const b = document.querySelector(${JSON.stringify(demo.start)}); if (!b) return false; b.click(); return true; })()`);
    if (!ok) throw new Error(`${game}: start button not found`);
    const n = demo.seconds * FPS;
    for (let i = 0; i < n; i++) {
      await ev(`__advance(${1000 / FPS})`);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, optimizeForSpeed: true });
      writeFileSync(join(out, `${String(i).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
      if (i % (FPS * 5) === 0) process.stdout.write(`  ${game} ${(i / FPS).toFixed(0)}s\n`);
    }
    cdp.close();
  } finally {
    chrome.kill();
  }
  console.log(`${game}: ${demo.seconds * FPS} frames → ${out}`);
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
}

function encode(game) {
  const cut = CUTS[game];
  const src = join(framesRoot, game, '%05d.jpg');
  mkdirSync(media, { recursive: true });
  const crop = `crop=iw*${cut.crop}:ih*${cut.crop},scale=720:720:flags=lanczos`;
  const parts = cut.parts.map(([a, b], i) => `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[p${i}]`);
  const join_ = `${cut.parts.map((_, i) => `[p${i}]`).join('')}concat=n=${cut.parts.length}:v=1:a=0,${crop},format=yuv420p[v]`;
  ffmpeg(['-framerate', String(FPS), '-i', src, '-filter_complex', `${parts.join(';')};${join_}`, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', '-an', join(media, `${game}.mp4`)]);
  ffmpeg(['-framerate', String(FPS), '-start_number', String(Math.round(cut.poster * FPS)), '-i', src, '-frames:v', '1', '-vf', crop, '-q:v', '4', join(media, `${game}.jpg`)]);
  console.log(`${game}: portal/media/${game}.mp4`);
}

const [cmd, ...only] = process.argv.slice(2);
const games = only.length ? only : Object.keys(DEMOS);
if (cmd === 'capture') {
  if (!existsSync(join(dist, 'index.html'))) throw new Error('build first: npm run build');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  for (const g of games) await capture(g, base);
  server.close();
} else if (cmd === 'encode') {
  for (const g of games) encode(g);
} else {
  console.log('usage: node scripts/capture-demos.mjs capture|encode [arena soccer basketball]');
}
