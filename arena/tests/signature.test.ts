import { describe, expect, it } from 'vitest';
import { ARENA, BattleSimulator } from '../src/core/battle/BattleSimulator';
import { processInput, type ProcessedInput } from '@shared/core/InputProcessor';
import { keyLanguages, MOVE_KINDS, resolveSignature, type MoveKind } from '@shared/core/SignatureMoves';
import type { FighterSpec } from '@shared/core/StatGenerator';
import { specFor } from '@shared-tests/helpers';

const stats = { weight: 50, speed: 50, attack: 60, defense: 40, stability: 50, luck: 50 };
const sig = (t: string) => resolveSignature(t, (processInput(t) as ProcessedInput).graphemes, stats);

describe('signature moves', () => {
  it('maps common characters to fitting moves (simplified, traditional, Japanese)', () => {
    const cases: [string, MoveKind][] = [
      ['龍', 'uppercut'], ['龙', 'uppercut'], ['拳', 'barrage'], ['山', 'mountain'], ['光', 'beam'], ['雷', 'beam'],
      ['風', 'whirlwind'], ['风', 'whirlwind'], ['牛', 'charge'], ['王', 'giant'], ['冰', 'freeze'], ['氷', 'freeze'],
      ['药', 'heal'], ['薬', 'heal'], ['火', 'fireCharge'], ['炎', 'meteor'], ['脚', 'kick'], ['摔', 'throw'], ['盾', 'shield'], ['吼', 'roar'],
      ['爱', 'magnet'], ['愛', 'magnet'], ['屁', 'poison'], ['金', 'bribe'], ['书', 'lecture'], ['書', 'lecture'],
      ['口', 'swallow'], ['犬', 'chomp'], ['笑', 'laughQuake'], ['😂', 'joke'], ['🍣', 'whirlwind'], ['👻', 'lecture'], ['💣', 'quake'],
    ];
    for (const [t, kind] of cases) expect(sig(t).kind, t).toBe(kind);
    expect(sig('龍').name.zh).toBe('升龙拳');
    expect(sig('金').name.ja).toBe('札束ビンタ');
  });

  it('uses the first meaningful character in a word and English keywords', () => {
    expect(sig('火山').kind).toBe('fireCharge');
    expect(sig('山火').kind).toBe('mountain');
    expect(sig('money').kind).toBe('bribe');
    expect(sig('w').kind).toBe('joke');
    expect(sig('wow').kind).not.toBe('joke'); // a lone latin letter inside a word doesn't count
  });

  it('knows internet slang, and the longest word wins over its first character', () => {
    const cases: [string, MoveKind][] = [
      ['尼玛', 'roar'], ['煞笔', 'confuse'], ['傻逼', 'confuse'], ['SB', 'confuse'], ['草泥马', 'charge'], ['牛逼', 'giant'],
      ['666', 'barrage'], ['躺平', 'shield'], ['内卷', 'whirlwind'], ['yyds', 'giant'], ['卧槽', 'quake'], ['芭比Q', 'meteor'],
      ['バカ', 'confuse'], ['うっせぇ', 'roar'], ['オワタ', 'meteor'], ['bruh', 'freeze'], ['yeet', 'throw'], ['noob', 'confuse'], ['🤡', 'confuse'],
    ];
    for (const [t, kind] of cases) expect(sig(t).kind, t).toBe(kind);
    expect(sig('牛逼').name.zh).toBe('牛逼哄哄巨大化'); // not 牛's 野蛮冲撞
    expect(sig('草泥马').name.zh).toBe('草泥马奔腾'); // not 草's joke
    expect(sig('sbox').kind).not.toBe('confuse'); // latin slang matches whole words only
  });

  it('implements the ★ items of the design list', () => {
    const cases: [string, MoveKind][] = [
      ['一', 'sweep'], ['大', 'giantFall'], ['口', 'swallow'], ['山', 'mountain'], ['火', 'fireCharge'], ['笑', 'laughQuake'], ['懒', 'lazy'],
      ['逃', 'feint'], ['摸鱼', 'fishSlap'], ['打工', 'barrage'], ['甩锅', 'blame'], ['键盘侠', 'drop'], ['ぴえん', 'roar'], ['LOL', 'laughQuake'],
      ['404', 'vanish'], ['🗿', 'topple'], ['?', 'random'], ['ಠ_ಠ', 'glare'], ['(╯°□°)╯︵ ┻━┻', 'drop'],
    ];
    for (const [t, kind] of cases) expect(sig(t).kind, t).toBe(kind);
    expect(sig('(╯°□°)╯︵ ┻━┻').opts).toMatchObject({ prop: '┻━┻', arc: true });
    expect(sig('键盘侠').opts?.prop).toBe('⌨️');
    // Words win over their characters; 打工人 keeps its existing move.
    expect(sig('打工人').name.zh).toBe('996福报连击');
    expect(sig('打工').name.zh).toBe('打工人的怒火');
    // Existing slang moves are untouched.
    expect(sig('尼玛').name.zh).toBe('国粹输出');
    expect(sig('草泥马').name.zh).toBe('草泥马奔腾');
    // English words need word boundaries.
    expect(sig('egg').kind).not.toBe('drop');
    expect(sig('lollipop').kind).not.toBe('laughQuake');
  });

  it('every key in the table resolves to its own entry', async () => {
    const { MOVE_TABLE } = await import('@shared/core/SignatureMoves');
    for (const e of MOVE_TABLE) {
      for (const k of e.keys) {
        const g = processInput(k);
        if (!g.ok) continue;
        const got = resolveSignature(g.text, g.graphemes, stats);
        expect(got.name, `${k} → ${got.name.zh} (expected ${e.name.zh})`).toEqual(e.name);
      }
    }
  });

  it('daily vocabulary: longest match wins and old slang is untouched', () => {
    const zh = (t: string) => sig(t).name.zh;
    expect(zh('妈')).toBe('快把外套穿上！');
    expect(zh('妈妈')).toBe('吃饭啦！');
    expect(zh('老妈')).toBe('快把外套穿上！'); // 老妈 isn't its own entry yet → falls to 妈
    expect(zh('爸')).toBe('我数到三！');
    expect(zh('爸爸')).toBe('遥控器在哪？');
    expect(zh('老爸')).toBe('我数到三！');
    expect(zh('奶奶')).toBe('再吃一口！');
    expect(zh('尼玛')).toBe('国粹输出'); // 玛 ≠ 妈: the meme keeps its move
    expect(zh('你妈')).toBe('国粹输出');
    expect(zh('草泥马')).toBe('草泥马奔腾');
    expect(zh('一家人')).toBe('全家出动！'); // not 一's sweep
    expect(zh('手机')).toBe('低电量警告'); // not 手's barrage
    expect(zh('洗衣机')).toBe('脱水模式'); // not 洗
    expect(zh('冰箱')).toBe('冰箱门开了'); // not 冰
    // Existing moves are kept where the pack collides with them.
    expect(zh('加油')).toBe('奥利给满血');
    expect(zh('吃')).toBe('血盆大口');
    expect(zh('跑')).toBe('无影脚');
    // 包子 was removed as politically sensitive and must not be a move.
    expect(sig('包子').key).toBe('');
  });

  it('daily vocabulary: English word boundaries, emoji ZWJ and kaomoji', () => {
    expect(sig('Mom').name.en).toBe('Dinner is Ready!');
    expect(sig('mommy').name.en).not.toBe('Dinner is Ready!');
    expect(sig('momentum').name.en).not.toBe('Dinner is Ready!');
    expect(sig('OK').name.en).toBe('All Clear!');
    expect(sig('token').name.en).not.toBe('All Clear!');
    expect(sig('Hi').name.en).toBe('Super Handshake');
    expect(sig('this').name.en).not.toBe('Super Handshake');
    expect(sig('👩‍👧').name.zh).toBe('妈妈来了！'); // ZWJ family, one grapheme
    expect(sig('👩').key).toBe(''); // the parts alone are not the family
    expect(sig('🛏️').name.zh).toBe('别吵我睡觉');
    expect(sig('(^_^)').name.zh).toBe('微笑冲击');
    expect(sig('(T_T)').name.zh).toBe('眼泪大洪水');
    expect(sig('orz').name.zh).toBe('土下座重击');
  });

  it('daily vocabulary adds an everyday fighting style (passive traits)', () => {
    const p = processInput('胖') as ProcessedInput;
    expect(resolveSignature(p.text, p.graphemes, stats).normal).toContain('heavy');
    const q = processInput('咖啡') as ProcessedInput;
    expect(resolveSignature(q.text, q.graphemes, stats).normal).toEqual(['hasty', 'angry']);
  });

  it('high-frequency pack V2: new words, kept collisions and matching rules', () => {
    const zh = (t: string) => sig(t).name.zh;
    expect(zh('我')).toBe('主角光环');
    expect(zh('我爱你')).toBe('爱你三千遍'); // the phrase, not 我's aura
    expect(zh('老板')).toBe('现在开会');
    expect(sig('社長').name.ja).toBe('会議を始めます');
    expect(sig('Boss').name.en).toBe('URGENT MEETING');
    expect(sig('bossy').name.en).not.toBe('URGENT MEETING');
    expect(zh('加载中')).toBe('99% 卡住');
    expect(sig('LOADING').name.en).toBe('STUCK AT 99%');
    expect(zh('分手')).toBe('分道扬镳'); // not 手's 百裂拳
    expect(zh('已读不回')).toBe('消息撤回失败'); // not 回's whirlwind
    expect(sig('┬─┬ノ( º _ ºノ)').name.en).toBe('PUT IT BACK');
    expect(sig('ガチャ').kind).toBe('random');
    expect(sig('W').name.en).toBe('VICTORY EARLY');
    expect(sig('w').kind).toBe('joke'); // lowercase w is still laughing
    expect(sig('ICE CREAM').name.en).toBe('BRAIN FREEZE');
    // Inputs that already had a move keep it.
    expect(zh('钱')).toBe('金钱攻势');
    expect(zh('👀')).toBe('死亡凝视');
    expect(zh('寿司')).toBe('回转寿司');
    expect(zh('尼玛')).toBe('国粹输出');
  });

  it('move-specific sounds all exist in the audio manifest', async () => {
    const { MOVE_TABLE } = await import('@shared/core/SignatureMoves');
    const { AUDIO } = await import('../src/ui/audioManifest');
    const ids = new Set(AUDIO.map((a) => a.id));
    const used = MOVE_TABLE.map((e) => e.opts?.sfx).filter((x): x is string => !!x);
    expect(used.length).toBeGreaterThan(20);
    for (const id of used) expect(ids.has(id), id).toBe(true);
  });

  it('any move can dim the arena (全场黑屏)', () => {
    const base = specFor('黑', 'field');
    expect(base.signature.opts?.darkness).toBe(true);
    let dark = 0;
    for (let s = 0; s < 12; s++) {
      const r = new BattleSimulator([base, specFor('川', 'river')], s * 7 + 3).runToEnd();
      dark += r.events.filter((e) => e.type === 'lightsOut' && e.a === 0).length;
    }
    expect(dark).toBeGreaterThan(0);
  });

  it('classifies keys by language for the docs', () => {
    expect(keyLanguages('龙')).toEqual(['zh']);
    expect(keyLanguages('竜')).toEqual(['ja']);
    expect(keyLanguages('山')).toEqual(['zh', 'ja']);
    expect(keyLanguages('ねこ')).toEqual(['ja']);
    expect(keyLanguages('cat')).toEqual(['en']);
    expect(keyLanguages('🔥')).toEqual(['other']);
    expect(keyLanguages('996', 'zh')).toEqual(['zh']);
    expect(keyLanguages('★', 'zh')).toEqual(['other']);
  });

  it('every fighter has a move, even unknown text (shape-based fallback)', () => {
    for (const t of ['Q', 'ゑ', '〒', '(・_・;)', 'xyz']) {
      const s = sig(t);
      expect(s.key).toBe('');
      expect(MOVE_KINDS).toContain(s.kind);
    }
    expect(resolveSignature('Q', ['Q'], { ...stats, weight: 95 }).kind).toBe('charge');
  });

  it('every move kind actually fires in battle without breaking the simulation', () => {
    const base = specFor('田', 'field');
    const foe = specFor('川', 'river');
    for (const kind of MOVE_KINDS) {
      const spec: FighterSpec = { ...base, name: kind, signature: { kind, name: { ja: kind, zh: kind, en: kind }, key: '' } };
      let fired = 0;
      for (let s = 0; s < 12; s++) {
        const sim = new BattleSimulator([spec, foe], s * 13 + 1);
        const r = sim.runToEnd();
        // 'random' turns into a concrete move, so count any signature by this fighter.
        fired += r.events.filter((e) => e.type === 'signature' && e.a === 0 && (kind === 'random' || e.move === kind)).length;
        for (const f of sim.fighters) {
          expect(Number.isFinite(f.p.x) && Number.isFinite(f.y) && Number.isFinite(f.hp), kind).toBe(true);
          expect(f.sizeMul).toBeLessThan(1.6);
        }
      }
      expect(fired, kind).toBeGreaterThan(0);
    }
  });

  it('ring-outs land on the arena floor beside the ring', () => {
    for (let s = 0; s < 200; s++) {
      const sim = new BattleSimulator([specFor('■', 'block'), specFor('・', 'dot')], s);
      const r = sim.runToEnd();
      if (r.reason !== 'ringout') continue;
      const out = sim.fighters.find((f) => f.out)!;
      expect(out.y).toBeCloseTo(-ARENA.ringHeight, 1);
      expect(Math.max(Math.abs(out.p.x), Math.abs(out.p.z))).toBeGreaterThan(ARENA.half);
      return;
    }
    throw new Error('no ring-out happened in 200 matches');
  });
});
