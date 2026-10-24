# 《字形足球 4v4》音效需求 V2（乱斗 · 文化连携 · 宿敌对决）

> 由 `npm run docs:audio`（在 soccer/ 里）从 `src/ui/audioManifest.ts` 自动生成，请勿手动修改。

只列出V2 新增（乱斗、文化连携、宿敌对决）的 7 条（擂台已有的 42 个音效直接复用，已复制到 `soccer/public/audio/`）。

## 怎么用

1. 在 **Audio Batch Studio** 里 `Import JSON`，选择同目录的 [`audio_requirements.json`](./audio_requirements.json)。
2. 生成后把 `.wav` 原名放进 `soccer/public/audio/`。
3. 在 soccer/ 里运行 `npm run audio:index`，刷新游戏即可。没有文件的继续用内置合成音。

格式已按 `AUDIO_REQUIREMENT_FORMAT.md` 的检查清单自检。

| id | 文件名 | 名称 | 类型 | 时长 (s) | 触发时机 |
| --- | --- | --- | --- | --- | --- |
| `brawl_start` | brawl_start.wav | 乱斗开始 | SFX | 2.0 | 球场乱斗开始 |
| `culture_sting` | culture_sting.wav | 文化连携发动 | SFX | 1.5 | 文化连携（四字文化队）发动 |
| `rivalry_horn` | rivalry_horn.wav | 宿敌对决 | SFX | 3.0 | 宿敌对决开场 |
| `box_thud` | box_thud.wav | 纸箱落地 | SFX | 1.0 | 纸箱障碍出现 / 球撞纸箱 |
| `backfire_boing` | backfire_boing.wav | 连携翻车 | SFX | 1.5 | 文化连携失误（摔倒、撞人、踢飞） |
| `chain_pass` | chain_pass.wav | 一脚连传 | SFX | 1.5 | 连续一脚传球 |
| `swap_poof` | swap_poof.wav | 瞬间换位 | SFX | 1.0 | 队友换位 / 打乱对手站位 |

复用的擂台音效：`crowd_cheer`、`crowd_ooh`、`crowd_gasp`、`crowd_laugh`、`victory_fanfare`、`draw_sad_trombone`、`signature_start`、`whoosh_dash`、`pop_boing`、`stomp`、`quake_rumble`、`freeze_ice`、`snore`、`dizzy_tweets`、`laugh_giggle`、`coin_rain`、`charm_sparkle`、`magnet_hum`、`poison_bubble`、`prop_impact`、`shield_reflect`、`vanish_glitch`、`heal_chime`、`beam_laser`、`flame_burst`、`trip_stumble`、`ui_click`、`ui_dice_roll`、`ui_camera_shutter`、`reappear_pop`、`meteor_fall`、`roar_lion`、`time_up_buzzer`、`joke_rimshot`、`hit_light`、`hit_heavy`、`throw_heave`、`dodge_swish`、`ko_bell`、`crowd_ambience`、`bgm_menu`、`bgm_result`
