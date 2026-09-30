import { Graphics, Sprite } from 'pixi.js';
import { CFG } from '../config';
import type { Game } from '../game';
import * as tex from '../textures';
import { BaseWeapon, F_NOFX, F_NOKB, F_NONUM, type WeaponDef } from './types';

const PX = CFG.px;
const TAU = Math.PI * 2;

// ---------- pyre.bat — огненные мины ----------

interface Mine {
  x: number;
  y: number;
  arm: number;
  life: number;
  cluster: boolean;
  s: Sprite;
}

class Pyre extends BaseWeapon {
  private mines: Mine[] = [];
  private free: Sprite[] = [];

  constructor(def: WeaponDef, g: Game) {
    super(def, g);
    const t = tex.mineTex();
    for (let k = 0; k < 48; k++) {
      const s = new Sprite(t);
      s.anchor.set(0.5);
      s.scale.set(PX);
      s.visible = false;
      g.layerGround.addChild(s);
      this.free.push(s);
    }
  }

  private place(x: number, y: number, arm: number, life: number, cluster: boolean) {
    const s = this.free.pop();
    if (!s) return;
    s.visible = true;
    s.position.set(Math.round(x), Math.round(y));
    s.scale.set(cluster ? PX * 0.75 : PX);
    this.mines.push({ x, y, arm, life, cluster, s });
  }

  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cooldown(1.6);
      const count = 2 + this.lv(2) + this.lv(5) + 2 * this.lv(7) + g.amount();
      for (let k = 0; k < count; k++) {
        const a = Math.random() * TAU;
        const d = 50 + Math.random() * 100;
        this.place(g.px + Math.cos(a) * d, g.py + Math.sin(a) * d, 0.35, 4, false);
      }
    }

    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.arm -= dt;
      m.life -= dt;
      const armed = m.arm <= 0;
      m.s.alpha = armed ? (((g.time * 8) | 0) & 1 ? 1 : 0.55) : 0.5;
      if ((armed && g.anyIn(m.x, m.y, 20)) || m.life <= 0) {
        this.mines.splice(i, 1);
        m.s.visible = false;
        this.free.push(m.s);
        this.explode(m);
      }
    }
  }

  private explode(m: Mine) {
    const g = this.g;
    const k = m.cluster ? 0.6 : 1;
    const r = 48 * (1 + 0.25 * this.lv(3)) * g.areaMul() * k;
    const dmg = this.dmg(18 * (1 + 0.3 * this.lv(4)) * (1 + 0.4 * this.lv(8))) * (m.cluster ? 0.5 : 1);
    const burnSec = 2 * (this.lv(6) ? 2 : 1) * g.durMul();
    g.aoe(m.x, m.y, r, dmg, this.elem, 0, (j) => g.burn(j, burnSec, dmg * 0.3));
    g.impact(m.x, m.y, this.color, PX * (m.cluster ? 2 : 3));
    g.flash(m.x, m.y, r * 2.2, 1, this.color, 0.18);
    g.addShake(m.cluster ? 1 : 2.5);

    if (this.evolved && !m.cluster) {
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * TAU + Math.random() * 0.5;
        this.place(m.x + Math.cos(a) * r * 0.8, m.y + Math.sin(a) * r * 0.8, 0, 0.18 + q * 0.06, true);
      }
      g.zone(m.x, m.y, r * 0.8, 2.5 * g.durMul(), dmg * 0.5, this.elem, this.color);
    }
  }
}

export const PYRE: WeaponDef = {
  id: 'pyre',
  school: 'pyro',
  name: 'pyre.bat',
  tag: 'PYR',
  desc: 'Раскидывает вокруг мины, взрыв поджигает врагов',
  perks: [
    '+1 мина',
    'Радиус взрыва +25%',
    'Урон +30%',
    '+1 мина',
    'Горение длится вдвое дольше',
    '+2 мины',
    'Урон +40%',
  ],
  evo: { name: 'napalm.bat', desc: 'Кластерные мины: каждая разбрасывает ещё 4 и оставляет лужу огня' },
  make: (g) => new Pyre(PYRE, g),
};

// ---------- laser.cfg — плазменный луч ----------

class Laser extends BaseWeapon {
  private targets = [-1, -1];
  private hold = [0, 0];
  private acc = [0, 0];
  private tick = 0;
  private numT = 0;
  // орбитальный режим
  private ox = 0;
  private oy = 0;
  private retarget = 0;
  private tx = 0;
  private ty = 0;
  private placed = false;

