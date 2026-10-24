import { describe, expect, it } from 'vitest';
import { MOVE_KINDS, resolveSignature } from '../src/core/SignatureMoves';
import { processInput, type ProcessedInput } from '../src/core/InputProcessor';
import { BASKETBALL_COMBOS, comboFor, SOCCER_COMBOS } from '../src/sports/combos';
import { rerollRandom, SKILL_USE, sportAttributes, sportSkillFor, SPORT_SKILL_KINDS } from '../src/sports/skills';
import { buildTeam, freeTeam, splitTeam } from '../src/sports/team';
import { buildTeamLink, parseTeamLink } from '../src/sports/teamLinks';
import { specFor } from './helpers';

const BASE = 'https://example.com/soccer/';
const stats = { weight: 50, speed: 50, attack: 50, defense: 50, stability: 50, luck: 50 };
const sig = (t: string) => resolveSignature(t, (processInput(t) as ProcessedInput).graphemes, stats);

describe('team building', () => {
  it('one-word teams split into grapheme clusters, exactly N', () => {
    expect(splitTeam('龙飞凤舞', 4)).toMatchObject({ ok: true, members: ['龙', '飞', '凤', '舞'], name: '龙飞凤舞', word: '龙飞凤舞' });
    expect(splitTeam('龙 飞 凤 舞', 4)).toMatchObject({ ok: true, members: ['龙', '飞', '凤', '舞'] });
    // A ZWJ family and a flag are one player each.
    expect(splitTeam('👨‍👩‍👧🇯🇵猫あ', 4)).toMatchObject({ ok: true, members: ['👨‍👩‍👧', '🇯🇵', '猫', 'あ'] });
    expect(splitTeam('冰火', 2)).toMatchObject({ ok: true, members: ['冰', '火'] });
    expect(splitTeam('龙飞凤', 4)).toEqual({ ok: false, reason: 'count', n: 3, need: 4 });
    expect(splitTeam('', 4)).toEqual({ ok: false, reason: 'empty' });
  });

  it('free teams keep whole words (妈妈 stays 妈妈 with its own move)', () => {
    const t = freeTeam(['妈妈', '爸爸', '宝宝', '奶奶'], 4);
    expect(t).toMatchObject({ ok: true, members: ['妈妈', '爸爸', '宝宝', '奶奶'], name: '妈妈・爸爸・宝宝・奶奶' });
    expect(sig('妈妈').name.zh).toBe('吃饭啦！'); // not two 妈
    expect(freeTeam(['404', 'ERROR'], 2, '错误码')).toMatchObject({ ok: true, name: '错误码' });
    expect(freeTeam(['猫', '', '犬', '鸟'], 4)).toEqual({ ok: false, reason: 'member', index: 1 });
  });

  it('English words are only split when the player picks one-word mode', () => {
    expect(buildTeam('free', ['LOVE', 'cat', '🗿', '404'], 4)).toMatchObject({ ok: true, members: ['LOVE', 'cat', '🗿', '404'] });
    expect(buildTeam('split', 'LOVE', 4)).toMatchObject({ ok: true, members: ['L', 'O', 'V', 'E'] });
  });
});

describe('team combos', () => {
  it('idioms and two-glyph words find their combo; others get none', () => {
    expect(comboFor(SOCCER_COMBOS, { word: '龙飞凤舞', members: [] })?.kind).toBe('dragonDance');
    expect(comboFor(SOCCER_COMBOS, { word: '龍飛鳳舞', members: [] })?.kind).toBe('dragonDance');
    expect(comboFor(SOCCER_COMBOS, { members: ['四', '面', '楚', '歌'] })?.kind).toBe('surround');
    expect(comboFor(SOCCER_COMBOS, { word: '甲乙丙丁', members: [] })).toBeNull();
    expect(comboFor(SOCCER_COMBOS, { members: ['妈妈', '爸爸', '宝宝', '奶奶'] })).toBeNull();
    expect(comboFor(BASKETBALL_COMBOS, { word: '冰火', members: [] })?.kind).toBe('iceFire');
    expect(SOCCER_COMBOS).toHaveLength(12);
    for (const c of [...SOCCER_COMBOS, ...BASKETBALL_COMBOS]) expect(c.name.zh && c.name.ja && c.name.en && c.desc.zh).toBeTruthy();
  });
});

