import './style.css';
import { Application } from 'pixi.js';
import { COL } from './config';
import { Game } from './game';
import { Hud } from './hud';
import { Input } from './input';

async function boot() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: COL.bg,
    antialias: false,
    autoDensity: true,
    // пиксель-арт рендерим в CSS-пикселях, браузер апскейлит без сглаживания (image-rendering: pixelated).
    // Картинка остаётся чёткой, а bloom на весь экран становится в 4 раза дешевле.
    resolution: 1,
    powerPreference: 'high-performance',
  });
  document.getElementById('stage')!.appendChild(app.canvas);
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const input = new Input(app.canvas);
  const hud = new Hud();
  hud.bindDash(() => input.queueDash());
  const game = new Game(app, input, hud);
  app.stage.addChild(game.root, input.view);
  app.ticker.add((t) => game.frame(t.deltaMS / 1000));
}

boot();
