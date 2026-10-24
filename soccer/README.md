# Glyph Soccer 4v4 — 字形足球 / グリフサッカー

One glyph is one player; four glyphs make a team. Type an idiom such as 龙飞凤舞, or pick four players yourself (妈妈 / 爸爸 / 宝宝 / 奶奶), and watch an arcade football match of about two minutes. The characters are the same as in the [arena](../arena/README.md): same 3D models, stats, personality and special moves, played out on a pitch. This is one folder of the Glyph Rumble family; see the [root README](../README.md).

## Run

```bash
# in the top folder
npm install
npm run dev:soccer      # http://localhost:5174
npm test                # all games (soccer: tests/match.test.ts)
npm run build           # every game → ../dist/ (soccer in dist/soccer/)
```

Inside `soccer/`: `npm run dev`, `npm test`, `npm run build`, `npm run docs:audio`, `npm run docs:culture`, `npm run audio:index`.

Useful URLs:
- `/?debug` exposes `window.__soccer` (`app`, `view`). `view.advance(seconds)` fast-forwards in background tabs.
- Share links look like `/?mode=soccer&v=1&how=split&an=龙飞凤舞&bh=free&b=妈妈&b=爸爸&b=宝宝&b=奶奶`.

## Building a team

Each side has two clearly separate modes:

- **One word (一键组队):** the word is split into its user-perceived characters (Unicode grapheme clusters).
  - It needs exactly 4: 龙飞凤舞 → 龙 / 飞 / 凤 / 舞.
  - 👨‍👩‍👧 counts as one player, and spaces are ignored.
  - The word stays the team name and is what team combos look up. It is never a fifth player.
- **Pick 4 (自由组队):** one box is one player, so whole words keep their own move: 妈妈 plays as 妈妈 (「吃饭啦！」), not as two 妈.
  - English words are only split if you choose one-word mode yourself.
  - An optional team name can be set.

The team card shows each player's special move (the arena name) with its football effect, plus the team combo, or "no special combo" for unregistered words. Any four readable characters make a legal team.

## Team colours and crowd

- **Kits:** every match draws two random team colours (red, blue, yellow, orange, purple, pink, cyan, white or black; never green, which is the pitch colour).
  - The pair always contrasts: hues at least 70° apart, or a big light / dark difference; yellow vs white is not allowed.
  - Players wear the colour: each glyph is recoloured in its team colour, keeping its own light / dark shading. Emoji and kaomoji keep their picture, and their edges take the colour.
  - Every player also has a team-coloured base ring and an arrow above the head.
  - The colours are fixed by the match seed, so a replay or result link shows the same kits.
  - Scoreboard, team panels, result list and report image all use them.
- **Crowd:** spectators shout in speech bubbles above the stands (bordered in the colour of the team they support).
  - Before kick-off they comment on the teams.
  - During play they chant and shout every second or so.
  - They react to goals (the scoring side celebrates, the other side groans), saves, shots, special moves, combos, knock-downs and the woodwork.
  - At full time the winners cheer.
  - All in ja / zh / en.

## Rules

- 4 v 4 on a small pitch (40 × 25) with **boards all round**: the ball bounces back in, so there are no throw-ins, offsides, fouls or referee.
- About **120 s** of play. After every goal there is a 3 s celebration, then the team that conceded kicks off.
- If the score is level at time-up, a **20 s golden goal** follows; still level means a draw.
- **No fixed goalkeeper:** whenever the ball is in their half or a shot is coming, the team's deepest player takes the keeper role, guarding the line between ball and goal and diving for shots.
- Everything is decided by the simulation, never by a canned animation.
  - The ball has gravity, bounce, rolling friction and spin (curling shots).
  - It hits players, posts, crossbar, boards and the net.
  - A goal means the whole ball crosses the line inside the frame.
- The simulation runs at a fixed 1/60 s with a seeded RNG, so the same lineup and seed always plays the same match.

## AI

Every 0.1 s each team hands out roles: carrier, support, runner, keeper/anchor when not defending, and presser and markers when defending. A loose ball gets a chaser, the player who arrives first.

- **The carrier scores its options:**
  - a **shot**, by distance, angle and blockers, aimed at the corner away from the keeper;
  - **passes** to each teammate, by forward gain, how open the receiver is, and whether a defender sits in the lane (a blocked lane makes it a lob);
  - a **dribble** that steers away from defenders.
- **Personality matters:** aggressive glyphs shoot more, chaotic ones make odd choices.
- **Defenders:** the presser tackles. Success depends on its defence against the carrier's control, plus mass. A failed tackle leaves the tackler on the grass.
- **Off the ball:** teammates push apart so the team doesn't become one blob.

## Special moves on the pitch

Each character uses its arena move with the **same name, props and element**. `shared/src/sports/skills.ts` maps every arena move kind to one football action:

