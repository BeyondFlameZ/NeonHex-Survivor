import { Graphics, Sprite } from 'pixi.js';
import { CFG, COL } from '../config';
import type { Game } from '../game';
import * as tex from '../textures';
import { BaseWeapon, F_NOFX, F_NONUM, type WeaponDef } from './types';

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

// ---------- turret.deploy — стационарные турели ----------

interface Turret {
  x: number;
  y: number;
  life: number;
  cd: number;
  s: Sprite;
}

class TurretW extends BaseWeapon {
  private turrets: Turret[] = [];
  private free: Sprite[] = [];
  private gridTick = 0;

  constructor(def: WeaponDef, g: Game) {
    super(def, g);
    for (let k = 0; k < 6; k++) {
      const s = new Sprite(tex.turretTex());
      s.anchor.set(0.5, 0.8);
      s.scale.set(PX);
      s.visible = false;
      g.layerGround.addChild(s);
      this.free.push(s);
    }
  }

  private cap() {
    return 1 + this.lv(3) + this.lv(6) + (this.evolved ? 1 : 0);
  }

  update(dt: number) {
    const g = this.g;
    const f = g.enemies.f;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cooldown(8);
      if (this.turrets.length >= this.cap()) {
        const old = this.turrets.shift()!;
        old.s.visible = false;
        this.free.push(old.s);
      }
      const s = this.free.pop();
      if (s) {
        const a = Math.random() * TAU;
        const x = g.px + Math.cos(a) * 40;
        const y = g.py + Math.sin(a) * 40;
        s.visible = true;
        s.position.set(Math.round(x), Math.round(y));
        this.turrets.push({ x, y, life: this.evolved ? 1e9 : (10 + 5 * this.lv(5)) * g.durMul(), cd: 0, s });
        g.impact(x, y, this.color, PX * 3);
      }
    }

    const dmg = this.dmg(10 * (1 + 0.3 * this.lv(2)) * (1 + 0.4 * this.lv(8)));
    const rate = 0.5 / (1 + 0.3 * this.lv(4)) / (g.setCount('mech') >= 4 && g.mechActive() ? 2 : 1);
    for (let k = this.turrets.length - 1; k >= 0; k--) {
      const t = this.turrets[k];
      t.life -= dt;
      if (t.life <= 0) {
        t.s.visible = false;
        this.free.push(t.s);
        this.turrets.splice(k, 1);
        continue;
      }
      t.cd -= dt;
      if (t.cd > 0) continue;
      const j = g.nearest(t.x, t.y, 300);
      if (j < 0) continue;
      t.cd = rate;
      const dx = f.x[j] - t.x;
      const dy = f.y[j] - t.y;
      const d = Math.hypot(dx, dy) || 1;
      const v = 460 * g.speedMul();
      g.shoot(t.x, t.y - 10, (dx / d) * v, (dy / d) * v, dmg, this.lv(7), this.elem, 0, 1);
      g.impact(t.x + (dx / d) * 8, t.y - 10 + (dy / d) * 8, this.color, PX);
    }

    if (this.evolved && this.turrets.length > 1) {
      this.gridTick -= dt;
      if (this.gridTick <= 0) {
        this.gridTick = 0.2;
        for (let k = 0; k < this.turrets.length; k++) {
          const a = this.turrets[k];
          const b = this.turrets[(k + 1) % this.turrets.length];
          g.segment(a.x, a.y - 10, b.x, b.y - 10, 6, (j) => g.hit(j, dmg * 0.4, 0, 0, this.elem, F_NOFX | F_NONUM | 4));
        }
      }
    }
  }

  draw(fx: Graphics) {
    const g = this.g;
    for (const t of this.turrets) g.light(t.x, t.y - 10, 70, 0.5, this.color);
    if (this.evolved && this.turrets.length > 1) {
      for (let k = 0; k < this.turrets.length; k++) {
        const a = this.turrets[k];
        const b = this.turrets[(k + 1) % this.turrets.length];
        fx.moveTo(a.x, a.y - 10).lineTo(b.x, b.y - 10).stroke({ width: 2, color: this.color, alpha: 0.6 + Math.sin(g.time * 20) * 0.2 });
      }
    }
  }
}

