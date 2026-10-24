# 字形乱闘 3D / 字形乱斗 3D / Glyph Rumble 3D

Type any two characters — kanji, kana, letters, symbols, an emoji or a kaomoji — and they become chunky 3D toys that fight on their own in a slightly ridiculous boxing ring. A crowd of random glyphs cheers from the stands with speech bubbles, two glyph commentators talk nonsense over the match, and every fighter has a signature move (必杀技). A match lasts about 10–15 seconds; you only watch (drag to orbit the camera), then save or share the result.

Stack: TypeScript, Vite, Three.js, Canvas 2D. There is no server, no account and no LLM. Everything runs in the browser.

## Quick start

This game is one folder of the Glyph Rumble family (see the [root README](../README.md)). The character system it uses (input → glyph analysis → stats, personality, signature moves, 3D glyph models, sharing) lives in [`../shared/`](../shared/) so Soccer and Basketball use exactly the same characters.

**Windows, easiest:** install Node.js LTS once, then double-click **`start-game.bat`** in the top folder. It installs dependencies on first run and opens Chrome at http://localhost:5173. See [docs/如何在Chrome上测试.md](docs/如何在Chrome上测试.md) (Chinese) for why a local server is needed, phone testing, and stutter tips.

```bash
# in the top folder (npm workspaces)
npm install
npm run dev        # Arena at http://localhost:5173
npm test           # shared + arena tests (vitest)
npm run build      # all games → ../dist/ (arena in dist/arena/)
# or only this game, inside arena/
npm run dev | npm test | npm run build   # build → arena/dist/
```

The build is a static site with relative paths, so any static host works (GitHub Pages, Netlify, Cloudflare Pages, S3 and so on). See [../deploy/README.md](../deploy/README.md) for SITE_URL, OG images and the optional per-match share endpoint.

Useful URLs:

| URL | What it does |
| --- | --- |
| `/?mode=arena&v=1&a=火&b=水` | **Challenge link.** Pre-fills both fighters for a new match. |
| `/?mode=arena&v=1&a=火&b=水&seed=123&r=1.0.ko.79.62.0` | **Result link.** Shows the shared match's real result as a report card, with "watch replay" (same seed) and "challenge with my own text". |
| `/?a=火&b=水&seed=123&lang=zh` | Old link format; still works (fighters + seed). |
| `/?skit` | Forces the commentators' novel-reading bit. |
| `/selftest.html` | In-browser self test. It builds the required inputs with the real font and canvas pipeline, checks that each is visible, runs a 600-match round-robin with the real stats, and benchmarks rendering. |
| `/?fps` | Shows a frame-rate / quality meter in the top bar. |
| `/?debug` | Exposes `window.__glyph` (`app`, `arena`). `arena.advance(seconds)` fast-forwards the renderer, which is useful in headless or background tabs. |

## How to play

1. Type something into Fighter A and Fighter B. The 🎲 buttons and the example chips fill them for you. A 3D preview and the generated stats appear right away.
2. Press **開戦！ / FIGHT!**. Both glyphs drop into the arena and fight automatically. You can drag to orbit, use the wheel or pinch to zoom, and double-tap to reset the camera.
3. The result card shows the winner, how the match was won (KO, ring-out or decision), and 2–4 funny report lines. From there you can rematch, change fighters, start a random match, save a PNG, or open the **share panel** (see Sharing below).

The UI defaults to Japanese, with 中文 and English available from the top-right menu. You can type any language into the fighter boxes regardless of the UI language.

## Architecture

