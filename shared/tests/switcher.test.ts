import { describe, expect, it } from 'vitest';
import { gameUrl } from '../src/ui/GameSwitcher';

const loc = (href: string) => {
  const u = new URL(href);
  return { href, hostname: u.hostname, protocol: u.protocol };
};

describe('game switcher links', () => {
  it('points at sibling folders when deployed', () => {
    expect(gameUrl('soccer', 'arena', loc('https://ex.com/arena/?a=%E7%81%AB'), false)).toBe('https://ex.com/soccer/');
    expect(gameUrl('basketball', 'arena', loc('https://ex.com/games/arena/index.html'), false)).toBe('https://ex.com/games/basketball/');
    expect(gameUrl('arena', 'soccer', loc('https://ex.com/soccer/'), false)).toBe('https://ex.com/arena/');
  });

  it('uses each game’s own port in development', () => {
    expect(gameUrl('soccer', 'arena', loc('http://localhost:5173/?debug'), true)).toBe('http://localhost:5174/');
    expect(gameUrl('basketball', 'arena', loc('http://127.0.0.1:5173/'), true)).toBe('http://127.0.0.1:5175/');
  });
});