export const TURRET: WeaponDef = {
  id: 'turret',
  school: 'mech',
  name: 'turret.deploy',
  tag: 'TUR',
  desc: 'Ставит турель, которая сама расстреливает ближайших врагов',
  perks: ['Урон +30%', '+1 турель одновременно', 'Скорострельность +30%', 'Турели работают на 5 секунд дольше', '+1 турель одновременно', 'Снаряды пробивают 1 врага', 'Урон +40%'],
  evo: { name: 'fortress.deploy', desc: 'Турели бессрочные, а между ними натянута режущая лазерная сетка' },
  make: (g) => new TurretW(TURRET, g),
};

// ---------- mech.suit — трансформация в меха ----------

class MechSuit extends BaseWeapon {
  private pulse = 0;
  private salvo = 0;

  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer <= 0 && !g.mechActive()) {
      this.timer = this.cooldown(this.evolved ? 8 : 16 * (this.lv(4) ? 0.8 : 1));
      g.setMech((5 + this.lv(2) + 2 * this.lv(7) + (this.evolved ? 1 : 0)) * g.durMul());
      if (this.lv(6)) {
        g.aoe(g.px, g.py, 120 * g.areaMul(), this.dmg(40), this.elem);
        g.flash(g.px, g.py, 300, 1.3, this.color, 0.3);
      }
    }
    if (!g.mechActive()) return;

    const dmg = this.dmg(14 * (1 + 0.3 * this.lv(3)) * (1 + 0.5 * this.lv(8)));
    this.pulse -= dt;
    if (this.pulse <= 0) {
      this.pulse = 0.2;
      g.aoe(g.px, g.py, 36 * (1 + 0.3 * this.lv(5)) * g.areaMul(), dmg * 0.4, this.elem, F_NONUM);
    }
    if (this.evolved) {
      this.salvo -= dt;
      if (this.salvo <= 0) {
        this.salvo = 1;
        const n = 10;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + g.time;
          g.shoot(g.px, g.py - 10, Math.cos(a) * 380, Math.sin(a) * 380, dmg, 1, this.elem, 24, 1.2);
        }
      }
    }
  }

  onDash() {
    const g = this.g;
    if (!g.mechActive()) return;
    const R = 70 * (1 + 0.3 * this.lv(5)) * g.areaMul();
    g.aoe(g.px + g.aimX * 40, g.py + g.aimY * 40, R, this.dmg(50 * (1 + 0.3 * this.lv(3))), this.elem);
    g.impact(g.px + g.aimX * 40, g.py + g.aimY * 40, this.color, PX * 4);
    g.addShake(5);
    g.stop(0.05);
  }

  draw() {
    const g = this.g;
    if (g.mechActive()) g.light(g.px, g.py, 160, 0.8, COL.gold);
  }
}

export const MECHSUIT: WeaponDef = {
  id: 'mechsuit',
  school: 'mech',
  name: 'mech.suit',
  tag: 'MCH',
  desc: 'Раз в 16 секунд надеваешь боевой мех: неуязвимость, скорость и урон вокруг. Рывок в мехе — таран',
  perks: ['Мех держится на 1 секунду дольше', 'Урон +30%', 'Перезарядка −20%', 'Радиус урона и тарана +30%', 'Вход в режим бьёт ударной волной', 'Мех держится на 2 секунды дольше', 'Урон +50%'],
  evo: { name: 'titan.suit', desc: 'Трансформация каждые 8 секунд, мех каждую секунду выпускает ракетный залп' },
  make: (g) => new MechSuit(MECHSUIT, g),
};

// ---------- railgun.mod — рельсотрон через весь экран ----------

interface Beam {
  x: number;
  y: number;
  a: number;
  life: number;
}

class Railgun extends BaseWeapon {
  private charge = -1;
  private aim = 0;
  private beams: Beam[] = [];
  private queued = 0;

