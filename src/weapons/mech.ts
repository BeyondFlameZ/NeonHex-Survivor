import { Sprite } from 'pixi.js';
import { CFG, COL } from '../config';
import type { Game } from '../game';
import * as tex from '../textures';
import { BaseWeapon, type WeaponDef } from './types';

const PX = CFG.px;
const TAU = Math.PI * 2;

// ---------- orbit.drv — дроны-хранители ----------

class Orbit extends BaseWeapon {
  private sprites: Sprite[] = [];
  private ang = 0;
  private pulse = 2;

  constructor(def: WeaponDef, g: Game) {
    super(def, g);
    const t = tex.droneTex();
    for (let k = 0; k < 8; k++) {
      const s = new Sprite(t);
      s.anchor.set(0.5);
      s.scale.set(PX);
      s.visible = false;
      g.layerFx.addChild(s);
      this.sprites.push(s);
    }
  }

  update(dt: number) {
    const g = this.g;
    const n = Math.min(8, 1 + this.lv(2) + this.lv(4) + this.lv(6) + (this.evolved ? 2 : 0));
    const R = CFG.drone.orbit * (1 + 0.25 * this.lv(5)) * g.areaMul();
    const dr = CFG.drone.radius;
    const dmg = this.dmg(10 * (1 + 0.3 * this.lv(3)) * (1 + 0.4 * this.lv(8)));
    this.ang += dt * 2.8 * (1 + 0.3 * this.lv(7)) * g.speedMul();

    const f = g.enemies.f;
    for (let k = 0; k < this.sprites.length; k++) {
      const s = this.sprites[k];
      s.visible = k < n;
      if (k >= n) continue;
      const a = this.ang + (k / n) * TAU;
      const x = g.px + Math.cos(a) * R;
      const y = g.py + Math.sin(a) * R;
      s.position.set(Math.round(x), Math.round(y));
      if (((g.time * 60) | 0) % 4 === k % 4) g.spark(x, y, 0, 0, 0.2, COL.crystal);

      g.forEachIn(x, y, dr, (j) => {
        if (f.dcd[j] > 0) return;
        const lx = f.x[j] - g.px;
        const ly = f.y[j] - g.py;
        const l = Math.hypot(lx, ly) || 1;
        g.hit(j, dmg, lx / l, ly / l, this.elem);
        f.dcd[j] = 0.35;
      });
    }

    if (this.evolved) {
      this.pulse -= dt;
      if (this.pulse <= 0) {
        this.pulse = 2;
        g.aoe(g.px, g.py, R + 30, dmg * 1.5, this.elem);
        g.impact(g.px, g.py, COL.crystal, PX * 5);
        g.flash(g.px, g.py, R * 2.5, 1, COL.crystal, 0.25);
      }
    }
  }

  draw() {
    for (const s of this.sprites) if (s.visible) this.g.light(s.x, s.y, 80, 0.7, COL.crystal);
  }
}

export const ORBIT: WeaponDef = {
  id: 'orbit',
  school: 'mech',
  name: 'orbit.drv',
  tag: 'ORB',
  desc: 'Дрон-хранитель кружит вокруг и режет всех, кого задевает',
  perks: [
    '+1 дрон',
    'Урон +30%',
    '+1 дрон',
    'Радиус орбиты +25%',
    '+1 дрон',
    'Дроны вращаются на 30% быстрее',
    'Урон +40%',
  ],
  evo: { name: 'halo.sys', desc: '+2 дрона, каждые 2 секунды кольцо бьёт волной во все стороны' },
  make: (g) => new Orbit(ORBIT, g),
};
