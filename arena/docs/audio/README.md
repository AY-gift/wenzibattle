# 《字形乱斗 3D》音效需求

> 由 `npm run docs:audio` 从 `src/ui/audioManifest.ts` 自动生成，请勿手动修改。

共 78 条：SFX 74 · Ambience 1 · BGM 3。

## 怎么用

1. 在 **Audio Batch Studio** 里 `Import JSON`（或 `Ctrl+O`），选择同目录的 [`audio_requirements.json`](./audio_requirements.json)。
2. 生成、修剪、导出后，把 `.wav` 文件原名放进项目的 `public/audio/` 文件夹。
3. 运行 `npm run audio:index`（会更新 `public/audio/available.json`）。
4. 刷新游戏：有文件的音效会自动替换内置的合成音效；没有文件的继续用合成音效（或不发声）。

格式已按 `AUDIO_REQUIREMENT_FORMAT.md` 的检查清单自检：每条都有 prompt、id、`.wav` 文件名（无重名、无非法字符），category 只用 SFX / Ambience / BGM，时长 1.0–120.0 秒，prompt 不要求循环、变体或时间轴编排（循环播放由游戏代码完成）。

## 清单

| id | 文件名 | 名称 | 类型 | 时长 (s) | 触发时机 |
| --- | --- | --- | --- | --- | --- |
| `ui_click` | ui_click.wav | 界面按钮点击 | SFX | 1.0 | 所有按钮点击 |
| `ui_dice_roll` | ui_dice_roll.wav | 随机骰子 | SFX | 1.5 | 🎲 随机选手 / 随机对决 |
| `ui_fighter_drop` | ui_fighter_drop.wav | 选手落地预览 | SFX | 1.0 | 选人界面里新文字掉进擂台 |
| `ui_fight_button` | ui_fight_button.wav | 开战按钮 | SFX | 1.5 | 点击「开战！」 |
| `ui_camera_shutter` | ui_camera_shutter.wav | 保存图片 | SFX | 1.0 | 保存图片 / 分享 |
| `bell_round_start` | bell_round_start.wav | 开场铃 | SFX | 2.0 | 事件 fight：比赛开始 |
| `time_up_buzzer` | time_up_buzzer.wav | 时间到蜂鸣 | SFX | 1.5 | 事件 timeUp |
| `sudden_death_alarm` | sudden_death_alarm.wav | 决胜时刻警报 | SFX | 2.0 | 事件 suddenDeath：最后 5 秒，围绳变松 |
| `ko_bell` | ko_bell.wav | KO 铃 | SFX | 2.5 | 事件 ko |
| `victory_fanfare` | victory_fanfare.wav | 胜利号角 | SFX | 4.0 | 事件 finish（有胜者） |
| `draw_sad_trombone` | draw_sad_trombone.wav | 平局悲伤长号 | SFX | 3.0 | 事件 finish（平局） |
| `hit_light` | hit_light.wav | 普通命中 | SFX | 1.0 | 事件 hit |
| `hit_heavy` | hit_heavy.wav | 会心一击 | SFX | 1.0 | 事件 crit |
| `clash` | clash.wav | 正面对撞 | SFX | 1.0 | 事件 clash |
| `whoosh_dash` | whoosh_dash.wav | 冲刺 | SFX | 1.0 | 事件 dash |
| `dodge_swish` | dodge_swish.wav | 闪避 | SFX | 1.0 | 事件 dodge |
| `land_thud` | land_thud.wav | 落地 | SFX | 1.0 | 事件 land |
| `rope_bounce` | rope_bounce.wav | 撞围绳 | SFX | 1.5 | 事件 ropeBounce |
| `rope_slingshot` | rope_slingshot.wav | 围绳弹弓 | SFX | 1.5 | 事件 slingshot |
| `fall_whistle` | fall_whistle.wav | 掉出擂台 | SFX | 2.0 | 事件 overRope / fallOff |
| `floor_crash` | floor_crash.wav | 摔到台下 | SFX | 1.5 | 事件 ringout |
| `corner_post_crash` | corner_post_crash.wav | 撞角柱 | SFX | 1.0 | 事件 wallCrash / slam |
| `trip_stumble` | trip_stumble.wav | 绊倒滑倒 | SFX | 1.0 | 事件 trip / slip / doubleDown / laughFall |
| `pop_boing` | pop_boing.wav | 顶牛弹开 | SFX | 1.0 | 事件 pop / hop / pounce |
| `stomp` | stomp.wav | 踩踏 | SFX | 1.0 | 事件 stomp |
| `flame_burst` | flame_burst.wav | 喷火 | SFX | 1.5 | 事件 flame / burn |
| `steam_hiss` | steam_hiss.wav | 火被浇灭 | SFX | 1.0 | 事件 steam |
| `gas_puff` | gas_puff.wav | 神秘气流 | SFX | 1.5 | 事件 gas |
| `charm_sparkle` | charm_sparkle.wav | 魅惑 | SFX | 1.5 | 事件 charm |
| `snore` | snore.wav | 睡觉 | SFX | 2.0 | 事件 sleep |
| `zap_electric` | zap_electric.wav | 电击 | SFX | 1.0 | 事件 zap |
| `fuse_hiss` | fuse_hiss.wav | 引信 | SFX | 2.0 | 事件 fuse（自爆前） |
| `explosion_big` | explosion_big.wav | 大爆炸 | SFX | 2.5 | 事件 explode |
| `dizzy_tweets` | dizzy_tweets.wav | 转晕 | SFX | 1.5 | 事件 dizzy / confuse |
| `laugh_giggle` | laugh_giggle.wav | 笑 | SFX | 2.0 | 事件 laugh |
| `signature_start` | signature_start.wav | 必杀技发动 | SFX | 2.0 | 事件 signature（所有必杀技的开场） |
| `quake_rumble` | quake_rumble.wav | 震地 | SFX | 2.0 | 事件 quake（震地 / 泰山压顶 / 巨大倒地 / MOAI CRASH） |
| `tremor_laugh` | tremor_laugh.wav | 笑到地震 | SFX | 1.5 | 事件 tremor |
| `beam_laser` | beam_laser.wav | 光线 | SFX | 2.0 | 事件 beam（光线 / 死亡凝视） |
| `freeze_ice` | freeze_ice.wav | 冰冻 | SFX | 1.5 | 事件 freeze |
| `heal_chime` | heal_chime.wav | 回复 | SFX | 1.5 | 事件 heal |
| `meteor_fall` | meteor_fall.wav | 陨石下落 | SFX | 1.5 | 事件 meteor（无道具） |
| `meteor_impact` | meteor_impact.wav | 陨石爆炸 | SFX | 1.5 | 事件 meteorImpact（无道具） |
| `prop_impact` | prop_impact.wav | 道具砸地 | SFX | 1.0 | 事件 meteorImpact（GG / 🔨 / 🥞 / 🧋 / 🥚 / ? / ! 等道具） |
| `keyboard_crash` | keyboard_crash.wav | 键盘砸地 | SFX | 1.5 | 键盘侠「网络暴击」落地 |
| `table_flip_crash` | table_flip_crash.wav | 掀桌 | SFX | 1.5 | 颜文字「掀桌奥义」落地 |
| `throw_heave` | throw_heave.wav | 过肩摔 | SFX | 1.5 | 事件 throw |
| `shield_reflect` | shield_reflect.wav | 护盾反弹 | SFX | 1.0 | 事件 reflect（铁壁 / 躺平 / 懒得打了） |
| `roar_lion` | roar_lion.wav | 咆哮 | SFX | 2.0 | 事件 roar |
| `magnet_hum` | magnet_hum.wav | 吸引 | SFX | 1.5 | 事件 magnet |
| `poison_bubble` | poison_bubble.wav | 毒雾 | SFX | 1.5 | 事件 poison |
| `coin_rain` | coin_rain.wav | 撒钱 | SFX | 2.0 | 事件 bribe |
| `lecture_drone` | lecture_drone.wav | 讲课催眠 | SFX | 2.0 | 事件 lecture |
| `chomp_bite` | chomp_bite.wav | 咬 | SFX | 1.0 | 事件 chomp |
| `joke_rimshot` | joke_rimshot.wav | 冷笑话 | SFX | 1.5 | 事件 joke |
| `giant_grow` | giant_grow.wav | 巨大化 | SFX | 1.5 | 事件 giant |
| `swallow_gulp` | swallow_gulp.wav | 一口吞掉 | SFX | 1.0 | 事件 swallow |
| `spit_cannon` | spit_cannon.wav | 吐出去 | SFX | 1.5 | 事件 spit |
| `fish_slap` | fish_slap.wav | 鱼拍脸 | SFX | 1.0 | 事件 slap（摸鱼大师） |
| `frying_pan_clang` | frying_pan_clang.wav | 锅砸人 | SFX | 1.0 | 事件 blameReflect（甩锅） |
| `vanish_glitch` | vanish_glitch.wav | 消失 | SFX | 1.0 | 事件 vanish（404 等） |
| `reappear_pop` | reappear_pop.wav | 背后出现 | SFX | 1.0 | 事件 surprise |
| `feint_whistle` | feint_whistle.wav | 假动作 | SFX | 1.0 | 事件 feint |
| `fire_ignite` | fire_ignite.wav | 引火烧身 | SFX | 1.5 | 必杀技「引火烧身」开始 |
| `soot_fizzle` | soot_fizzle.wav | 被熏黑 | SFX | 1.0 | 事件 soot |
| `sweep_stretch` | sweep_stretch.wav | 一刀两断 | SFX | 1.5 | 必杀技「一刀两断」开始 |
| `lazy_yawn` | lazy_yawn.wav | 懒得打了 | SFX | 1.5 | 事件 lazy |
| `countdown_tick` | countdown_tick.wav | 倒数 | SFX | 1.0 | 事件 countdown（爸「我数到三！」/ おはよう，每数一下播放一次） |
| `clones_pop` | clones_pop.wav | 全家出动 | SFX | 1.5 | 事件 clones（一家人「全家出动！」） |
| `lights_out` | lights_out.wav | 一键关灯 | SFX | 1.5 | 事件 lightsOut（晚安「一键关灯」/ おやすみ） |
| `crowd_ambience` | crowd_ambience.wav | 观众席环境声 | Ambience | 30.0 | 比赛中持续播放（游戏内循环播放） |
| `crowd_cheer` | crowd_cheer.wav | 观众欢呼 | SFX | 3.0 | 事件 finish / 必杀技命中 |
| `crowd_ooh` | crowd_ooh.wav | 观众惊叹 | SFX | 2.0 | 事件 crit / upset |
| `crowd_laugh` | crowd_laugh.wav | 观众大笑 | SFX | 2.5 | 事件 doubleDown / trip / laughFall / swallow |
| `crowd_gasp` | crowd_gasp.wav | 观众倒吸气 | SFX | 1.5 | 事件 overRope / ko |
| `bgm_menu` | bgm_menu.wav | 选人界面音乐 | BGM | 60.0 | 选人界面（游戏内循环播放） |
| `bgm_battle` | bgm_battle.wav | 战斗音乐 | BGM | 90.0 | 比赛中（游戏内循环播放） |
| `bgm_result` | bgm_result.wav | 结算音乐 | BGM | 12.0 | 结算界面 |
