/**
 * Builds every game into one deployable site:
 *   dist/index.html      landing page (portal/) that links to the games
 *   dist/arena/          字形乱斗 3D (1v1)
 *   dist/soccer/         Glyph Soccer 4v4      (when the folder exists)
 *   dist/basketball/     Glyph Basketball 2v2  (when the folder exists)
 *
 * Env:
 *   SITE_URL=https://example.com/        public address of the site root (needed for OG images)
 *   SHARE_ENDPOINT=1                     result links go through /s/<game> (deploy/edge/share-og.ts)
 *   VITE_ANALYTICS_URL=https://…         optional analytics beacon
 * Run: npm run build
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const GAMES = ['arena', 'soccer', 'basketball'];
let site = (process.env.SITE_URL || '').trim();
if (site && !site.endsWith('/')) site += '/';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const built = [];
for (const game of GAMES) {
  const dir = join(root, game);
  if (!existsSync(join(dir, 'package.json'))) continue;
  const env = { ...process.env };
  if (site) env.VITE_SITE_URL = `${site}${game}/`;
  if (site && process.env.SHARE_ENDPOINT) env.VITE_SHARE_BASE = `${site}s/${game}`;
  console.log(`\n=== ${game} ===`);
  const run = (args) => {
    const cmd = ['npx', ...args.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a))].join(' ');
    const r = spawnSync(cmd, { cwd: dir, env, stdio: 'inherit', shell: true });
    if (r.status !== 0) process.exit(r.status ?? 1);
  };
  run(['tsc', '--noEmit']);
  run(['vite', 'build', '--outDir', join(out, game), '--emptyOutDir']);
  // Ship the compressed clips only: a .wav master is dropped when its .mp3 exists (npm run audio:compress).
  const audio = join(out, game, 'audio');
  if (existsSync(audio)) {
    const files = readdirSync(audio);
    for (const f of files) if (/\.wav$/i.test(f) && files.includes(f.replace(/\.wav$/i, '.mp3'))) rmSync(join(audio, f));
  }
  built.push(game);
}
// Landing page.
let html = readFileSync(join(root, 'portal', 'index.html'), 'utf8').replace(/%SITE_URL%/g, site);
// Games that were built light up; the others stay "coming soon" without a link.
for (const game of GAMES) {
  html = built.includes(game)
    ? html.replaceAll(`class="game soon" href="${game}/"`, `class="game" href="${game}/"`)
    : html.replaceAll(`class="game soon" href="${game}/"`, `class="game soon"`);
}
writeFileSync(join(out, 'index.html'), html);
cpSync(join(root, 'arena', 'public', 'og.png'), join(out, 'og.png'));
// Cloudflare Workers Static Assets: cache / security headers and the 404 page.
cpSync(join(root, 'deploy', '_headers'), join(out, '_headers'));
cpSync(join(root, 'portal', '404.html'), join(out, '404.html'));
// Static-asset host limits (Cloudflare Workers: 25 MiB per file, 20,000 files on the free plan).
const all = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : all.push(statSync(join(d, f)).size)));
walk(out);
const big = Math.max(...all), total = all.reduce((a, b) => a + b, 0);
if (big > 25 * 1024 * 1024 || all.length > 20000) {
  console.error(`dist/ breaks the host limits: biggest file ${(big / 1048576).toFixed(1)} MiB, ${all.length} files`);
  process.exit(1);
}
console.log(`dist/: ${all.length} files, ${(total / 1048576).toFixed(1)} MiB (biggest ${(big / 1048576).toFixed(1)} MiB)`);
console.log(`\nBuilt: ${built.join(', ')} → dist/ ${site ? `(site ${site})` : '(SITE_URL not set: OG tags are relative)'}`);
