# Glyph Basketball 2v2 — 字形篮球 / グリフバスケ

One glyph is one player; two glyphs make a duo. Arcade basketball with the same characters, special moves and sharing as the arena and the football game.

## Run

```bash
npm install                # once, in the top folder
npm run dev:basketball     # http://localhost:5175
```

Inside `basketball/`: `npm run dev`, `npm test`, `npm run build`, `npm run docs:audio`, `npm run audio:index`.

## Building a duo

- **One word (一键搭档):** exactly two graphemes, one player each (`冰火` → 冰 / 火). Emoji ZWJ sequences stay one grapheme.
- **Pick 2 (自由组队):** each box is one whole player, so `妈妈` stays one player.
- Any two readable glyphs make a legal team. A registered pair also gets its duo move.

## Rules (arcade)

- **Court:** a small full court with two hoops (pole, glass backboard, rim, net). Low walls all round: the ball bounces back in, so there is no out-of-bounds. There are no fouls.
- **Clock:** 90 s game with a 12 s shot clock. A tie goes to one 15 s overtime, then may end level.
- **Scoring:** a basket counts only when the ball's centre drops down through the rim. Shots from beyond the 3-point line are worth 3; everything else is worth 2.
- **Shots are real:** the release speed is solved for the rim (or off the glass for bank shots), then gets error from distance, accuracy and a defender's contest. The ball really flies and collides with the rim and board.
- **Dunks:** the player leaps at the rim and slams the ball down through it. A dunk can still rattle out or be stuffed by a defender in the air.
- **Arcade flying (热血-style):**
  - Players fall slower than the ball and jump 2.5–5 m.
  - Flying dunks take off from up to ~6 m out (「飞身暴扣」), with a forward flip on the way and a twirl on other big jumps.
  - A big dunk shakes the defenders around the rim, and a defender who jumps into an unblocked dunk gets posterized.
  - Two opponents meeting in mid-air can crash, and the one with less momentum drops out of the sky.
  - The camera rises with the action. There is still exactly one ball, and points only come from the rim.
- **Restarts:**
  - **Tip-off:** at the start and in overtime. Both centres jump and the winner taps the ball to the partner.
  - **After a basket:** the other team takes it out under its own hoop while the scorers get back on defence.

## AI

- **Offence:**
  - The carrier weighs dunk, layup, jumper or three, pass and drive. It uses distance, openness, the shot clock and its own accuracy and power.
  - The partner spots up on the far wing or corner, or cuts backdoor when its defender ball-watches. Intended receivers run onto passes.
- **Defence (man-to-man):**
  - The man on the ball stays between carrier and rim. It reaches in for steals and jumps to contest or block.
  - The other defender sags into the paint and helps when the carrier gets inside.
- **Rebounds:** players crash the boards and jump for balls coming off the rim.

## Special moves on the court

Every character keeps its arena move (same name, props and element). `shared/src/sports/skills.ts` maps the move to a sport action, and `src/sim/skills.ts` decides what that action is in basketball.

| Sport action | In basketball |
| --- | --- |
| powerShot | Power dunk: charges the rim, flattens people, harder to block |
| curveShot | Spin move past the defender, then a layup |
| beamShot | Laser jumper: fast, flat, hard to block |
| skyShot | Sky hook: rainbow arc, can't be blocked, less accurate |
| dash / blink / decoy | Bulldoze drive / teleport past the defender / clones confuse defenders |
| shockwave / disable / steal / rain / cloud | Knock-back, stun, ball snatch, props from the sky, gas cloud |
| wall / rally | Paint wall (bigger block reach) / team speed boost |

Moves have a context, a 13–18 s cooldown and at most 3 uses per game.

## Duo moves (文化搭档) and rivalries

All 262 two-glyph pairs are playable: 91 from the culture pack and 171 from the basketball expansion pack (`shared/docs/design/basketball-expansion/`). 13 of them are the idiom pairs registered earlier in `BASKETBALL_COMBOS`, which keep their translated names. Each pair is a recipe of **a trigger + 1–3 primitives + a backfire**, run by `src/sim/culture.ts`:

- **Ball actions:**
  - Alley-oop, give-and-go, pick-and-roll, backdoor cut, crossover, pump fake.
  - Rainbow shot, bank shot, deep three, power dunk, curving pass, fast break, swap pass, tip-in.
  - Multi-step moves are queued: each step is a real pass or shot by whoever of the duo has the ball.
- **Team effects (a few seconds):** screen, sprint, swap places, double team, paint wall, block / steal / rebound boost, low gravity, calm, accuracy, recover, spotlight.
- **Against the opponents:** wrong man, ghost ball (visual only — there is always exactly one real ball), slippery floor, shockwave, stun, an obstacle on court, one lucky rim roll.
- **Backfires (~40 %):** tripping, colliding, an airball, getting tired, an open perimeter, celebrating too early, a pass gone astray. They are announced only when they actually happen.
- **Limits:** at most 5 per game, 16–21 s cooldown. Nothing writes the score, and all randomness comes from the match seed.
- **Two shot primitives in a row** make one shot with both features (抛投: a rainbow off the glass). A defensive trigger with an attacking move defends first and attacks once the ball is won back.
- **Rivalries:** 46 registered basketball rivalries (16 + 30 from the expansion, e.g. 冰火 vs 晴雨, 青龙 vs 白虎) are recognised in either order. They are announced at the tip-off and add a duel rule: counter, chaos, weather or spotlight.

Every pair, rivalry and character move is listed in the shared catalog: the 📖 button opens `soccer/catalog.html` on its basketball tab.

## Fights (擂台乱斗)

As in football, now and then a player ignores the ball and hits an opponent with its arena move. Knocked-down players may take revenge, and there is at most one brawl per game. Code: `src/sim/brawl.ts`.

## Audio

- **Reused:** 50 clips from the arena and the football game (crowd, fanfare, special-move sounds, whistle, fight hits, culture sting, rivalry horn …).
- **New:** 11 basketball sounds (dribble, swish, rim clank, backboard bang, dunk slam, sneaker squeak, shot release, block swat, buzzer, BGM, gym crowd), listed in [docs/audio/audio_requirements.json](docs/audio/audio_requirements.json) with a [README](docs/audio/README.md). They have been generated and are in `public/audio/` (61 files in total).

## Tests

`npm test` in `basketball/` runs 16 tests (`match`, `culture`):

- **Full games:** tip-off to buzzer, 2v2 with words kept whole. Every game checks:
  - the score equals the recorded baskets;
  - nothing is NaN;
  - everyone and the ball stay on court.
- **Physics and rules:**
  - Determinism: the same lineup and seed play the same game.
  - Made shots really pass down through the rim, and threes only come from beyond the arc.
  - The shot clock forces a turnover.
  - A tie goes to overtime.
- **Fairness:** the mirror match is fair, and a 180°-rotated court plays exactly the rotated game.
- **The AI plays basketball:** passes, shots, threes, dunks, rebounds, steals, blocks and rim hits per game all fall in range.
- **Moves, fights and speed:**
  - Every basketball version of a special move fires.
  - Fights use the attacker's own arena move.
  - Nobody freezes on the ball.
  - The simulation is fast enough.
- **Culture pairs:**
  - All 262 pairs fire, and every primitive in each recipe takes effect (in one of three seeded scenarios, because a pass can honestly be stolen).
  - Every kind of backfire happens.
  - Pairs fire unforced in real games.
  - The 46 rivalries work in either order.

**Shooting calibration** (headless games, synthetic shapes):

| Shot | Make rate |
| --- | --- |
| Layups | about 75–80 % |
| Mid-range | about 50 % |
| Threes | about 30 % |
| Dunks per game | about 5 (3 of them flying) |
| Points per game | about 20 |

## Known limitations

- Balance was tuned with the Node tests' synthetic glyph shapes; real fonts give different stats.
- No free throws (there are no fouls).
