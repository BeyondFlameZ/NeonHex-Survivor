import './style.css';
import { Application } from 'pixi.js';
import { COL } from './config';
import { Game } from './game';
import { Hud } from './hud';
import { Input } from './input';
import { Menu } from './menu';
import { settle } from './meta';
import { loadProfile, type Profile } from './save';

async function boot() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: COL.bg,
    antialias: false,
    autoDensity: true,
    // пиксель-арт рендерим в CSS-пикселях, браузер апскейлит без сглаживания (image-rendering: pixelated)
    resolution: 1,
    powerPreference: 'high-performance',
  });
  document.getElementById('stage')!.appendChild(app.canvas);
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const input = new Input(app.canvas);
  const hud = new Hud();
  let profile: Profile = loadProfile();
  let game: Game | null = null;
  let current = { level: 0, start: 'bolt' };

  const destroyGame = () => {
    if (!game) return;
    app.stage.removeChild(game.root);
    game.destroy();
    game = null;
  };

  const toMap = () => {
    destroyGame();
    hud.setRunVisible(false);
    menu.show('map');
  };

  const startRun = (level: number, start: string) => {
    destroyGame();
    current = { level, start };
    menu.hide();
    hud.setRunVisible(true);
    input.reset();
    game = new Game(app, input, hud, level, profile, start, (r) => {
      const s = settle(profile, r);
      hud.showResults(r, s, profile, { toMap, retry: () => startRun(level, start) });
    });
    app.stage.addChildAt(game.root, 0);
  };

  const menu = new Menu(profile, {
    play: startRun,
    setProfile: (p) => {
      profile = p;
    },
  });

  hud.bindDash(() => input.queueDash());
  hud.bindPause({
    toggle: () => game?.togglePause(),
    restart: () => startRun(current.level, current.start),
    quit: () => game?.quit(),
  });

  app.stage.addChild(input.view);
  app.ticker.add((t) => game?.frame(t.deltaMS / 1000));

  hud.setRunVisible(false);
  menu.show('title');
}

boot();