describe('sport skills from arena moves', () => {
  it('every arena move kind maps to a sport action, keeping its name', () => {
    for (const kind of MOVE_KINDS) {
      const s = sportSkillFor({ kind, name: { ja: 'x', zh: kind, en: 'x' }, key: '' });
      expect(SPORT_SKILL_KINDS, kind).toContain(s.kind);
      expect(s.use).toBe(SKILL_USE[s.kind]);
      expect(s.name.zh).toBe(kind);
    }
  });

  it('characters keep their identity: 火 shoots fire, 404 blinks, 妈妈 snatches the ball', () => {
    expect(sportSkillFor(sig('火'))).toMatchObject({ kind: 'powerShot', move: 'fireCharge', name: sig('火').name });
    expect(sportSkillFor(sig('404')).kind).toBe('blink');
    expect(sportSkillFor(sig('妈妈')).kind).toBe('steal');
    expect(sportSkillFor(sig('冰')).disable).toBe('freeze');
    let i = 0;
    const picks = new Set<string>();
    const random = sportSkillFor(sig('?'));
    for (let k = 0; k < 40; k++) picks.add(rerollRandom(random, (a) => a[i++ % a.length]).kind);
    expect(picks.size).toBeGreaterThan(3);
  });

  it('ball-game attributes are bounded (huge or complex glyphs don’t become walls)', () => {
    for (const [t, s] of [['田', 'field'], ['・', 'dot'], ['■', 'block'], ['一', 'bar']] as const) {
      const a = sportAttributes(specFor(t, s));
      expect(a.radius).toBeGreaterThanOrEqual(0.36);
      expect(a.radius).toBeLessThanOrEqual(0.62);
      expect(a.mass).toBeLessThanOrEqual(2.2);
      expect(a.pace).toBeGreaterThanOrEqual(5.2);
      expect(a.pace).toBeLessThanOrEqual(7);
      for (const k of ['power', 'control', 'defense', 'accuracy', 'jump'] as const) expect(a[k]).toBeGreaterThan(0);
    }
  });
});

describe('team links', () => {
  it('round-trip split and free teams with the right player count', () => {
    const a = splitTeam('龙飞凤舞', 4), b = freeTeam(['妈妈', '(・ω・)', '👨‍👩‍👧', 'a&b=c'], 4, 'Mix #1');
    if (!a.ok || !b.ok) throw new Error('bad');
    const url = buildTeamLink({ mode: 'soccer', teams: [a, b] }, { seed: 7, r: '1.3.2.0.1200.1', source: 'x', base: BASE });
    const p = parseTeamLink(new URL(url).search, 'soccer', 4)!;
    expect(p.lineup.teams[0]).toMatchObject({ how: 'split', members: ['龙', '飞', '凤', '舞'], word: '龙飞凤舞' });
    expect(p.lineup.teams[1]).toMatchObject({ how: 'free', members: ['妈妈', '(・ω・)', '👨‍👩‍👧', 'a&b=c'], name: 'Mix #1' });
    expect(p.seed).toBe(7);
    expect(p.r).toBe('1.3.2.0.1200.1');
    expect(p.source).toBe('x');
  });

  it('rejects other modes, wrong sizes and junk', () => {
    expect(parseTeamLink('?mode=arena&a=火&b=水', 'soccer', 4)).toBeNull();
    expect(parseTeamLink('?mode=soccer&how=split&an=龙飞&bn=风平浪静', 'soccer', 4)).toBeNull();
    expect(parseTeamLink('?mode=soccer&how=free&a=1&a=2&a=3&bn=风平浪静', 'soccer', 4)).toBeNull();
    const p = parseTeamLink('?mode=basketball&how=split&an=冰火&bn=黑白&seed=-3&src=evil', 'basketball', 2)!;
    expect(p.lineup.teams[0].members).toEqual(['冰', '火']);
    expect(p.seed).toBeNull();
    expect(p.source).toBeNull();
  });
});

describe('team kits', () => {
  it('every match gets two clearly different, non-green kits, the same for the same seed', async () => {
    const { kitsFor, kitsContrast, KITS } = await import('../src/sports/kits');
    const pairs = new Set<string>();
    for (let s = 0; s < 400; s++) {
      const [a, b] = kitsFor(s);
      expect(kitsContrast(a, b), `${a.id}/${b.id}`).toBe(true);
      expect(kitsFor(s)).toEqual([a, b]);
      pairs.add(`${a.id}/${b.id}`);
    }
    expect(pairs.size).toBeGreaterThan(20);
    for (const k of KITS) expect(k.id).not.toMatch(/green/);
    const yellow = KITS.find((k) => k.id === 'yellow')!, white = KITS.find((k) => k.id === 'white')!;
    expect(kitsContrast(yellow, white)).toBe(false);
  });
});