| Football action | From arena kinds | Effect |
| --- | --- | --- |
| Power shot | kick, fireCharge | Fast, accurate; can burst through the keeper (but can still be saved) |
| Curling shot | whirlwind, fishSlap | Aimed outside the post and curls in; keepers read the straight line |
| Beam shot | beam | Very fast and flat |
| Sky shot | uppercut, meteor | Launched high, drops under the crossbar; usable from distance |
| Bulldoze dribble | charge, barrage, rage | Tackle-proof for 1.8 s; flattens anyone it runs into |
| Blink | vanish, feint | Teleports past the nearest marker with the ball |
| Decoy | clones | Opponents nearby get confused |
| Shockwave | quake, sweep, giantFall, laughQuake, topple, roar (cone) | Knocks nearby opponents down; the carrier loses the ball |
| Stun | freeze, glare, lecture, joke, confuse, bribe | Freezes / sleeps / confuses / laughs / chases coins / charms (a charmed carrier passes to you) |
| Ball snatch | magnet, chomp, swallow, throw | Pulls the ball from a nearby carrier |
| Prop rain | drop | The character's own props (🧥, 📺, ⌨️ …) fall on the carrier |
| Gas cloud | poison | Opponents inside run at half speed |
| Iron wall | shield, giant, mountain, lazy, blame | Bigger reach near goal; shots often rebound |
| Team rally | heal | Teammates run faster and recharge moves sooner |
| (random) | random | A different action every time |

Every move has:
- a situation where the AI uses it (shooting, on the ball, defending, or anywhere);
- a 13–18 s cooldown;
- at most 3 uses per match.

The move name pops up over the player with slow motion, a camera push, particles and commentary.

Football attributes come from the same stats (pace, acceleration, shot power, control, defence, accuracy, mass, jump). Their ranges are kept narrow so no shape dominates. Collision always uses a capped capsule radius, so complex kanji don't become walls.

## Team combos (成语连携)

Registered idioms get one team move with a real trigger and cooldown. The table lives in `shared/src/sports/combos.ts`:

| Idiom | Combo | Trigger → effect |
| --- | --- | --- |
| 龙飞凤舞 | 飞龙乱舞 | Ball in own half → three aerial passes forward, then a curling finish |
| 风平浪静 | 风平浪静 | Under attack → 8 s: no knock-downs or stuns, safer passing, harder to tackle |
| 火上浇油 | 火势升级 | Every completed pass heats up (max 5); at 3+ near goal → a powered fire shot |
| 画蛇添足 | 多此一脚 | Right after a shot near goal → a teammate's bonus kick (sometimes wildly off) |
| 一鸣惊人 | 惊天一脚 | A player who hasn't touched the ball for 22 s → long-range thunderbolt |
| 虎头蛇尾 | 虎头蛇尾 | Faster for the first 40 s, slower and sloppier in the last 40 s |
| 四面楚歌 | 包围战术 | Opponent in our half → all four surround the carrier; tackles +20% |
| 天马行空 | 空中接力 | A sky-high lob to the furthest runner, volleyed first time |
| 鸡飞狗跳 | 全场暴走 | 4 s of everyone running wild; bounces go crazy |
| 乱七八糟 | 混乱足球 | The opponents' positions are shuffled |
| 无法无天 | 野蛮突破 | 8 s of harder tackles; nobody stays back to keep goal |
| 大吉大利 | 好运来了 | Once a match, a shot off the post or keeper goes in anyway |

Traditional-character spellings are accepted too.

## Culture combos (文化连携) and rivalries

Any other four glyphs that spell one of the 244 registered culture teams (film, anime, myth, history, internet, Japanese and English words …, `shared/src/sports/cultureData.ts`, generated from the culture pack) get a culture combo instead: **a trigger + 1–3 primitives + a backfire**.

- **Engine:** `src/sim/culture.ts`. Every primitive is a real action: passes and shots are real kicks (they can be intercepted or saved), team effects change speed / tackling / positions / accuracy for a few seconds, opponent effects really stun, slow, confuse or shove, and the crate obstacle is a solid body the ball bounces off.
- **Limits:** at most 5 per match, 20–26 s cooldown. The 12 idiom combos keep priority. Nothing writes the score or adds a ball, and all randomness comes from the match seed.
- **Backfires (~40 %):** a teammate trips, two collide, the kick flies wild or even towards our own goal, the team tires, the goal is left open, an early celebration, a crash into the boards. They are only announced when they actually happen.
- **Rivalries:** 22 registered pairs (e.g. 少林足球 vs 足球小将) are recognised in either order. They are announced at kick-off and add a duel rule: counter, chaos, weather or spotlight.
- **No in-game catalog:** combos are left for players to discover (the 📖 catalog page was removed on purpose). The full list for developers is `../docs/文化技能实施报告.md` (`npm run docs:culture`).

## Fights (擂台乱斗)

Now and then a player ignores the ball and hits an opponent with their arena special move (same name, same big letters). There are eight styles: barrage, uppercut, flying kick, throw, slam, spin, roar, freeze.

