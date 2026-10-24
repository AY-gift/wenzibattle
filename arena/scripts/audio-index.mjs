/**
 * Lists the generated clips in public/audio/ into public/audio/available.json so the game knows
 * which ones to load (missing ones fall back to synthesized sounds). A compressed .mp3 (made by
 * `npm run audio:compress` in the top folder) is listed instead of its .wav master.
 * Run after dropping new files in:  npm run audio:index
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
const all = readdirSync(dir).filter((f) => /\.(wav|mp3)$/i.test(f));
const mp3 = new Set(all.filter((f) => /\.mp3$/i.test(f)).map((f) => f.replace(/\.mp3$/i, '')));
const files = all.filter((f) => /\.mp3$/i.test(f) || !mp3.has(f.replace(/\.wav$/i, ''))).sort();
writeFileSync(join(dir, 'available.json'), JSON.stringify(files, null, 2) + '\n', 'utf8');
console.log(`public/audio/available.json: ${files.length} file(s), ${files.filter((f) => f.endsWith('.mp3')).length} mp3`);