```
../shared/src/               ← used by every Glyph game (imported as @shared/…)
  core/InputProcessor.ts     grapheme segmentation, NFC, sanitising, kind detection
  core/glyph/*.ts            masks, distance transform, contours, shape features
  core/StatGenerator.ts      features (+ meaning modifiers) → stats, personality, physical size
  core/BehaviorResolver.ts   rules table: meaning → behaviour tags, element, small stat modifiers
  core/SignatureMoves.ts     必杀技 table (characters / words / slang → move kind + localised name)
  core/rng.ts                stable hash (cyrb53) + seeded PRNG (mulberry32)
  render/GlyphRenderer.ts    Canvas 2D rendering, bundled font, Twemoji, tofu detection
  render/Glyph3DFactory.ts   extrusion / plate / sticker / slab fallback, GPU resource lifetime
  render/FighterFactory.ts   input → bundle (raster, features, spec, 3D template), LRU cache
  render/Effects.ts          batched particles and comic pop-up words
  share/                     links, SNS intents, Web Share, report PNG, share panel, analytics
  i18n/                      language state (shared across games) + character descriptions
  ui/GameSwitcher.ts         Arena / Soccer / Basketball bar at the top
arena/src/                   ← this game
  core/battle/FighterController.ts   per-fighter AI state machine
  core/battle/BattleSimulator.ts     fixed-step physics, ring ropes, hits, specials, signature moves, win rules
  core/report.ts             picks the funniest / decisive moments for the result card
  render/ArenaRenderer.ts    scene, lights, camera director, fighter animation, event & signature-move FX
  render/BoxingStage.ts      boxing ring, ropes, stands full of glyph spectators, signs, commentary desk
  ui/                        screens, arena UI text (ja/zh/en), commentary, SFX + audio manifest, styles
  selftest.ts                browser self test (selftest.html)
arena/tests/                 battle, report and signature-move suites (character tests are in ../shared/tests/)
```

The simulator never reads from the renderer, and the visual model is kept separate from collision. The simulator treats each fighter as a vertical cylinder in XZ, with a spring-loaded tilt that can tip it over, plus ballistic flight. The renderer reads the simulation state every frame and adds squash-and-stretch, shaking, sinking and other effects on top. This split makes matches deterministic and testable headless, and it lets future modes (sumo, racing, soccer and so on) reuse `core/` and `render/`.

## Text → 3D (hybrid pipeline)

Every input is first drawn with Canvas 2D. The bundled rounded font is **M PLUS Rounded 1c 800**; its unicode-range slices load only for the characters you use. The browser falls back to system fonts per character for anything the font lacks, such as some simplified-only Chinese characters or Kannada `ಠ`. The drawing becomes a coverage mask, and the mode is picked from the input type:

| Input | Mode | 3D result |
| --- | --- | --- |
| One text grapheme (火, A, あ, ★, ∞ …) | `text` | Contours are traced with marching squares at sub-pixel precision, holes are nested, and the shape is extruded with a bevel. It is real geometry with front, sides and back. Stroke weight adapts to complexity: simple glyphs are thickened slightly (chunky and cute), while intricate ones such as 龍, 鬱 or 變 are drawn thinner (weight 500, no thickening, higher resolution) so the gaps between strokes survive. The bevel grows inward, so neighbouring strokes never fuse. |
| Kaomoji / words ((・ω・), ಠ_ಠ, Hello …) | `plate` | The text is extruded on top of a puffy backing plate made by morphological closing, so the whole string is one solid character and floating dots stay attached. |
| Anything containing emoji | `sticker` | Colour artwork goes on the front and back faces of a thick die-cut silhouette with a white rim, like an acrylic keychain. Colours are preserved. |
| Nothing visible could be drawn | `box` | A "?" tile, plus a notice. A fighter never ends up invisible or without collision. |

If extrusion throws or produces degenerate geometry, a textured rounded tile (`slab`) is used instead.

**Emoji consistency:** emoji-only inputs load **Twemoji 15.1** SVGs (CC-BY 4.0) from jsDelivr, so they look the same on every OS. If the CDN is unreachable or the emoji is newer than 15.1, the native emoji font is used and a notice is shown. To self-host, copy `assets/svg` from `jdecked/twemoji` into `public/twemoji/` and change `TWEMOJI_BASE` in `GlyphRenderer.ts`.

**Limits:** canvases are at most about 300 px, contours are capped at 800–1100 vertices (the simplification tolerance adapts), and textures are at most about 300 px. Models are fitted to at most 2.7 × 2.1 world units and at least 0.6. Built fighters are cached by text (LRU of 16), and geometry and textures are disposed when they are evicted and no longer shown.

## How stats are generated

Shape features are measured on the ink mask (`GlyphAnalyzer`) at arena scale:

- **area** (world units²) → **weight / mass**. Bigger ink means heavier, which resists knockback but is slower.
- **aspect ratio, base width, how low the centre of mass is, left/right symmetry** → **stability** (topple angle, recovery time, knockback resistance).
- **mass (inverse), stroke thinness, tallness, separate islands** → **speed**.
- **spikiness** (isoperimetric ratio), **off-centre mass, top-heaviness, mass** → **attack**.
- **fill ratio, enclosed holes** (田 has 4), **stroke thickness** → **defense**.
- **asymmetry, separate islands, plus a stable hash** → **luck** (crit chance, lucky dodges, tie-breaks).

