import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import '@shared/share/share.css';
import './ui/styles.css';
import { setAnalyticsGame } from '@shared/share/analytics';
import { GAME_SWITCHER_CSS, mountGameSwitcher } from '@shared/ui/GameSwitcher';
import { BasketRenderer } from './render/BasketRenderer';
import { initLang } from './ui/i18n';
import { initSfx } from './ui/Sfx';
import { App } from './ui/UI';

initLang();
initSfx();
setAnalyticsGame('basketball');
{
  const style = document.createElement('style');
  style.textContent = GAME_SWITCHER_CSS;
  document.head.append(style);
  const slot = document.createElement('div');
  slot.className = 'gs-slot';
  document.querySelector('.topbar .tools')?.before(slot);
  mountGameSwitcher(slot, 'basketball');
}

const stage = document.getElementById('stage')!;
let view: BasketRenderer;
try {
  view = new BasketRenderer(stage);
} catch (err) {
  console.error(err);
  stage.textContent = 'WebGL is not available in this browser.';
  throw err;
}
const app = new App(view);
void app.init().then(() => view.warmUp());
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __basket: { app, view } });
