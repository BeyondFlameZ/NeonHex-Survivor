import { Sound } from './audio.js';
import { Renderer } from './gl/renderer.js';
import { makeAtlas } from './gl/textures.js';
import { heroById } from './game/heroes.js';
import { Input } from './game/input.js';
import { bindModels, buildLib } from './game/models.js';
import { Run } from './game/run.js';
import { loadProfile, refreshQuests, SAVE_KEY, saveProfile, settle, type Profile } from './meta/meta.js';
import { exitApp, initNative, restoreSave } from './native.js';
import { $ } from './ui/hud.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { makePortraits } from './ui/portraits.js';
import { Showcase } from './ui/showcase.js';

export async function boot() {
  await restoreSave(SAVE_KEY);
  let p: Profile = loadProfile();
  refreshQuests(p);
  saveProfile(p);

  makePortraits();
  const canvas = $('c') as HTMLCanvasElement;
  const r = new Renderer(canvas, makeAtlas());
  bindModels(r, buildLib(r));
  const sfx = new Sound();
  const applySettings = () => {
    r.dpr = Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][p.settings.quality] ?? 1.5);
    sfx.setVolumes(p.settings.music, p.settings.sfx);
    sfx.setHaptics(p.settings.haptics);
  };
  applySettings();
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  const input = new Input($('touch'));
  const hud = new Hud();
  const show = new Showcase(r);
  show.enter();
  let run: Run | null = null;

  const start = () => {
    const hs = p.heroes[p.hero] ?? { lvl: 1, talents: [-1, -1, -1, -1, -1] };
    const h = heroById(p.hero);
    menu.hide();
    hud.show(true);
    hud.setHero(h.id, h.name, h.look.glow);
    input.reset();
    input.setAuto(true);
    run = new Run(r, input, hud, sfx, { level: p.level, tier: p.tier, hero: p.hero, heroLevel: hs.lvl, talents: hs.talents, seed: (Math.random() * 1e9) | 0 }, p.settings.numbers);
    sfx.duck(false);
    sfx.startMusic(p.level);
  };

  const toHome = () => {
    run = null;
    hud.show(false);
    show.enter();
    refreshQuests(p);
    menu.open('home');
    sfx.startMusic(5);
  };

  const menu = new Menu(p, show, {
    play: start,
    setProfile: (np) => {
      p = np;
      refreshQuests(p);
      applySettings();
    },
    settings: applySettings,
    click: () => sfx.click(),
  });

  hud.setEnd((res) => {
    const s = settle(p, res);
    window.setTimeout(() => hud.showResults(res, s, { home: toHome, again: start }), 600);
  });

  const pause = (on: boolean) => {
    if (!run || run.isOver()) return;
    run.setPaused(on);
    $('pause').hidden = !on;
  };
  $('pausebtn').addEventListener('click', () => pause(true));
  $('p-resume').addEventListener('click', () => pause(false));
  $('p-quit').addEventListener('click', () => {
    $('pause').hidden = true;
    if (run) {
      run.setPaused(false);
      run.quit();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && run && !run.isOver()) pause(!run.isPaused());
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(true);
  });

  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (run) run.frame(dt);
    else show.frame(dt, menu.offset);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  menu.open('home');
  sfx.startMusic(5);

  await initNative({
    back: () => {
      if (run && run.isOver()) toHome();
      else if (run) pause(!run.isPaused());
      else if (!menu.back()) void exitApp();
    },
  });

  // офлайн-режим и установка на домашний экран — только в опубликованной веб-версии
  if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }

  // для автотестов
  (window as unknown as { __nh: unknown }).__nh = { start, toHome, menu, get run() { return run; }, profile: () => p };
}
