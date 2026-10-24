# Glyph Rumble — 字形乱闘 / 字形乱斗

A family of browser games where any text, emoji or kaomoji becomes a 3D toy with its own shape-derived stats, personality and special move.

| Folder | Game | Status |
| --- | --- | --- |
| [`arena/`](arena/README.md) | 字形乱斗 3D — 1v1 boxing-ring brawl | ✅ playable |
| [`soccer/`](soccer/README.md) | 字形足球 Glyph Soccer — 4v4 arcade football (four-glyph idioms make a team, 12 idiom combos) | ✅ playable |
| [`basketball/`](basketball/README.md) | 字形篮球 Glyph Basketball — 2v2 arcade basketball (two-glyph words make a duo, 91 duo moves) | ✅ playable |
| [`shared/`](shared/) | The character system used by every game (one database of glyph characters, 3D glyph models, sharing, languages, game switcher) | — |

Design for the three-game setup (folders, shared character system, deployment, soccer / basketball plan): [docs/多游戏架构设计.md](docs/多游戏架构设计.md).

## Run

**Windows:** install Node.js LTS, then double-click `start-game.bat`. It installs dependencies the first time and opens the arena in Chrome.

```bash
npm install          # once, in this folder (npm workspaces)
npm run dev          # arena at http://localhost:5173
npm run dev:soccer   # soccer at http://localhost:5174
npm run dev:basketball  # basketball at http://localhost:5175
npm test             # all tests (shared + every game)
npm run build        # every game → dist/ (see deploy/README.md)
npm run docs:skills  # regenerate the per-language skill docs (shared/docs/skills/)
npm run audio:compress   # new .wav clips → .mp3 (needs ffmpeg), then npm run audio:index -w @glyph/<game>
npm run preview:worker   # serve dist/ exactly like Cloudflare (http://localhost:8787)
```

**Deployment:** GitHub → Cloudflare Workers (static assets), see [docs/部署说明.md](docs/部署说明.md).

Inside a game folder, `npm run dev`, `npm test` and `npm run build` work for that game alone.

## Layout

```
shared/        character system: input → glyph analysis → stats / personality / signature moves,
               sports layer (team building, move → sport action mapping, idiom combos, team links),
               3D glyph models, share links + SNS + report PNG, language state, game switcher
arena/         the 1v1 arena (its own rules, AI, ring, commentary, audio)
soccer/        4v4 football (its own rules, AI, pitch, commentary, audio)
basketball/    2v2 basketball (court, hoops, rules, AI, commentary, audio)
portal/        landing page at the site root
deploy/        deployment notes, per-match OG edge function, manual test checklist
scripts/       build-all.mjs
soundeffectRaw/  raw audio drop folder
```

Deployed, the games are sibling folders on one site (`/arena/`, `/soccer/`, `/basketball/`). A bar at the top of each game switches between them, and the chosen language carries over. In development each game runs on its own port (5173 / 5174 / 5175).