  private range() {
    return 260 * (1 + 0.25 * this.lv(3)) * this.g.areaMul();
  }

  private dps() {
    return this.dmg(20 * (1 + 0.25 * this.lv(2)) * (1 + 0.3 * this.lv(6)));
  }

  update(dt: number) {
    if (this.evolved) {
      this.orbital(dt);
      return;
    }
    const g = this.g;
    const f = g.enemies.f;
    const range = this.range();
    const beams = 1 + this.lv(7);

    for (let b = 0; b < 2; b++) {
      if (b >= beams) {
        this.targets[b] = -1;
        continue;
      }
      let t = this.targets[b];
      const ok = t >= 0 && t < g.enemies.n && f.hp[t] > 0 && Math.hypot(f.x[t] - g.px, f.y[t] - g.py) < range;
      if (!ok) {
        t = g.strongest(g.px, g.py, range, this.targets[1 - b]);
        this.targets[b] = t;
        this.hold[b] = 0;
      }
      if (t >= 0) this.hold[b] += dt * (this.lv(4) ? 2 : 1);
    }

    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.1;
    const base = this.dps() * 0.1;
    this.numT -= 0.1;
    const showNum = this.numT <= 0;
    if (showNum) this.numT = 0.3;

    for (let b = 0; b < beams; b++) {
      const t = this.targets[b];
      if (t < 0) continue;
      const ramp = Math.min(3, 1 + 0.4 * this.hold[b]);
      const d = base * ramp;
      const dx = f.x[t] - g.px;
      const dy = f.y[t] - g.py;
      const l = Math.hypot(dx, dy) || 1;
      g.hit(t, d, dx / l, dy / l, this.elem, F_NOFX | F_NONUM | F_NOKB);
      this.acc[b] += d;
      if (showNum) {
        g.number(f.x[t], f.y[t] - 18, this.acc[b], false);
        this.acc[b] = 0;
        g.spark(f.x[t], f.y[t] - 6, (Math.random() - 0.5) * 120, -80, 0.2, this.color);
      }
      if (this.lv(5)) {
        g.segment(g.px, g.py, f.x[t], f.y[t], 6, (j) => {
          if (j !== t) g.hit(j, d * 0.5, dx / l, dy / l, this.elem, F_NOFX | F_NONUM | F_NOKB);
        });
      }
      if (this.lv(8)) g.burn(t, 1.5, this.dps() * 0.3);
    }
  }

  private orbital(dt: number) {
    const g = this.g;
    if (!this.placed) {
      this.ox = g.px;
      this.oy = g.py;
      this.tx = g.px;
      this.ty = g.py;
      this.placed = true;
    }
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.5;
      const j = g.densest();
      if (j >= 0) {
        this.tx = g.enemies.f.x[j];
        this.ty = g.enemies.f.y[j];
      } else {
        this.tx = g.px;
        this.ty = g.py;
      }
    }
    const dx = this.tx - this.ox;
    const dy = this.ty - this.oy;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, 150 * dt);
    if (d > 0.01) {
      this.ox += (dx / d) * step;
      this.oy += (dy / d) * step;
    }

    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.1;
    const r = 46 * g.areaMul();
    g.aoe(this.ox, this.oy, r, this.dps() * 0.15, this.elem, F_NOFX | F_NONUM | F_NOKB, (j) =>
      g.burn(j, 1.5, this.dps() * 0.3),
    );
    g.spark(this.ox + (Math.random() - 0.5) * r, this.oy + (Math.random() - 0.5) * r * 0.5, 0, -120, 0.3, this.color);
    g.flash(this.ox, this.oy, 140, 0.5, this.color, 0.12);
  }

  draw(fx: Graphics, ground: Graphics) {
    const g = this.g;
    if (this.evolved) {
      if (!this.placed) return;
      const r = 46 * g.areaMul();
      const wob = Math.sin(g.time * 30) * 2;
      g.light(this.ox, this.oy, 220, 1.2, this.color);
      ground.circle(this.ox, this.oy, r).fill({ color: this.color, alpha: 0.18 });
      ground.circle(this.ox, this.oy, r).stroke({ width: 2, color: this.color, alpha: 0.6 });
      fx.rect(this.ox - 12 - wob, this.oy - 520, 24 + wob * 2, 520).fill({ color: this.color, alpha: 0.35 });
      fx.rect(this.ox - 4, this.oy - 520, 8, 520).fill({ color: 0xfff3c0, alpha: 0.9 });
      return;
    }
    const f = g.enemies.f;
    for (let b = 0; b < 2; b++) {
      const t = this.targets[b];
      if (t < 0 || t >= g.enemies.n || f.hp[t] <= 0) continue;
      const ramp = Math.min(3, 1 + 0.4 * this.hold[b]);
      const w = 3 + ramp * 1.5 + Math.random() * 1.5;
      g.light(f.x[t], f.y[t], 110, 0.6 + ramp * 0.2, this.color);
      fx.moveTo(g.px, g.py - 8).lineTo(f.x[t], f.y[t] - 6).stroke({ width: w, color: this.color, alpha: 0.4 });
      fx.moveTo(g.px, g.py - 8).lineTo(f.x[t], f.y[t] - 6).stroke({ width: 1.5, color: 0xfff3c0, alpha: 0.95 });
    }
  }
}

