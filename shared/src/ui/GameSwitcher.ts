/**
 * The bar at the top of every Glyph game for switching between Arena / Soccer / Basketball.
 *
 * Deployed, the games are sibling folders on one site (…/arena/, …/soccer/, …/basketball/),
 * so links are relative ("../soccer/") and the language choice carries over (same origin,
 * same localStorage key). In development each game runs its own Vite server on its own port.
 */
import { getLang, onLangChange, type Lang } from '../i18n';

export type GameId = 'arena' | 'soccer' | 'basketball';

export interface GameInfo {
  id: GameId;
  icon: string;
  name: Record<Lang, string>;
  /** Dev server port (vite.config.ts of that game). */
  devPort: number;
  /** false → shown as "coming soon" and not clickable. Flip when the game ships. */
  ready: boolean;
}

export const GAMES: GameInfo[] = [
  { id: 'arena', icon: '🥊', name: { ja: 'アリーナ', zh: '擂台', en: 'Arena' }, devPort: 5173, ready: true },
  { id: 'soccer', icon: '⚽', name: { ja: 'サッカー 4v4', zh: '足球 4v4', en: 'Soccer 4v4' }, devPort: 5174, ready: true },
  { id: 'basketball', icon: '🏀', name: { ja: 'バスケ 2v2', zh: '篮球 2v2', en: 'Basketball 2v2' }, devPort: 5175, ready: true },
];

const SOON: Record<Lang, string> = { ja: '準備中', zh: '即将推出', en: 'Soon' };

/** Where another game lives, relative to the current one. */
export function gameUrl(target: GameId, current: GameId, loc: Pick<Location, 'href' | 'hostname' | 'protocol'> = location, dev = !!import.meta.env?.DEV): string {
  const info = GAMES.find((g) => g.id === target)!;
  if (dev && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1')) return `${loc.protocol}//${loc.hostname}:${info.devPort}/`;
  // …/arena/index.html?x → …/soccer/
  const here = new URL(loc.href);
  const path = here.pathname.replace(/[^/]*$/, '');
  const re = new RegExp(`/${current}/$`);
  const base = re.test(path) ? path.replace(re, '/') : path.replace(/[^/]+\/$/, '');
  return new URL(`${base}${target}/`, here.origin).toString();
}

/** Insert the switcher into `host` (e.g. the game's top bar). */
export function mountGameSwitcher(host: HTMLElement, current: GameId): void {
  const nav = document.createElement('nav');
  nav.className = 'game-switcher';
  nav.setAttribute('aria-label', 'Games');
  const render = () => {
    const lang = getLang();
    nav.replaceChildren();
    for (const g of GAMES) {
      const el = document.createElement(g.ready && g.id !== current ? 'a' : 'span');
      el.className = `gs-item${g.id === current ? ' active' : ''}${g.ready ? '' : ' soon'}`;
      const icon = document.createElement('span');
      icon.className = 'gs-icon';
      icon.textContent = g.icon;
      const label = document.createElement('span');
      label.className = 'gs-label';
      label.textContent = g.name[lang];
      el.append(icon, label);
      if (!g.ready) {
        const soon = document.createElement('small');
        soon.textContent = SOON[lang];
        el.append(soon);
      }
      if (el instanceof HTMLAnchorElement) el.href = gameUrl(g.id, current);
      if (g.id === current) el.setAttribute('aria-current', 'page');
      nav.append(el);
    }
  };
  render();
  onLangChange(render);
  host.append(nav);
}

/** Minimal styles so every game gets the same bar (each game may restyle). */
export const GAME_SWITCHER_CSS = `
.game-switcher { display: flex; gap: 4px; padding: 3px; border-radius: 99px; background: rgba(255,255,255,0.72); box-shadow: 0 4px 14px rgba(60,30,110,0.15); }
.gs-item { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 99px; font: 800 12px/1 "M PLUS Rounded 1c", system-ui, sans-serif; color: #2b1a4a; text-decoration: none; white-space: nowrap; }
a.gs-item:hover { background: rgba(122,92,255,0.12); }
.gs-item.active { background: #ff4f8b; color: #fff; }
.gs-item.soon { opacity: 0.55; cursor: default; }
.gs-item small { font-size: 9px; font-weight: 700; opacity: 0.8; }
.gs-icon { font-size: 14px; }
@media (max-width: 560px) { .gs-label, .gs-item small { display: none; } .gs-item { padding: 5px 8px; } }
`;
