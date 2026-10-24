# 《字形足球 4v4》音效需求（新增）

> 由 `npm run docs:audio`（在 soccer/ 里）从 `src/ui/audioManifest.ts` 自动生成，请勿手动修改。

只列出足球新需要的 11 条（擂台已有的 42 个音效直接复用，已复制到 `soccer/public/audio/`）。

## 怎么用

1. 在 **Audio Batch Studio** 里 `Import JSON`，选择同目录的 [`audio_requirements.json`](./audio_requirements.json)。
2. 生成后把 `.wav` 原名放进 `soccer/public/audio/`。
3. 在 soccer/ 里运行 `npm run audio:index`，刷新游戏即可。没有文件的继续用内置合成音。

格式已按 `AUDIO_REQUIREMENT_FORMAT.md` 的检查清单自检。

| id | 文件名 | 名称 | 类型 | 时长 (s) | 触发时机 |
| --- | --- | --- | --- | --- | --- |
| `kick_ball` | kick_ball.wav | 踢球 | SFX | 1.0 | 传球 / 普通射门 |
| `kick_power` | kick_power.wav | 大力射门 | SFX | 1.0 | 射门（必杀射门叠加特效音） |
| `whistle_kickoff` | whistle_kickoff.wav | 开球哨 | SFX | 1.5 | 开球 / 进球后重新开球 |
| `whistle_final` | whistle_final.wav | 终场哨 | SFX | 2.5 | 比赛结束 |
| `goal_net` | goal_net.wav | 球入网 | SFX | 1.5 | 进球 |
| `goal_horn` | goal_horn.wav | 进球号角 | SFX | 2.5 | 进球 |
| `post_clang` | post_clang.wav | 击中门框 | SFX | 1.0 | 击中门柱或横梁 |
| `keeper_catch` | keeper_catch.wav | 扑救接球 | SFX | 1.0 | 守门员扑救 |
| `tackle_slide` | tackle_slide.wav | 铲球 | SFX | 1.0 | 抢断 / 铲球 |
| `bgm_match` | bgm_match.wav | 足球比赛 BGM | BGM | 90.0 | 比赛中循环播放 |
| `crowd_chant` | crowd_chant.wav | 观众助威 | Ambience | 20.0 | 比赛中背景循环 |

复用的擂台音效：`crowd_cheer`、`crowd_ooh`、`crowd_gasp`、`crowd_laugh`、`victory_fanfare`、`draw_sad_trombone`、`signature_start`、`whoosh_dash`、`pop_boing`、`stomp`、`quake_rumble`、`freeze_ice`、`snore`、`dizzy_tweets`、`laugh_giggle`、`coin_rain`、`charm_sparkle`、`magnet_hum`、`poison_bubble`、`prop_impact`、`shield_reflect`、`vanish_glitch`、`heal_chime`、`beam_laser`、`flame_burst`、`trip_stumble`、`ui_click`、`ui_dice_roll`、`ui_camera_shutter`、`reappear_pop`、`meteor_fall`、`roar_lion`、`time_up_buzzer`、`joke_rimshot`、`hit_light`、`hit_heavy`、`throw_heave`、`dodge_swish`、`ko_bell`、`crowd_ambience`、`bgm_menu`、`bgm_result`
