import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/cormorant-sc/600.css';
import '@fontsource/cormorant-sc/700.css';
import './style.css';
import { Application, type Ticker } from 'pixi.js';
import { Sound } from './audio';
import { COL } from './config';
import { Game } from './game';
import { Hud } from './hud';
import { Input } from './input';
import { Menu } from './menu';
import { settle } from './meta';
import type { RunOpts } from './modes';
import { initNative, restoreSave } from './native';
import { loadProfile, SAVE_KEY, type Profile } from './save';

async function boot() {
  await restoreSave(SAVE_KEY);
  let profile: Profile = loadProfile();
  const app = new Application();
  const res = [1, 1.5, 2][profile.settings.quality] ?? 1.5;
  await app.init({
    resizeTo: window,
    background: COL.bg,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, res),
    powerPreference: 'high-performance',
  });
  document.getElementById('stage')!.appendChild(app.canvas);
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const sfx = new Sound();
  sfx.setVolumes(profile.settings.music, profile.settings.sfx);
  sfx.setHaptics(profile.settings.haptics);
  // iOS включает звук только по жесту — разблокируем на каждом касании (дёшево, если уже работает)
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  const input = new Input(app.canvas);
  const hud = new Hud();
  let game: Game | null = null;
  let current: RunOpts = { level: 0, tier: 0, endless: false, daily: null, cls: 'cyber', rift: 0 };

  const destroyGame = () => {
    if (!game) return;
    app.stage.removeChild(game.root);
    game.destroy();
    game = null;
  };

  const toMap = () => {
    destroyGame();
    hud.setRunVisible(false);
    sfx.startMusic(5);
    menu.show(current.rift ? 'rift' : current.daily ? 'title' : 'map');
  };

  const startRun = (o: RunOpts) => {
    destroyGame();
    current = o;
    menu.hide();
    hud.setRunVisible(true);
    input.reset();
    sfx.duck(false);
    sfx.startMusic(o.level);
    game = new Game(app, input, hud, sfx, o, profile, (r) => {
      const s = settle(profile, r);
      hud.showResults(r, s, profile, { toMap, retry: () => startRun(o) });
    });
    app.stage.addChildAt(game.root, 0);
  };

  const menu = new Menu(profile, {
    play: startRun,
    setProfile: (p) => {
      profile = p;
      sfx.setVolumes(p.settings.music, p.settings.sfx);
    },
    audio: () => {
      sfx.setVolumes(profile.settings.music, profile.settings.sfx);
      sfx.setHaptics(profile.settings.haptics);
    },
    click: () => sfx.click(),
  });

  hud.bindDash(() => input.queueDash());
  hud.bindUlt(() => game?.useUlt());
  hud.bindPause({
    toggle: () => game?.togglePause(),
    restart: () => startRun(current),
    quit: () => game?.quit(),
  });

  app.stage.addChild(input.view);
  app.ticker.add((t: Ticker) => game?.frame(t.deltaMS / 1000));

  hud.setRunVisible(false);
  sfx.startMusic(5);
  menu.show('title');

  // свернули приложение или вкладку — пауза
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game?.pauseIfRunning();
  });
  await initNative({
    back: () => {
      if (game?.isOver()) toMap();
      else if (game) game.togglePause();
      else menu.back();
    },
  });

  // офлайн-режим и установка на домашний экран — только на опубликованной версии
  if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}

boot();
