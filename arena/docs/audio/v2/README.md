# 《字形乱斗 3D》音效需求 V2（新增）

> 由 `npm run docs:audio` 从 `src/ui/audioManifest.ts` 自动生成，请勿手动修改。

这是随「高频输入扩展包 V2」新增的音效，只包含新条目；第一批需求见 [../README.md](../README.md)。

这些音效是技能专属的：技能开始时在通用的必杀技提示音之上额外播放；没有文件时只是不播放，不影响游戏。`book_page_flip` 用于解说员「舌」朗读古典名著的桥段。

共 19 条：SFX 19 · Ambience 0 · BGM 0。

## 怎么用

1. 在 **Audio Batch Studio** 里 `Import JSON`（或 `Ctrl+O`），选择同目录的 [`audio_requirements_v2.json`](./audio_requirements_v2.json)。
2. 生成、修剪、导出后，把 `.wav` 文件原名放进项目的 `public/audio/` 文件夹。
3. 运行 `npm run audio:index`（会更新 `public/audio/available.json`）。
4. 刷新游戏：有文件的音效会自动替换内置的合成音效；没有文件的继续用合成音效（或不发声）。

格式已按 `AUDIO_REQUIREMENT_FORMAT.md` 的检查清单自检：每条都有 prompt、id、`.wav` 文件名（无重名、无非法字符），category 只用 SFX / Ambience / BGM，时长 1.0–120.0 秒，prompt 不要求循环、变体或时间轴编排（循环播放由游戏代码完成）。

## 清单

| id | 文件名 | 名称 | 类型 | 时长 (s) | 触发时机 |
| --- | --- | --- | --- | --- | --- |
| `move_payment_fail` | move_payment_fail.wav | 支付失败 | SFX | 1.5 | 必杀技 穷「余额不足」/ broke / 破产 |
| `move_error_beep` | move_error_beep.wav | 错误提示音 | SFX | 1.0 | 必杀技 密码 / password / 断网 / offline / 蓝屏 |
| `move_school_bell` | move_school_bell.wav | 上下课铃 | SFX | 2.5 | 必杀技 学生 / student「下课铃响！」/ 老师 / teacher |
| `move_microphone` | move_microphone.wav | 校长讲话 | SFX | 2.0 | 必杀技 校长「校长讲话」/ 老师「全体起立！」/ 先生 |
| `move_sneeze` | move_sneeze.wav | 惊天喷嚏 | SFX | 1.5 | 必杀技 鼻「惊天喷嚏」 |
| `move_quack` | move_quack.wav | 鸭子游行 | SFX | 1.5 | 必杀技 鸭 / 🦆「嘎嘎大游行」 |
| `move_goose_honk` | move_goose_honk.wav | 大鹅追杀 | SFX | 1.5 | 必杀技 鹅「大鹅追杀」 |
| `move_champagne_pop` | move_champagne_pop.wav | 开香槟 | SFX | 1.5 | 必杀技 赢「半场开香槟」/ W |
| `move_loading_spin` | move_loading_spin.wav | 加载中 | SFX | 2.0 | 必杀技 加载中 / loading「99% 卡住」 |
| `move_heart_pop` | move_heart_pop.wav | 爱心连发 | SFX | 1.5 | 必杀技 爱你 / 520 / 表白 / 好き / 大好き |
| `move_like_pop` | move_like_pop.wav | 点赞 | SFX | 1.0 | 必杀技 好 / 赞 / 点赞 / 关注「一键三连」 |
| `move_gacha` | move_gacha.wav | 扭蛋机 | SFX | 2.0 | 必杀技 ガチャ「何が出るかな」 |
| `move_paper_flurry` | move_paper_flurry.wav | 纸张乱飞 | SFX | 1.5 | 必杀技 考试 / 作业 / 白 / 仕事 / exam |
| `move_door_slam` | move_door_slam.wav | 门板拍人 | SFX | 1.0 | 必杀技 开「芝麻开门」/ 关「关门大吉」 |
| `move_lock_click` | move_lock_click.wav | 上锁 | SFX | 1.0 | 必杀技 锁 / 🔒「咔哒上锁」 |
| `move_rocket` | move_rocket.wav | 火箭发射 | SFX | 2.5 | 必杀技 🚀「ROCKET LAUNCH」/ 📈「TO THE MOON」 |
| `move_cola_fizz` | move_cola_fizz.wav | 摇过的可乐 | SFX | 1.5 | 必杀技 可乐「摇过的可乐」 |
| `move_cream_splat` | move_cream_splat.wav | 奶油糊脸 | SFX | 1.0 | 必杀技 蛋糕 / cake / 草莓 / 西瓜 |
| `book_page_flip` | book_page_flip.wav | 解说读名著 | SFX | 1.5 | 解说桥段：毒舌「舌」开始朗读古典名著 |