Each raw signal is standardised against a 40-glyph reference set (`STAT_BASELINE` / `STAT_SPREAD`). Speed, attack, defense and stability then share a fixed budget with a mean of about 50. A longer, wider or more complex input changes a fighter's profile, but it cannot make the fighter stronger overall. Weight is a physical trait, not part of the budget.

**Meaning** comes from `BehaviorResolver`, a single rules table with about 35 rules. It covers simplified, traditional and Japanese forms, kana, English words and emoji. A rule adds behaviour tags (at most 3), an element, and small stat offsets; repeated matches have diminishing effect. Examples:

| Input | Behaviour |
| --- | --- |
| 火 / 🔥 | Breathes short-range fire. Steam if the target is water or ice. |
| 水 | Slippery: slides further. |
| 飛 / 飞 | Hops, hovers and dive-stomps. |
| 急 | Dashes often and overshoots. |
| 眠 | Naps. A sleeping fighter can dodge by rolling over, and the attacker trips. Waking it up makes it furious. |
| 逃 | Runs away; when cornered, makes a panic charge. |
| 怒 / ಠ | Aggressive and shaky. |
| 💀 | Skull burst when hit, and plays dead once. |
| 🍣 / 🍌 | Randomly slips. |
| ♥ | Charms the opponent. |
| ？ | Chaotic decisions. |
| 屁 | Mystery gas that blows the opponent away. |
| 王 | Taunts. |
| 猫 | Pounces. |
| 💣 | Self-destructs when low on HP. |
| 👻 | Phases behind the opponent. |

Text that matches no rule still fights normally, using shape only.

The same text, font and generator version always give the same stats: `seed = hash(text | fontKey | v1)`. Each battle has its own seed, so a rematch plays out differently, and the share link reproduces it exactly.

## Battle rules

- **The ring:** a square boxing ring (10 × 10 world units) with three elastic ropes on each side. A fighter that hits the ropes stretches them; if it was charging, it **slingshots back** across the ring as an attack. Hit hard enough, or while airborne, it **goes over the top rope** and lands on the arena floor, which counts as a ring-out. Corner posts are rigid and hurt.
- 15 seconds, 100 HP each. A match ends on **KO** (HP 0), **ring-out**, or a **decision** at time-up (HP, minus a penalty for lying down or leaning on the ropes; luck breaks near-ties). A simultaneous double KO or double ring-out is a draw.
- Anti-stalling: aggression ramps up after 5 s, nobody retreats after 11 s, and at 10 s **sudden death** loosens the ropes (they sag lower and get softer). A match is hard-capped at about 19 s of simulation, including the intro and epilogue.
- The comedy comes from rules, not canned animations. Dashes are committed and can overshoot into the ropes or a corner post. Hits add tilt, and a fighter topples when tilt passes its stability angle. Two fighters pushing each other build pressure until they pop apart. Lying fighters trip attackers. Small fighters can launch big ones.

## Signature moves (必杀技)

The full, per-language list of every character, word and slang term with its move and passive traits is generated from the code into [../shared/docs/skills/](../shared/docs/skills/README.md): `中文/`, `日本語/`, `English/` and `其他/` (emoji & symbols). Regenerate it after editing the tables with `npm run docs:skills` (top folder).

Each folder starts with a row-by-row status of the design list (`shared/scripts/skill-ideas.mjs`):
- ✅ implemented & tested
- 🟡 approximated by reusing an existing action (the doc says what differs)
- ⏸ candidate whose text kept its existing move
- 🔧 needs a new engine effect

The generator fails if a row marked implemented doesn't actually resolve to that move, so the docs can't over-claim.