- Knocked-down players may take revenge.
- At most one short brawl per match.
- Football stays the main thing: about 10 attacks per match. Code: `src/sim/brawl.ts`.

## Results and sharing

- **Result card:** score, winner (with golden goal), MVP, every goal with its kind and assist, plus big saves, flattening specials, combos and steals.
  - MVP scoring: goals ×4, assists ×2.5, saves ×1.5, steals, special-move hits.
- **Sharing:** the same share panel as the arena (system share, X, LINE, Bluesky, copy link, report PNG, challenge link) and the same anonymous events (`game: 'soccer'`).
- **Links:**
  - A challenge link restores both teams with their build mode: 4 players each, never 3v3.
  - A result link adds the seed and a compact code `r=1.<a>.<b>.<golden>.<time>.<mvp>[.<moment>]`. It opens as a report card and is not re-simulated.
- **Report PNG:** the scores sit next to the team names.
- **Open Graph:** `public/og.png` (made by `scripts/make-og.py`) is the site-wide card.

## Audio

- **Reused:** 42 clips are copied from the arena (crowd, fanfare, special-move sounds, fight hits …).
- **New:** the 11 football sounds (kicks, whistles, net, horn, post, catch, slide tackle, match BGM, chant) are listed in [docs/audio/audio_requirements.json](docs/audio/audio_requirements.json), with a [README](docs/audio/README.md). They have been generated and are in `public/audio/` (48 files in total).
- **New in V2:** 7 sounds for fights, culture combos and rivalries (brawl bell, culture sting, rivalry horn, box thud, backfire, chain pass, swap poof), listed in [docs/audio/v2/](docs/audio/v2/README.md). They have been generated and are in `public/audio/` (60 files in total).
- **Missing files** fall back to synthesized stand-ins.
- **Adding generated files:** put the `.wav` files in `public/audio/` and run `npm run audio:index`.

## Tests and balance

`npm test` in `soccer/` runs 21 tests (`match`, `culture`, `brawl`):

- **Design-doc matchups play from kick-off to full time:** 龙飞凤舞 vs 风平浪静, 火上浇油 vs 画蛇添足, 妈妈·爸爸·宝宝·奶奶 vs 火·水·雷·风, four unknown characters, and emoji + Japanese.
  - Each is 4v4, and words are kept whole.
  - Every match checks that score = goal events = goal list, positions are finite, and players and ball stay on the pitch.
- **Determinism:** the same lineup and seed play the same match.
- **The AI plays football:** passes, shots, saves, tackles and goals per match all fall within the expected ranges.
- **Rules and fairness:** a mirror match is 35–65% for either side, and a level score goes to golden goal, then a draw.
  - A 180°-rotated pitch plays exactly the rotated match (no side advantage). Before this fix, the side attacking −x won about 63% of mirror matches.
- **Culture combos:**
  - Every culture team fires its combo in a fixed scenario, and every primitive in its recipe takes effect.
  - Every kind of backfire happens.
  - Rivalries work in either order.
  - Combos fire unforced in real matches (at most 5).
  - The score always equals the real goals.
- **Fights:** attacks use the attacker's own arena move, hits floor someone, and the number per match stays in range.
- **No frozen carriers:** nobody holds the ball for more than 6 s without acting. This guards against the old stale-kick bug where a carrier walked to the boards and did nothing.
- **Combos and moves:** every registered idiom fires its combo, unregistered teams never do, and every football action fires in real matches without breaking anything.
- **Sharing and speed:** report / result-code round trip, and the simulation stays more than 100× faster than real time.

`shared/tests/culture.test.ts` validates the culture registry: row counts (466 + 34 V3), 4-glyph / 2-glyph keys, no duplicates, valid recipes, and every glyph/word row having its arena move. `shared/tests/sports.test.ts` covers team splitting, the combo lookup, the move mapping, attribute bounds, team links, and kits (always contrasting, never green, the same for the same seed).

**Balance** was checked on a headless round-robin of 16 lineups (1,440 matches):

| Measure | Result |
| --- | --- |
| Goals per match | about 5 (rarely 0) |
| Draws | 4% |
| Golden goal | 15% |
| Win rates | 18%–67% (the arena: 23%–77%) |

Effects of tuning:
- Narrowing pace, control and defence, and toning down the iron wall, took the spread from 17%–83% to its current level.
- Combos are worth roughly 0 to +9 percentage points for their team.

## Known limitations

- **Synthetic-shape balance:** balance was tuned with the Node tests' synthetic glyph shapes. Real fonts give different stats, so some lineups will feel stronger.
- **Portrait phones:** they show the pitch end-on and players bunch near the ball. Landscape looks better.
- **Model vs collision:** player models are bigger than their collision capsules, so glyphs can visually overlap.
- **No real-device check yet:** iPhone / Android share sheets haven't been tested on real devices (see `../deploy/README.md`).