  private width() {
    return 10 * (1 + 0.5 * this.lv(4)) * this.g.areaMul();
  }

  private fire(a: number) {
    const g = this.g;
    const len = 1400;
    const x1 = g.px + Math.cos(a) * len;
    const y1 = g.py + Math.sin(a) * len;
    const dmg = this.dmg(60 * (1 + 0.3 * this.lv(2)) * (1 + 0.3 * this.lv(7)));
    g.segment(g.px, g.py - 6, x1, y1, this.width(), (j) => {
      g.hit(j, dmg, Math.cos(a), Math.sin(a), this.elem);
      if (this.lv(8)) g.stun(j, 0.5);
    });
    this.beams.push({ x: g.px, y: g.py - 6, a, life: 0.2 });
    g.flash(g.px, g.py, 200, 1.2, this.color, 0.15);
    g.addShake(4);
    g.stop(0.03);
  }

  update(dt: number) {
    const g = this.g;
    const f = g.enemies.f;
    for (let k = this.beams.length - 1; k >= 0; k--) {
      this.beams[k].life -= dt;
      if (this.beams[k].life <= 0) this.beams.splice(k, 1);
    }
    if (this.queued > 0) {
      this.queued -= dt;
      if (this.queued <= 0) this.fire(this.aim + 0.04);
    }

    if (this.charge >= 0) {
      this.charge -= dt;
      if (this.charge < 0) {
        const spread = this.evolved ? [-0.25, 0, 0.25] : [0];
        for (const s of spread) this.fire(this.aim + s);
        if (this.lv(6)) this.queued = 0.15;
      }
      return;
    }

    this.timer -= dt;
    if (this.timer > 0) return;
    const j = g.strongest(g.px, g.py, 420);
    if (j < 0) return;
    this.timer = this.cooldown((this.evolved ? 2 : 3.5) * (this.lv(5) ? 0.8 : 1));
    this.aim = Math.atan2(f.y[j] - g.py, f.x[j] - g.px);
    this.charge = (this.evolved ? 0.6 : 1.2) * (this.lv(3) ? 0.75 : 1);
  }

  draw(fx: Graphics) {
    const g = this.g;
    if (this.charge >= 0) {
      const k = ((g.time * 30) | 0) & 1;
      const spread = this.evolved ? [-0.25, 0, 0.25] : [0];
      for (const s of spread) {
        const a = this.aim + s;
        fx.moveTo(g.px, g.py - 6).lineTo(g.px + Math.cos(a) * 1400, g.py + Math.sin(a) * 1400).stroke({ width: 1, color: this.color, alpha: k ? 0.6 : 0.25 });
      }
      g.light(g.px, g.py, 90, 0.6 + k * 0.4, this.color);
    }
    for (const b of this.beams) {
      const k = b.life / 0.2;
      const w = this.width();
      const x1 = b.x + Math.cos(b.a) * 1400;
      const y1 = b.y + Math.sin(b.a) * 1400;
      fx.moveTo(b.x, b.y).lineTo(x1, y1).stroke({ width: w * 2 * k, color: this.color, alpha: 0.5 * k });
      fx.moveTo(b.x, b.y).lineTo(x1, y1).stroke({ width: w * 0.6 * k + 1, color: 0xffffff, alpha: k });
      for (let d = 0; d < 1400; d += 200) g.light(b.x + Math.cos(b.a) * d, b.y + Math.sin(b.a) * d, 90, 0.9 * k, this.color);
    }
  }
}

export const RAILGUN: WeaponDef = {
  id: 'railgun',
  school: 'mech',
  name: 'railgun.mod',
  tag: 'RLG',
  desc: 'Заряжается и прошивает лучом весь экран в сторону самого живучего врага',
  perks: ['Урон +30%', 'Зарядка на 25% быстрее', 'Луч шире на 50%', 'Перезарядка −20%', 'Второй выстрел следом', 'Урон +30%', 'Луч оглушает'],
  evo: { name: 'gauss.mod', desc: 'Три луча веером, выстрел каждые 2 секунды' },
  make: (g) => new Railgun(RAILGUN, g),
};