Batch 2 adds 16 mechanics (37 move kinds in total), mostly built from existing actions:
- **sweep:** 一 stretches into a bar.
- **giantFall:** 大 grows, then topples onto the opponent.
- **swallow:** 口 eats the opponent and spits it out.
- **mountain:** 山 / 石 / ! leap, grow and slam.
- **fireCharge:** 火 burns, charges and ends up sooty.
- **laughQuake:** 笑 / LOL.
- **lazy:** 懒 / AFK / 躺赢 lie down and reflect hits.
- **feint:** 逃 / 咕咕咕 bait a charge.
- **fishSlap:** 摸鱼, with a 🐟 prop.
- **blame:** 甩锅 reflects 60% of the next hit, with a 🍳 prop.
- **drop:** ⌨️ / GG / 🔨 / 🥞 / ┻━┻ … glyph props that fall or are thrown.
- **vanish:** 404 / 小 / 🫠.
- **topple:** 🗿 / 木.
- **random:** ? / 随便 / それな.
- **glare:** ಠ_ಠ freezes the opponent.
- **rage:** 急 / 迟到 / EZ charge three times in a row (怒 keeps its existing move).

Props are built with the same glyph pipeline as the fighters, pooled, and pre-compiled at load.

### Daily vocabulary pack

The design source is kept unchanged in [../shared/docs/design/daily-vocab/](../shared/docs/design/daily-vocab/). Every **priority S** row is implemented: 40 Chinese, 11 Japanese, 13 English and 7 emoji/kaomoji rows. The docs generator fails if an S row has no move. Examples:

- 妈 → 快把外套穿上！ (a 🧥 falls on the opponent and freezes them).
- 妈妈 → 吃饭啦！ (pulls the opponent in holding a 🍚).
- 爸 → 我数到三！ (counts 1-2-3, then roars).
- 爸爸 → 遥控器在哪？ (a 📺 falls).
- 一家人 → 全家出动！ (three mini copies swarm the opponent).
- 晚安 → 一键关灯 (the arena goes dark and the opponent is confused).
- 手机 → 低电量警告; 洗衣机 → 脱水模式; 周一 → 三个闹钟.
- お母さん, mom, 👩‍👧, (T_T), orz, and more.

Rows can also give an everyday fighting style through passive traits; for example, 胖 is heavy and 咖啡 is hasty and angry.

Matching rules:
- The longest word still wins: 妈妈 beats 妈 and 一家人 beats 一.
- English keys need word boundaries: mom doesn't match momentum.
- Where the pack collides with an existing move, the old move is kept: 加油, 吃, 跑, 跳, 💤 and every slang entry (尼玛 is unchanged).
- 包子 is excluded as politically sensitive.

A / B rows stay listed as candidates in the docs.

### High-frequency inputs pack V2

The design source is kept unchanged in [../shared/docs/design/daily-vocab-v2/](../shared/docs/design/daily-vocab-v2/): 219 rows across Chinese, Japanese, English and emoji/kaomoji/number inputs.

- **187 rows are implemented**: 107 Chinese, 29 Japanese, 25 English and 26 others. They reuse existing actions with new props and opts. Examples:
  - 我 → 主角光环.
  - 你 → 就是你！ (a 👉 flies at the opponent before the charge).
  - 穷 → 余额不足.
  - 老板 / 社長 / boss → 现在开会 (a ┳━┳ meeting table lands on the opponent).
  - 考试 → 突击小测 (A B C D blocks fall).
  - 加载中 / loading → 99% 卡住.
  - 鸭 / 🦆 → 嘎嘎大游行 (mini copies).
  - ガチャ → a random move.
  - ┬─┬ノ( º _ ºノ) → PUT IT BACK.
  - 黑 → 全场黑屏: any move can now dim the arena with `opts.darkness`.
- **32 rows already had a move and keep it**, including 爱, 钱, 王, 手, 牛, 寿司, 加班, LOVE, MONEY, CAT, 💀 and 👀.
- Matching works as before: the longest word wins (分手 beats 手, 已读不回 beats 回, 我爱你 beats 我), and Latin keys need word boundaries (boss ≠ bossy). Uppercase `W` (VICTORY EARLY) is separate from lowercase `w` (laughing).
- Moves can name a move-specific sound with `opts.sfx`, for example a payment-declined beep, a school bell or quacking. It plays on top of the normal signature cue. The 19 new sounds are listed in their own requirement file (see Audio).

The design README also mentions Soccer and Basketball modes; this project only has the boxing-ring Arena, so those parts don't apply.

