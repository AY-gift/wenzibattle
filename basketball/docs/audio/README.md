# 《字形篮球 2v2》音效需求（新增）

> 由 `npm run docs:audio`（在 basketball/ 里）从 `src/ui/audioManifest.ts` 自动生成，请勿手动修改。

只列出篮球新需要的 11 条（擂台和足球已有的 50 个音效直接复用，已复制到 `basketball/public/audio/`）。

## 怎么用

1. 在 **Audio Batch Studio** 里 `Import JSON`，选择同目录的 [`audio_requirements.json`](./audio_requirements.json)。
2. 生成后把 `.wav` 原名放进 `basketball/public/audio/`。
3. 在 basketball/ 里运行 `npm run audio:index`，刷新游戏即可。没有文件的继续用内置合成音。

格式已按 `AUDIO_REQUIREMENT_FORMAT.md` 的检查清单自检。

| id | 文件名 | 名称 | 类型 | 时长 (s) | 触发时机 |
| --- | --- | --- | --- | --- | --- |
| `dribble_bounce` | dribble_bounce.wav | 运球 | SFX | 1.0 | 运球（偶尔）/ 球落地 |
| `swish_net` | swish_net.wav | 空心入网 | SFX | 1.0 | 投篮命中 |
| `rim_clank` | rim_clank.wav | 打铁 | SFX | 1.0 | 球碰篮筐 |
| `backboard_bang` | backboard_bang.wav | 打板 | SFX | 1.0 | 球碰篮板 |
| `dunk_slam` | dunk_slam.wav | 扣篮 | SFX | 1.5 | 扣篮 |
| `sneaker_squeak` | sneaker_squeak.wav | 球鞋摩擦 | SFX | 1.0 | 变向 / 抢断 / 急停 |
| `shot_release` | shot_release.wav | 出手 | SFX | 1.0 | 投篮出手 / 传球 |
| `block_swat` | block_swat.wav | 盖帽 | SFX | 1.0 | 盖帽 |
| `buzzer_final` | buzzer_final.wav | 终场蜂鸣器 | SFX | 2.0 | 终场 / 进攻超时 |
| `bgm_basket` | bgm_basket.wav | 篮球比赛 BGM | BGM | 90.0 | 比赛中循环播放 |
| `crowd_gym` | crowd_gym.wav | 篮球馆观众 | Ambience | 20.0 | 比赛中背景循环 |

复用的擂台音效：`crowd_cheer`、`crowd_ooh`、`crowd_gasp`、`crowd_laugh`、`victory_fanfare`、`draw_sad_trombone`、`signature_start`、`whoosh_dash`、`pop_boing`、`stomp`、`quake_rumble`、`freeze_ice`、`snore`、`dizzy_tweets`、`laugh_giggle`、`coin_rain`、`charm_sparkle`、`magnet_hum`、`poison_bubble`、`prop_impact`、`shield_reflect`、`vanish_glitch`、`heal_chime`、`beam_laser`、`flame_burst`、`trip_stumble`、`ui_click`、`ui_dice_roll`、`ui_camera_shutter`、`reappear_pop`、`meteor_fall`、`roar_lion`、`time_up_buzzer`、`joke_rimshot`、`hit_light`、`hit_heavy`、`throw_heave`、`dodge_swish`、`ko_bell`、`whistle_kickoff`、`brawl_start`、`culture_sting`、`rivalry_horn`、`box_thud`、`backfire_boing`、`chain_pass`、`swap_poof`、`crowd_ambience`、`bgm_menu`、`bgm_result`
