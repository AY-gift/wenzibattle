/**
 * Exports the NEW sounds Glyph Basketball needs (entries with batch 'basketball' in
 * src/ui/audioManifest.ts) as an Audio Batch Studio requirement file:
 * docs/audio/audio_requirements.json + a Chinese overview docs/audio/README.md.
 * Sounds reused from the arena are not listed (they already exist).
 * Runs the AUDIO_REQUIREMENT_FORMAT.md checklist and fails on any violation.  Run: npm run docs:audio
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { AUDIO } = await server.ssrLoadModule('/src/ui/audioManifest.ts');
await server.close();
const reused = AUDIO.filter((a) => !a.batch).map((a) => a.id);
const PACKS = [{ batch: 'basketball', dir: join(root, 'docs', 'audio'), title: '# 《字形篮球 2v2》音效需求（新增）', what: '篮球新需要的' }];
for (const pack of PACKS) {
  const list = AUDIO.filter((a) => a.batch === pack.batch);

  const problems = [];
  const names = new Set();
  for (const a of list) {
    if (!a.prompt?.trim()) problems.push(`${a.id}: empty prompt`);
    if (!/^[^<>:"/\|?*\s]+\.wav$/.test(a.filename)) problems.push(`${a.id}: bad filename`);
    if (names.has(a.filename)) problems.push(`${a.id}: duplicate filename`);
    names.add(a.filename);
    if (!['SFX', 'Ambience', 'BGM'].includes(a.category)) problems.push(`${a.id}: bad category`);
    if (!(a.duration >= 1 && a.duration <= 120)) problems.push(`${a.id}: duration out of range`);
    if (/\b(loop|seamless|variation|variations)\b|\bat \d/i.test(a.prompt)) problems.push(`${a.id}: prompt asks for loops/variations/timeline`);
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  mkdirSync(pack.dir, { recursive: true });
  const doc = {
    project: 'Glyph Basketball 字形篮球',
    requirements: list.map((a) => ({ id: a.id, filename: a.filename, name: a.name, category: a.category, prompt: a.prompt, negative_prompt: '', duration: a.duration, seed: -1, notes: a.notes })),
  };
  writeFileSync(join(pack.dir, 'audio_requirements.json'), JSON.stringify(doc, null, 2) + '\n', 'utf8');
  const md = [
    pack.title,
    '',
    '> 由 `npm run docs:audio`（在 basketball/ 里）从 `src/ui/audioManifest.ts` 自动生成，请勿手动修改。',
    '',
    `只列出${pack.what} ${list.length} 条（擂台和足球已有的 ${reused.length} 个音效直接复用，已复制到 \`basketball/public/audio/\`）。`,
    '',
    '## 怎么用',
    '',
    '1. 在 **Audio Batch Studio** 里 `Import JSON`，选择同目录的 [`audio_requirements.json`](./audio_requirements.json)。',
    '2. 生成后把 `.wav` 原名放进 `basketball/public/audio/`。',
    '3. 在 basketball/ 里运行 `npm run audio:index`，刷新游戏即可。没有文件的继续用内置合成音。',
    '',
    '格式已按 `AUDIO_REQUIREMENT_FORMAT.md` 的检查清单自检。',
    '',
    '| id | 文件名 | 名称 | 类型 | 时长 (s) | 触发时机 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...list.map((a) => `| \`${a.id}\` | ${a.filename} | ${a.name} | ${a.category} | ${a.duration.toFixed(1)} | ${a.notes.replace(/\|/g, '\|')} |`),
    '',
    `复用的擂台音效：${reused.map((x) => `\`${x}\``).join('、')}`,
    '',
  ];
  writeFileSync(join(pack.dir, 'README.md'), md.join('\n'), 'utf8');
  console.log(`${pack.dir}  (${list.length} new requirements, checklist passed)`);
}