Besides single characters, the table covers internet slang and memes, such as 尼玛 → 国粹输出, 煞笔/傻逼 → 降智打击, 草泥马 → 草泥马奔腾, 牛逼 → 巨大化, 躺平 → 躺平防御, 内卷 → 内卷漩涡, バカ → おバカ伝染, うっせぇ → うっせぇわ, bruh → Bruh Moment, yeet → YEET and 🤡 → Clown Show. Matching takes the earliest hit and, at the same position, the longest word (牛逼 beats 牛). Latin words only match whole words.

Every fighter has exactly one signature move, used at most twice per match. The AI fires it when in range and when its 5.5 s cooldown is ready. Firing triggers a short slow-motion, the move's name in big letters above the fighter, and a dedicated commentary line. Moves come from a single table (`shared/src/core/SignatureMoves.ts`). Matches are by meaning, in reading order, across simplified, traditional and Japanese forms plus emoji and a few English words. Text with no match gets a move picked from its strongest stat, so even `Q` or a kaomoji has one.

| Kind | Mechanic | Example characters → move name (zh) |
| --- | --- | --- |
| barrage | rapid multi-hit rush with a finisher | 拳 打 手 武 → 百裂拳 · 猫 → 喵喵连环爪 |
| uppercut | launches the opponent into the air | 龍 龙 竜 升 → 升龙拳 · 上 天 → 冲天上勾拳 |
| quake | jump and slam; shockwave knocks the opponent down | 山 岩 土 重 → 天崩地裂 · 象 熊 → 泰山压顶 · 爆 💣 → 爆裂冲击波 |
| beam | long-range light beam | 光 日 炮 → 光子炮 · 目 眼 ಠ → 死亡凝视 · 雷 電 → 雷霆万钧 |
| whirlwind | spinning multi-hit that pulls the opponent in | 風 回 旋 ∞ → 龙卷风摧毁停车场 · 水 海 → 水龙卷 · 🍣 → 回转寿司 |
| charge | huge armoured tackle | 牛 猪 車 馬 突 → 野蛮冲撞 |
| giant | grows 1.45× for 4.5 s: bigger, heavier, hits harder | 巨 大 王 帝 👑 → 巨大化 |
| freeze | freezes the opponent solid for 1.7 s | 氷 冰 雪 冬 冷 → 绝对零度 |
| heal | recovers 18 HP | 药 医 治 → 痛痛飞走吧 · 心 命 茶 → 喝口茶歇歇 |
| meteor | four meteors rain down on the opponent | 火 炎 → 流星火雨 · 星 ★ → 流星雨 · 雨 → 冰雹暴雨 |
| kick | flying kick across the ring | 足 脚 踢 走 → 无影脚 · 飛 鳥 → 俯冲飞踢 · 🍌 → 香蕉滑铲 |
| throw | grab and shoulder throw behind itself | 投 摔 柔 力 → 过肩摔 |
| shield | 1.6 s barrier that bounces attacks back | 盾 守 門 壁 鉄 田 → 铁壁防御 |
| roar | cone shout that pushes and stuns | 吼 叫 声 怒 虎 → 狮子吼 |
| magnet | pulls the opponent in, then a big hit | 吸 引 磁 愛 ♥ → 爱的万有引力 |
| poison | poison cloud: damage over 4 s | 毒 菌 屁 💩 → 生化毒气 · 💀 死 → 死亡吐息 |
| bribe | throws money; the opponent stops to pick it up | 金 钱 円 $ 💰 → 金钱攻势 |
| lecture | puts the opponent to sleep | 书 書 学 文 字 → 知识的力量 · 眠 夢 → 催眠曲 · 鬼 👻 → 鬼压床 |
| chomp | big bite that also heals 5 HP | 口 吃 食 牙 犬 🦈 → 血盆大口 |
| joke | a pun so bad the opponent laughs and falls over | 笑 😂 w 草 → 冷笑话攻击 |
| confuse | the opponent stumbles around punching air for 2.2 s | 煞笔 傻逼 笨蛋 → 降智打击 · 社死 离谱 → 社死现场 · バカ · noob · 🤡 |

## Sharing

The result screen's **Share** button opens a share panel. It is built for desktop and mobile browsers and needs no account.

