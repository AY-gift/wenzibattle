/**
 * Exports the audio manifest as Audio Batch Studio requirement files plus Chinese overviews:
 * docs/audio/audio_requirements.json + README.md (first batch) and
 * docs/audio/v2/audio_requirements_v2.json + README.md (sounds added with the V2 vocabulary pack).
 * Runs the checklist from AUDIO_REQUIREMENT_FORMAT.md and fails on any violation.
 * Run:  npm run docs:audio
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { AUDIO } = await server.ssrLoadModule('/src/ui/audioManifest.ts');
await server.close();

// ---- checklist (AUDIO_REQUIREMENT_FORMAT.md, 给 agent 的检查清单) ----
const problems = [];
const names = new Set();
const ids = new Set();
for (const a of AUDIO) {
  if (!a.prompt || !a.prompt.trim()) problems.push(`${a.id}: empty prompt`);
  if (!a.id) problems.push(`entry without id`);
  if (ids.has(a.id)) problems.push(`${a.id}: duplicate id`);
  ids.add(a.id);
  if (!/^[^<>:"/\\|?*\s]+\.wav$/.test(a.filename)) problems.push(`${a.id}: bad filename ${a.filename}`);
  if (names.has(a.filename)) problems.push(`${a.id}: duplicate filename ${a.filename}`);
  names.add(a.filename);
  if (!['SFX', 'Ambience', 'BGM'].includes(a.category)) problems.push(`${a.id}: bad category ${a.category}`);
  if (!(a.duration >= 1 && a.duration <= 120)) problems.push(`${a.id}: duration ${a.duration} outside 1.0–120.0`);
  if (/\b(loop|seamless|variation|variations)\b|\bat \d/i.test(a.prompt)) problems.push(`${a.id}: prompt asks for loops/variations/timeline`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

function writeBatch(list, dir, jsonName, title, intro) {
  const doc = {
    project: 'Glyph Rumble 3D 字形乱斗',
    requirements: list.map((a) => ({
      id: a.id,
      filename: a.filename,
      name: a.name,
      category: a.category,
      prompt: a.prompt,
      negative_prompt: '',
      duration: a.duration,
      seed: -1,
      notes: a.notes,
    })),
  };
  const out = join(root, ...dir);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, jsonName), JSON.stringify(doc, null, 2) + '\n', 'utf8');
  const count = (c) => list.filter((a) => a.category === c).length;
  const md = [
    `# ${title}`,
    '',
    '> 由 `npm run docs:audio` 从 `src/ui/audioManifest.ts` 自动生成，请勿手动修改。',
    '',
    ...intro,
    `共 ${list.length} 条：SFX ${count('SFX')} · Ambience ${count('Ambience')} · BGM ${count('BGM')}。`,
    '',
    '## 怎么用',
    '',
    `1. 在 **Audio Batch Studio** 里 \`Import JSON\`（或 \`Ctrl+O\`），选择同目录的 [\`${jsonName}\`](./${jsonName})。`,
    '2. 生成、修剪、导出后，把 `.wav` 文件原名放进项目的 `public/audio/` 文件夹。',
    '3. 运行 `npm run audio:index`（会更新 `public/audio/available.json`）。',
    '4. 刷新游戏：有文件的音效会自动替换内置的合成音效；没有文件的继续用合成音效（或不发声）。',
    '',
    '格式已按 `AUDIO_REQUIREMENT_FORMAT.md` 的检查清单自检：每条都有 prompt、id、`.wav` 文件名（无重名、无非法字符），category 只用 SFX / Ambience / BGM，时长 1.0–120.0 秒，prompt 不要求循环、变体或时间轴编排（循环播放由游戏代码完成）。',
    '',
    '## 清单',
    '',
    '| id | 文件名 | 名称 | 类型 | 时长 (s) | 触发时机 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...list.map((a) => `| \`${a.id}\` | ${a.filename} | ${a.name} | ${a.category} | ${a.duration.toFixed(1)} | ${a.notes.replace(/\|/g, '\\|')} |`),
    '',
  ];
  writeFileSync(join(out, 'README.md'), md.join('\n'), 'utf8');
  console.log(`${[...dir, jsonName].join('/')}  (${list.length} requirements, checklist passed)`);
}

const first = AUDIO.filter((a) => !a.batch);
const v2 = AUDIO.filter((a) => a.batch === 'v2');
writeBatch(first, ['docs', 'audio'], 'audio_requirements.json', '《字形乱斗 3D》音效需求', []);
writeBatch(v2, ['docs', 'audio', 'v2'], 'audio_requirements_v2.json', '《字形乱斗 3D》音效需求 V2（新增）', [
  '这是随「高频输入扩展包 V2」新增的音效，只包含新条目；第一批需求见 [../README.md](../README.md)。',
  '',
  '这些音效是技能专属的：技能开始时在通用的必杀技提示音之上额外播放；没有文件时只是不播放，不影响游戏。`book_page_flip` 用于解说员「舌」朗读古典名著的桥段。',
  '',
]);
