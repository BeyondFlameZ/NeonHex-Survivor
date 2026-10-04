import { Renderer } from '../gl/renderer.js';
import { CELL, makeAtlas } from '../gl/textures.js';
import { HEROES } from '../game/heroes.js';
import { bindModels, buildLib, drawHero, rgb } from '../game/models.js';

// Портреты героев рендерятся тем же 3D-движком в отдельный холст и сохраняются картинками
export const PORTRAIT: Record<string, string> = {};

export function makePortraits() {
  try {
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 192;
    c.dataset.keep = '1';
    const r = new Renderer(c, makeAtlas());
    r.fixedSize = true;
    bindModels(r, buildLib(r));
    r.clear = [0.07, 0.11, 0.2];
    r.fog = [0.07, 0.11, 0.2];
    r.fogRange = [40, 80];
    for (const h of HEROES) {
      r.cam.x = 0;
      r.cam.y = 1.3;
      r.cam.z = 0;
      r.cam.dist = 3.1;
      r.cam.pitch = 0.18;
      r.cam.yaw = 0.25;
      r.cam.fov = 0.6;
      r.begin();
      const g = rgb(h.look.glow);
      r.sprite(3, CELL.glow, 0, 1.3, -1.5, 5, g[0], g[1], g[2], 0.35);
      drawHero(h.look, 0, 0, 0.25, { t: 0.4, move: 0, aim: 0.25, hit: 0, phase: 0 });
      r.end();
      PORTRAIT[h.id] = c.toDataURL('image/png');
    }
    r.gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // нет WebGL — останутся буквы
  }
}