- **Preview:** a preview of the report image and the post text (ja / zh / en, following the UI language).
- **Phones:** the system share sheet comes first (`navigator.share`, with the PNG when `navigator.canShare({ files })` allows it).
- **Desktops:** X, LINE and Bluesky come first. The system share button also appears when the browser has one (Windows Edge / Chrome).
- **SNS buttons** only open the platform's official compose page (`x.com/intent/tweet`, `social-plugins.line.me/lineit/share`, `bsky.app/intent/compose`) with URL-encoded text and link. Nothing is posted automatically.
- **Other buttons:** copy result link, save report PNG, and "challenge this lineup", which copies a challenge link without the result.
- **Errors:** cancelling the system sheet shows nothing. If it is unavailable or fails, the link is copied instead.
- **Two kinds of links:**
  - A **challenge link** (`mode, v, a, b`) opens the lineup ready for a new match. A "challenge received" hint shows.
  - A **result link** adds `seed` and `r`, a compact record of the real result: winner, finish, time, HP and one highlight. It opens as a report card. It is **not re-simulated**, because a replay on another device can differ with fonts. The replay button says so.
  - Old `?a&b&seed` links still work.
- **Link safety:** fighter text is length-capped (80 characters) and validated on the way in, and always rendered with `textContent`. The `r` code is parsed strictly; anything odd is dropped.
- **Report PNG:** 1200×630, drawn with Canvas 2D. It has the ring screenshot, the logo, the mode, both names, the result and HP, an MVP (the winner and their special move; omitted on a draw), the best real moment from the match report, and the site address.
  - Web-font subsets for the exact characters used are loaded first.
  - Long names shrink, then get an ellipsis on grapheme boundaries, so emoji ZWJ sequences never break.
- **OG / X card:** `index.html` has site-wide Open Graph and `summary_large_image` tags with `public/og.png` (made by `scripts/make-og.py`). Set `VITE_SITE_URL` (absolute HTTPS) at build time so crawlers get absolute URLs.
  - A static SPA can't give each match its own preview: crawlers don't run JS.
  - For that, use the optional edge handler in `../deploy/edge/`, which returns escaped, `noindex` OG HTML per result link.
- **Analytics:** anonymous events (`share_panel_open`, `share_x_click`, `share_line_click`, `share_bluesky_click`, `share_native_open` / `share_native_done`, `share_link_copy`, `share_challenge_copy`, `share_image_download`, `challenge_link_open`, `challenge_match_started`).
  - Links carry `src=x|line|bsky|native|copy|challenge` so visits and matches can be attributed to a channel. The parameter is removed from the address bar after reading.
  - A click is only counted as a click, never as a post.
  - Events go to `window.dataLayer`, `window.plausible`, or a `VITE_ANALYTICS_URL` beacon if configured. Player text is never sent.

## Venue, crowd and commentary

- The stands on three sides, plus a floor-level front row, are filled with about 70 **random glyph spectators** (人 口 目 あ ? ! ♪ 😀 👀 …). They are built by the same glyph pipeline, sway, and jump when something big happens.
  - **Every match gets a new crowd:** a different mix of 10–16 glyph kinds, a different share of empty seats, and new sizes and poses.
  - The crowd is drawn from a pool of about 60 glyphs.
  - The first 16 glyphs are built at load. The rest are built in the background between matches, and building pauses while a match runs, so it can't cause a hitch. A few hold cardboard signs with the fighters' names, or with things like 「退钱」 and 「煎饼」.
- Spectators shout in **speech bubbles** that follow their 3D position: pre-match chatter, reactions to hits, falls, ring-outs and special moves, and a chant for the winner.
- Two glyph commentators, **大嘴「口」** (play-by-play) and **毒舌「舌」** (colour commentary that is mostly nonsense), sit at the commentary desk, bounce when they talk, and speak in speech bubbles above the desk. When the camera can't see the desk, their lines go to the bottom-left panel instead. When nothing is happening, 「舌」 fills the silence with breakfast stories and fake sponsors.
- **The novel-reading bit** (homage to the commentary-desk gag in 破坏之王):
  - In about every other match, 「舌」 pulls out a thread-bound copy of 《金瓶梅》 and reads a flowery passage aloud (「肌肤如丝……真乃一代尤物……」) while the fight goes on.
  - 「口」 panics and tries to cut to the ring. Only the final result gets through, after the reading ends.
  - The lines are original and all-ages, in zh, ja and en.
  - `?skit` in the URL forces the bit for testing.
- The venue is dark, with spotlights, light beams, a hanging banner and an apron with fake sponsors. All printed text follows the UI language.

## Test results

