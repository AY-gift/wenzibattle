/**
 * Compresses each game's generated .wav clips (public/audio/) to .mp3 next to them, so the public
 * site ships ~10× smaller audio. The .wav files stay on disk as the masters (they are not
 * committed, see .gitignore); the games load whichever exists (mp3 preferred, see audio-index).
 * Needs ffmpeg on PATH (run locally; Cloudflare's build machine just uses the committed .mp3).
 * Run: npm run audio:compress
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = ['arena', 'soccer', 'basketball'];
const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.error('ffmpeg not found on PATH');
  process.exit(1);
}
let made = 0, kept = 0, before = 0, after = 0;
for (const game of GAMES) {
  const dir = join(root, game, 'public', 'audio');
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.wav'))) {
    const src = join(dir, f), out = join(dir, f.replace(/\.wav$/i, '.mp3'));
    const size = statSync(src).size;
    before += size;
    if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
      kept++;
      after += statSync(out).size;
      continue;
    }
    // Music and ambience loops keep stereo at 128k; short effects 96k.
    const long = size > 1024 * 1024;
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-codec:a', 'libmp3lame', '-b:a', long ? '128k' : '96k', out], { encoding: 'utf8' });
    if (r.status !== 0) {
      console.error(`${game}/${f}: ${r.stderr}`);
      process.exit(1);
    }
    made++;
    after += statSync(out).size;
  }
}
const mb = (n) => (n / 1048576).toFixed(1);
console.log(`audio: ${made} converted, ${kept} up to date — wav ${mb(before)} MB → mp3 ${mb(after)} MB`);