export const LASER: WeaponDef = {
  id: 'laser',
  school: 'pyro',
  name: 'laser.cfg',
  tag: 'LSR',
  desc: 'Луч держит самого живучего врага рядом, урон растёт, пока цель в луче',
  perks: [
    'Урон +25%',
    'Дальность +25%',
    'Луч разогревается вдвое быстрее',
    'Луч прожигает всех на линии до цели',
    'Урон +30%',
    'Второй луч по следующей цели',
    'Луч поджигает',
  ],
  evo: { name: 'orbital_laser.cfg', desc: 'Столб плазмы с орбиты сам ползёт к самой плотной толпе' },
  make: (g) => new Laser(LASER, g),
};

// ---------- firewall.sys — огненный вихрь ----------

class Firewall extends BaseWeapon {
  private active = 0;
  private ang = 0;
  private tick = 0;

  private radius() {
    return 60 * (1 + 0.2 * this.lv(3)) * (1 + 0.2 * this.lv(7)) * this.g.areaMul() * (this.evolved ? 1.4 : 1);
  }

  update(dt: number) {
    const g = this.g;
    if (this.evolved) {
      this.active = 1;
    } else if (this.active > 0) {
      this.active -= dt;
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.active = (4 + 2 * this.lv(2)) * g.durMul();
        this.timer = this.cooldown(10 * (this.lv(5) ? 0.75 : 1));
        g.impact(g.px, g.py, this.color, PX * 3);
        g.flash(g.px, g.py, 200, 1, this.color, 0.3);
      }
    }
    if (this.active <= 0) return;

    this.ang += dt * 6;
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.2;

    const r = this.radius();
    const d = this.dmg(25 * (1 + 0.3 * this.lv(4)) * (1 + 0.4 * this.lv(8))) * 0.2;
    const kills = g.aoe(g.px, g.py, r, d, this.elem, F_NOFX | F_NONUM, (j) => {
      if (this.lv(6)) g.burn(j, 2 * g.durMul(), d * 1.5);
    });
    if (this.evolved && kills > 0) g.heal(kills);

    for (let k = 0; k < 6; k++) {
      const a = this.ang + (k / 6) * TAU;
      const x = g.px + Math.cos(a) * r;
      const y = g.py + Math.sin(a) * r * 0.9;
      g.spark(x, y, -Math.sin(a) * 140, Math.cos(a) * 140 - 30, 0.3, k & 1 ? this.color : 0xffd24a);
    }
  }

  draw(_fx: Graphics, ground: Graphics) {
    if (this.active <= 0) return;
    const g = this.g;
    const r = this.radius();
    const pulse = 0.12 + Math.sin(g.time * 10) * 0.04;
    g.light(g.px, g.py, r * 1.8, 0.9, this.color);
    ground.circle(g.px, g.py, r).fill({ color: this.color, alpha: pulse });
    ground.circle(g.px, g.py, r).stroke({ width: 2, color: 0xffd24a, alpha: 0.55 });
  }
}

export const FIREWALL: WeaponDef = {
  id: 'firewall',
  school: 'pyro',
  name: 'firewall.sys',
  tag: 'FWL',
  desc: 'Раз в 10 секунд вокруг мага на 4 секунды закручивается огненный вихрь',
  perks: [
    'Вихрь длится на 2 секунды дольше',
    'Радиус +20%',
    'Урон +30%',
    'Перезарядка −25%',
    'Вихрь поджигает',
    'Радиус +20%',
    'Урон +40%',
  ],
  evo: { name: 'aegis.sys', desc: 'Вихрь горит постоянно, он шире и лечит 1 HP за каждое убийство' },
  make: (g) => new Firewall(FIREWALL, g),
};