`npm test` (top folder): 62 tests in 8 files, all passing — 39 in `shared/tests` (input, glyph, stats, share links / SNS / OG escaping, game switcher) and 23 in `arena/tests` (battle, report, signature moves).

- **Input:** grapheme handling (ZWJ family, flags, keycaps, skin tones, combining marks), NFC, emoji versus text presentation, empty and invisible rejection, the length cap, and treating markup as plain text.
- **Glyph:** distance-transform morphology, sub-pixel contour area, 田 giving 1 shape with 4 holes, 川 giving 3 shapes, tiny dots surviving, and the vertex budget.
- **Stats:** determinism, shape-driven differences, budget bounds (mean 44–56 for every profile), and long inputs not being stronger. **Behaviour:** cross-script meaning rules, unknown text, solo-only punctuation, and the tag cap.
- **Battle:** determinism; about 300 varied matches all terminating with finite state; a mirror-match win share between 38% and 62%; outcome variety; no unbeatable fighter; and speed (about 0.3 µs per step, roughly 50,000× real time).
- **Signature moves:** meaning mapping across scripts and English words, the shape-based fallback for unknown text, longest-match and word-boundary rules for the daily pack (妈/妈妈/尼玛, mom/momentum, ZWJ 👩‍👧), every move kind firing in real battles without breaking the simulation, and ring-outs landing on the floor beside the ring.
- **Report:** at most 4 unique lines per match, more than 15 distinct line types across matches, and a finish line that matches the outcome.

`/selftest.html` in Chrome on Windows 11:

- **PASS** for all 18 required inputs: 火 水 田 川 龍 A Z あ ア ★ ♥ ∞ 😀 💀 🍣 ಠ_ಠ (・ω・) (>_<). Each produces a visible model, from 392 to about 3,000 triangles, built in 8–90 ms the first time.
- Extra edge cases also build: `👨‍👩‍👧 🇯🇵 1️⃣ é e+◌́ · ﷽ Hello 寿司🍣 ʕ•ᴥ•ʔ 飛 飞 龙`. Zero-width space and whitespace-only input are rejected with a message.
- Real-stat round-robin of 612 matches in the boxing ring: KO 35%, ring-out 44%, decision 20%, draw 1%. Matches are decided at 9.2 s on average, with about 2 signature moves per match. Win rates range from 26% (∞) to 68% (川).
- Full venue with 80 glyph spectators: about 178 draw calls and 36k triangles; CPU cost about 0.9 ms per frame. GPU timings measured in a background tab were capped by vsync (around 17 ms for every quality level), so they don't reflect the real load.

## Audio

`src/ui/audioManifest.ts` lists 78 sounds (74 SFX, 1 ambience, 3 BGM), each with an id, a `.wav` file name, a Stable Audio prompt, a duration and its trigger. `npm run docs:audio` exports them as [docs/audio/audio_requirements.json](docs/audio/audio_requirements.json), which can be imported directly into Audio Batch Studio (`Import JSON`). It also writes a Chinese overview with the triggers to [docs/audio/README.md](docs/audio/README.md). The export runs the format's checklist (prompt, unique `.wav` names, valid category, duration 1–120 s, no loop/variation prompts) and fails on any violation.

To use the generated audio:
1. Put the `.wav` files in `public/audio/`.
2. Run `npm run audio:index`.
3. Reload the game.

Each available clip replaces its synthesized fallback. Background music and the crowd bed loop per screen.

All 75 files of the first batch are now in `public/audio/` (about 46 MB, most of it the BGM wavs). Exceptions:
- `hit_light` and `hit_heavy` (normal hits and crits) deliberately stay synthesized: they are listed in `SYNTH_ONLY` in `src/ui/Sfx.ts`. Remove them from that set to use the files.
- `countdown_tick`, `clones_pop` and `lights_out`, added with the daily pack, have no file yet and are synthesized until generated.

For a production build, consider converting the BGM to `.ogg` or `.mp3`.

**New sounds (V2):** [docs/audio/v2/audio_requirements_v2.json](docs/audio/v2/audio_requirements_v2.json) is a separate requirement file in the same format, with an overview in [docs/audio/v2/README.md](docs/audio/v2/README.md).
- It lists 19 new SFX: 18 move-specific sounds plus `book_page_flip` for the commentary skit.
- `npm run docs:audio` writes both files and runs the checklist on each.
- Until a file exists, that sound is simply silent.

