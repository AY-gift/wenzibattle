import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import '@shared/share/share.css';
import './ui/styles.css';
import { ArenaRenderer } from './render/ArenaRenderer';
import { App } from './ui/UI';
import { initLang } from './ui/i18n';
import { initSfx } from './ui/Sfx';
import { setAnalyticsGame } from '@shared/share/analytics';
import { GAME_SWITCHER_CSS, mountGameSwitcher } from '@shared/ui/GameSwitcher';

initLang();
setAnalyticsGame('arena');
// Arena / Soccer / Basketball switcher in the top bar (shared by all Glyph games).
{
  const style = document.createElement('style');
  style.textContent = GAME_SWITCHER_CSS;
  document.head.append(style);
  const slot = document.createElement('div');
  slot.className = 'gs-slot';
  document.querySelector('.topbar .tools')?.before(slot);
  mountGameSwitcher(slot, 'arena');
}
initSfx();

const stage = document.getElementById('stage')!;
let arena: ArenaRenderer;
try {
  arena = new ArenaRenderer(stage);
} catch (err) {
  console.error(err);
  stage.textContent = 'WebGL is not available in this browser.';
  throw err;
}
const app = new App(arena);
void app.init();
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __glyph: { app, arena } });