// ---------- meteor.sh — метеоры ----------

interface Fall {
  x: number;
  y: number;
  t: number;
  max: number;
  s: Sprite;
}

class Meteor extends BaseWeapon {
  private falls: Fall[] = [];
  private free: Sprite[] = [];
  private rain = 0;

  constructor(def: WeaponDef, g: Game) {
    super(def, g);
    const t = tex.meteorTex();
    for (let k = 0; k < 24; k++) {
      const s = new Sprite(t);
      s.anchor.set(0.5);
      s.scale.set(PX * 1.5);
      s.visible = false;
      g.layerFx.addChild(s);
      this.free.push(s);
    }
  }

  private radius() {
    return 56 * (1 + 0.25 * this.lv(5)) * this.g.areaMul();
  }

  private drop(x: number, y: number) {
    const s = this.free.pop();
    if (!s) return;
    s.visible = true;
    this.falls.push({ x, y, t: 0.7, max: 0.7, s });
  }

  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer <= 0 && g.enemies.n > 0) {
      this.timer = this.cooldown(3.5 * (this.lv(7) ? 0.75 : 1));
      const count = 1 + this.lv(2) + this.lv(6) + g.amount();
      for (let k = 0; k < count; k++) {
        const j = g.randomInView();
        if (j >= 0) this.drop(g.enemies.f.x[j], g.enemies.f.y[j]);
      }
    }
    if (this.evolved) {
      this.rain -= dt;
      if (this.rain <= 0) {
        this.rain = 0.4;
        this.drop(g.px + (Math.random() * 2 - 1) * g.viewHW, g.py + (Math.random() * 2 - 1) * g.viewHH);
      }
    }

    for (let i = this.falls.length - 1; i >= 0; i--) {
      const m = this.falls[i];
      m.t -= dt;
      const k = Math.max(0, m.t / m.max);
      m.s.position.set(Math.round(m.x + k * 160), Math.round(m.y - k * 460));
      if ((g.time * 60) % 2 < 1) g.spark(m.s.x, m.s.y, 40, -60, 0.25, this.color);
      if (m.t > 0) continue;

      this.falls.splice(i, 1);
      m.s.visible = false;
      this.free.push(m.s);

      const r = this.radius();
      const dmg = this.dmg(40 * (1 + 0.3 * this.lv(3)) * (1 + 0.5 * this.lv(8)));
      g.aoe(m.x, m.y, r, dmg, this.elem, 0, (j) => g.burn(j, 2 * g.durMul(), dmg * 0.2));
      g.impact(m.x, m.y, this.color, PX * 4);
      g.flash(m.x, m.y, r * 3, 1.3, this.color, 0.3);
      g.addShake(5);
      g.stop(0.04);
      for (let q = 0; q < 10; q++) {
        const a = Math.random() * TAU;
        const v = 120 + Math.random() * 200;
        g.spark(m.x, m.y, Math.cos(a) * v, Math.sin(a) * v, 0.35, q & 1 ? this.color : 0xffd24a);
      }
      if (this.lv(4)) g.zone(m.x, m.y, r * 0.8, 2 * g.durMul(), dmg * 0.4, this.elem, this.color);
    }
  }

  draw(_fx: Graphics, ground: Graphics) {
    const r = this.radius();
    for (const m of this.falls) {
      const p = 1 - m.t / m.max;
      this.g.light(m.s.x, m.s.y, 120, 0.9, this.color);
      ground.circle(m.x, m.y, r).stroke({ width: 2, color: 0xff2d55, alpha: 0.4 + p * 0.5 });
      ground.circle(m.x, m.y, r * p).fill({ color: 0xff2d55, alpha: 0.18 });
    }
  }
}

export const METEOR: WeaponDef = {
  id: 'meteor',
  school: 'pyro',
  name: 'meteor.sh',
  tag: 'MTR',
  desc: 'Метеор падает в толпу с предупреждающим кругом, взрыв поджигает',
  perks: [
    '+1 метеор',
    'Урон +30%',
    'Оставляет лужу огня на 2 секунды',
    'Радиус +25%',
    '+1 метеор',
    'Перезарядка −25%',
    'Урон +50%',
  ],
  evo: { name: 'armageddon.sh', desc: 'Постоянный метеоритный дождь по всему экрану' },
  make: (g) => new Meteor(METEOR, g),
};