## Floor contact

**Falling under the ring (fixed):**
- A fighter that slid off the apron used to be pushed back by the ropes underneath the platform. It then fell forever, out of sight, and the match was never decided.
- Now the ropes only act above the canvas, and a fighter below the canvas can't be pushed back under the ring.
- Fast landings are caught even when a single step crosses the surface.
- As a safety net, anyone below the canvas is a ring-out.
- A regression test runs 1,500 matches: nobody is ever below the canvas over the ring, and every match ends.

Fighters are placed using the exact bounds of their model geometry, after this frame's squash, stretch and size changes. A wide glyph lying on its side, a giant or a stretched 一 always rests on the canvas instead of sinking in. Measured over about 5,000 grounded frames, the lowest model point never dropped below 0.000.

## Performance options

- The ~80 glyph spectators (16 shapes) are drawn with one `InstancedMesh` per shape instead of one mesh each. Particles are batched into one `THREE.Points` draw per particle kind, so big hits no longer add dozens of draw calls; a whole battle stays around 170 draw calls with no spikes.
- Ropes keep a fixed vertex buffer that is rewritten in place, instead of rebuilding geometry every frame while someone leans on them.
- All effect shaders (meteors, beams, shields, particles, words) are pre-compiled after loading, so the first special move doesn't hitch. Fighters stay in the transparent pass, so fading never forces a shader rebuild.
- High quality caps the pixel ratio at 1.5× and uses a 1024 shadow map. Low quality also turns off the coloured spotlights and light beams.
- Auto-quality: drops to Low below about 45 fps, and renders at 0.75× resolution if Low still runs below about 32 fps.
- The impact freeze on hits is short (35–70 ms). Signature moves use deliberate slow motion.

- **画質: 高 / 低 (Quality High / Low)** toggles shadow maps, pixel ratio and particle density.
- The game switches to Low automatically if frames average slower than about 38 fps in the first few seconds.
- The particle pool is capped at 220 sprites. The simulation costs microseconds; nearly all frame time is rendering.

## Known limitations

- **Font differences:** characters outside M PLUS Rounded 1c fall back to system fonts, so their shape, and therefore their stats, can differ between platforms. Examples are simplified-only Chinese characters such as 龙 and 飞, and Kannada `ಠ`. Only the same font and generator version guarantee identical stats.
- **Twemoji network dependency:** without network access, emoji use the native font (with a notice), and stats differ slightly from the Twemoji version. Twemoji 15.1 doesn't include emoji added after Unicode 15.1; those fall back to native.
- **Tofu detection is heuristic:** it compares against known-unassigned code points. Some platforms draw unique hex boxes that it won't recognise as missing, but those boxes still fight as visible shapes.
- **The sky arena is gone:** the floating circular platform was replaced by the boxing ring. The simulation and renderer only support one stage at a time.
- **Simplified physics:** collision uses one cylinder per fighter (no per-stroke physics), and toppling is a spring model rather than a rigid-body solver. A wide kaomoji collides as a wide cylinder.
- **Thin parts:** extremely thin or intricate strokes are slightly thickened before extrusion, and very complex strings are simplified to stay within the vertex budget.
- **Balance:** balance is tuned statistically, so some fighters are underdogs; 水 and plain Latin letters win about 26–30% of matches. Luck can flip close decisions by design.
- **Replays:** replays are exact only in a browser with the same fonts. Floating-point results are deterministic per engine, not guaranteed across engines.
- **Sharing:**
  - Sharing with an image needs the Web Share API with file support, which is mostly on mobile; elsewhere the PNG can be saved.
  - Per-match OG previews need the optional edge endpoint. Without it every link shows the site-wide card.
  - iPhone Safari and Android Chrome share sheets have only been checked by the manual checklist in `../deploy/README.md`, not automatically.

## Credits and licences

- Emoji graphics: [Twemoji](https://github.com/jdecked/twemoji), CC-BY 4.0.
- Font: [M PLUS Rounded 1c](https://fonts.google.com/specimen/M+PLUS+Rounded+1c), SIL Open Font License, via `@fontsource`.
- 3D: [three.js](https://threejs.org), MIT.
- The original arena, art and sounds (synthesized at runtime) were made for this project. The idea of turning text into a physical body whose shape sets its stats was inspired by mojiblade; no rules, art or layout were copied.
