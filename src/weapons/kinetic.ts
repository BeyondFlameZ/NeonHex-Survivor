import { Graphics, Sprite } from 'pixi.js';
import { CFG } from '../config';
import type { Game } from '../game';
import * as tex from '../textures';
import { BaseWeapon, F_NOFX, F_NONUM, type WeaponDef } from './types';

const PX = CFG.px;
function spritePool(g: Game, n: number, t: import('pixi.js').Texture, layer: 'fx' | 'ground' = 'fx') {
  const out: Sprite[] = [];
  for (let k = 0; k < n; k++) {
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.scale.set(PX);
    s.visible = false;
    (layer === 'fx' ? g.layerFx : g.layerGround).addChild(s);
    out.push(s);
  }
  return out;
}

// ---------- cryo.dll — ледяные осколки ----------

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  pierce: number;
  hits: Set<number>;
  s: Sprite;
}

class Cryo extends BaseWeapon {
  private shards: Shard[] = [];
  private free: Sprite[];
  private wave = 12;

  constructor(def: WeaponDef, g: Game) {
    super(def, g);
    this.free = spritePool(g, 80, tex.shardTex());
  }

  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer <= 0 && g.enemies.n > 0) {
      this.timer = this.cooldown(1.1 * (this.lv(7) ? 0.8 : 1));
      const count = 3 + this.lv(2) + this.lv(5) + g.amount();
      const base = Math.atan2(g.aimY, g.aimX);
      const speed = 380 * g.speedMul();
      for (let k = 0; k < count; k++) {
        const s = this.free.pop();
        if (!s) break;
        const a = base + (k - (count - 1) / 2) * (0.6 / Math.max(1, count - 1)) * 1.5;
        s.visible = true;
        s.rotation = a;
        this.shards.push({ x: g.px, y: g.py - 4, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.8, pierce: this.lv(6), hits: new Set(), s });
      }
    }

    if (this.evolved) {
      this.wave -= dt;
      if (this.wave <= 0) {
        this.wave = 12;
        const f = g.enemies.f;
        for (let i = 0; i < g.enemies.n; i++) {
          if (f.hp[i] <= 0 || Math.abs(f.x[i] - g.px) > g.viewHW || Math.abs(f.y[i] - g.py) > g.viewHH) continue;
          g.freeze(i, 5);
          g.hit(i, this.dmg(20), 0, 0, this.elem, F_NOFX | F_NONUM);
        }
        g.flash(g.px, g.py, 600, 1.4, this.color, 0.6);
        g.impact(g.px, g.py, this.color, PX * 8);
        g.addShake(6);
      }
    }

    const dmg = this.dmg(8 * (1 + 0.3 * this.lv(3)) * (1 + 0.4 * this.lv(8)));
    const stacks = 1 + this.lv(4);
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.life -= dt;
      sh.s.position.set(Math.round(sh.x), Math.round(sh.y));
      let dead = sh.life <= 0;
      if (!dead) {
        g.forEachIn(sh.x, sh.y, 4, (j) => {
          if (dead || sh.hits.has(j)) return;
          sh.hits.add(j);
          const l = Math.hypot(sh.vx, sh.vy) || 1;
          g.hit(j, dmg, sh.vx / l, sh.vy / l, this.elem);
          g.freeze(j, stacks);
          if (--sh.pierce < 0) dead = true;
        });
      }
      if (dead) {
        sh.s.visible = false;
        this.free.push(sh.s);
        this.shards.splice(i, 1);
      }
    }
  }
}

export const CRYO: WeaponDef = {
  id: 'cryo',
  school: 'kinetic',
  name: 'cryo.dll',
  tag: 'CRY',
  desc: 'Веер ледяных осколков по ходу движения, 5 попаданий замораживают',
  perks: ['+1 осколок', 'Урон +30%', 'Каждое попадание даёт 2 стака холода', '+1 осколок', 'Осколки пробивают 1 врага', 'Перезарядка −20%', 'Урон +40%'],
  evo: { name: 'absolute_zero.dll', desc: 'Раз в 12 секунд волна холода замораживает весь экран' },
  make: (g) => new Cryo(CRYO, g),
};

// ---------- grav.well — чёрная дыра ----------

interface Well {
  x: number;
  y: number;
  life: number;
  tick: number;
}

class Grav extends BaseWeapon {
  private wells: Well[] = [];
  private ang = 0;

  private radius() {
    return 110 * (1 + 0.2 * this.lv(2)) * this.g.areaMul();
  }

  update(dt: number) {
    const g = this.g;
    const R = this.radius();
    const dmg = this.dmg(14 * (1 + 0.3 * this.lv(3)));
    const pullK = 1 + 0.5 * this.lv(6);

    if (this.evolved) {
      this.ang += dt * 1.2;
      const x = g.px + Math.cos(this.ang) * 90;
      const y = g.py + Math.sin(this.ang) * 90;
      if (!this.wells.length) this.wells.push({ x, y, life: 1e9, tick: 0 });
      this.wells[0].x = x;
      this.wells[0].y = y;
      g.pullGems(x, y, R * 3);
    } else {
      this.timer -= dt;
      if (this.timer <= 0 && g.enemies.n > 0) {
        this.timer = this.cooldown(6 * (this.lv(7) ? 0.8 : 1));
        const n = 1 + this.lv(5);
        for (let k = 0; k < n; k++) {
          const j = k === 0 ? g.densest() : g.randomInView();
          if (j < 0) continue;
          this.wells.push({ x: g.enemies.f.x[j], y: g.enemies.f.y[j], life: (3 + this.lv(4)) * g.durMul(), tick: 0 });
          g.impact(g.enemies.f.x[j], g.enemies.f.y[j], this.color, PX * 3);
        }
      }
    }

    const f = g.enemies.f;
    for (let k = this.wells.length - 1; k >= 0; k--) {
      const w = this.wells[k];
      w.life -= dt;
      g.forEachIn(w.x, w.y, R, (j) => {
        if (f.type[j] === 9) return;
        const dx = w.x - f.x[j];
        const dy = w.y - f.y[j];
        const d = Math.hypot(dx, dy) || 1;
        const pull = Math.min(d, 160 * pullK * (1 - d / (R + 30)) * dt + 20 * dt);
        f.x[j] += (dx / d) * pull;
        f.y[j] += (dy / d) * pull;
      });
      w.tick -= dt;
      if (w.tick <= 0) {
        w.tick = 0.25;
        g.aoe(w.x, w.y, R * 0.5, dmg * 0.25, this.elem, F_NONUM | F_NOFX);
        g.spark(w.x + (Math.random() - 0.5) * R, w.y + (Math.random() - 0.5) * R, 0, 0, 0.3, this.color);
      }
      if (w.life <= 0) {
        const burst = dmg * 3 * (this.lv(8) ? 2 : 1);
        g.aoe(w.x, w.y, R * 0.7, burst, this.elem, 0, (j) => {
          if (g.setCount('kinetic') >= 4) g.freeze(j, 5);
        });
        g.impact(w.x, w.y, this.color, PX * 5);
        g.flash(w.x, w.y, R * 2.5, 1.4, this.color, 0.3);
        g.addShake(4);
        g.stop(0.04);
        this.wells.splice(k, 1);
      }
    }
  }

  draw(_fx: Graphics, ground: Graphics) {
    const g = this.g;
    const R = this.radius();
    for (const w of this.wells) {
      const p = 0.5 + Math.sin(g.time * 8) * 0.1;
      ground.circle(w.x, w.y, R).stroke({ width: 1.5, color: this.color, alpha: 0.25 });
      ground.circle(w.x, w.y, R * 0.35 * p + 6).fill({ color: 0x05030c, alpha: 0.9 });
      ground.circle(w.x, w.y, R * 0.35 * p + 8).stroke({ width: 3, color: 0xc46bff, alpha: 0.8 });
      g.light(w.x, w.y, R * 1.6, 0.8, 0xc46bff);
    }
  }
}

export const GRAV: WeaponDef = {
  id: 'grav',
  school: 'kinetic',
  name: 'grav.well',
  tag: 'GRV',
  desc: 'Чёрная дыра стягивает толпу в точку и схлопывается взрывом',
  perks: ['Радиус +20%', 'Урон +30%', 'Дыра держится на 1 секунду дольше', '+1 дыра', 'Притяжение сильнее на 50%', 'Перезарядка −20%', 'Урон схлопывания ×2'],
  evo: { name: 'singularity.core', desc: 'Дыра кружит вокруг мага постоянно и затягивает весь опыт с карты' },
  make: (g) => new Grav(GRAV, g),
};

// ---------- blade.sh — мономолекулярный клинок ----------

interface Slash {
  a: number;
  life: number;
  full: boolean;
}

interface Wave {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hits: Set<number>;
}

class Blade extends BaseWeapon {
  private slashes: Slash[] = [];
  private waves: Wave[] = [];

  private reach() {
    return 70 * (1 + 0.2 * this.lv(3)) * this.g.areaMul();
  }

  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cooldown(0.9 * (this.lv(5) ? 0.8 : 1));
      const base = Math.atan2(g.aimY, g.aimX);
      const dirs = this.lv(8) ? [base, base + Math.PI / 2, base + Math.PI, base - Math.PI / 2] : this.lv(4) ? [base, base + Math.PI] : [base];
      for (const a of dirs) this.slash(a);
    }

    for (let k = this.slashes.length - 1; k >= 0; k--) {
      this.slashes[k].life -= dt;
      if (this.slashes[k].life <= 0) this.slashes.splice(k, 1);
    }

    const dmg = this.dmg(16 * (1 + 0.3 * this.lv(2)) * (1 + 0.3 * this.lv(7)));
    for (let k = this.waves.length - 1; k >= 0; k--) {
      const w = this.waves[k];
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.life -= dt;
      g.forEachIn(w.x, w.y, 28 * g.areaMul(), (j) => {
        if (w.hits.has(j)) return;
        w.hits.add(j);
        const l = Math.hypot(w.vx, w.vy) || 1;
        g.hit(j, dmg * 0.8, w.vx / l, w.vy / l, this.elem);
      });
      if (w.life <= 0) this.waves.splice(k, 1);
    }
  }

  private slash(a: number) {
    const g = this.g;
    const R = this.reach();
    const dmg = this.dmg(16 * (1 + 0.3 * this.lv(2)) * (1 + 0.3 * this.lv(7)));
    const f = g.enemies.f;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    g.forEachIn(g.px, g.py, R, (j) => {
      const dx = f.x[j] - g.px;
      const dy = f.y[j] - g.py;
      const d = Math.hypot(dx, dy) || 1;
      if ((dx * cx + dy * cy) / d < 0.35) return;
      const shatter = f.frz[j] > 0 ? 2 : 1;
      g.hit(j, dmg * shatter, dx / d, dy / d, this.elem);
      if (this.lv(6)) g.stun(j, 0.3);
    });
    this.slashes.push({ a, life: 0.14, full: false });
    g.flash(g.px + cx * R * 0.6, g.py + cy * R * 0.6, R * 1.6, 0.8, this.color, 0.1);
    if (this.evolved) {
      const v = 520 * g.speedMul();
      this.waves.push({ x: g.px, y: g.py, vx: cx * v, vy: cy * v, life: 0.9, hits: new Set() });
    }
  }

  draw(fx: Graphics) {
    const g = this.g;
    const R = this.reach();
    for (const s of this.slashes) {
      const k = s.life / 0.14;
      fx.arc(g.px, g.py - 4, R * (1.05 - k * 0.2), s.a - 1.1, s.a + 1.1).stroke({ width: 6 * k + 2, color: this.color, alpha: 0.5 * k + 0.2 });
      fx.arc(g.px, g.py - 4, R * (1.05 - k * 0.2), s.a - 0.9, s.a + 0.9).stroke({ width: 2, color: 0xffffff, alpha: k });
    }
    for (const w of this.waves) {
      const a = Math.atan2(w.vy, w.vx);
      fx.arc(w.x - Math.cos(a) * 20, w.y - Math.sin(a) * 20, 30 * g.areaMul(), a - 0.9, a + 0.9).stroke({ width: 4, color: this.color, alpha: Math.min(1, w.life * 2) });
      g.light(w.x, w.y, 90, 0.7, this.color);
    }
  }
}

export const BLADE: WeaponDef = {
  id: 'blade',
  school: 'kinetic',
  name: 'blade.sh',
  tag: 'BLD',
  desc: 'Широкий разрез клинком по ходу движения, замороженных раскалывает с двойным уроном',
  perks: ['Урон +30%', 'Радиус +20%', 'Удар сразу в обе стороны', 'Перезарядка −20%', 'Разрез оглушает', 'Урон +30%', 'Удары во все четыре стороны'],
  evo: { name: 'monofilament.sh', desc: 'Каждый разрез срывается с клинка волной через весь экран' },
  make: (g) => new Blade(BLADE, g),
};

// ---------- ricochet.io — чакрам ----------

interface Disc {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  bounces: number;
  last: number;
  s: Sprite;
}

class Ricochet extends BaseWeapon {
  private discs: Disc[] = [];
  private free: Sprite[];

  constructor(def: WeaponDef, g: Game) {
    super(def, g);
    this.free = spritePool(g, 12, tex.chakramTex());
  }

  private speed() {
    return 420 * (1 + 0.25 * this.lv(4)) * this.g.speedMul();
  }

  update(dt: number) {
    const g = this.g;
    const f = g.enemies.f;
    this.timer -= dt;
    const maxDiscs = this.evolved ? 3 + g.amount() : 99;
    if (this.timer <= 0 && this.discs.length < maxDiscs) {
      const t = g.nearest(g.px, g.py, 400);
      if (t >= 0) {
        this.timer = this.cooldown(1.4 * (this.lv(7) ? 0.8 : 1));
        const n = 1 + this.lv(5) + g.amount();
        for (let k = 0; k < n && this.discs.length < maxDiscs; k++) {
          const s = this.free.pop();
          if (!s) break;
          s.visible = true;
          const a = Math.atan2(f.y[t] - g.py, f.x[t] - g.px) + (k - (n - 1) / 2) * 0.3;
          const v = this.speed();
          this.discs.push({
            x: g.px,
            y: g.py,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: this.evolved ? 8 : 2.5,
            bounces: 4 + 2 * this.lv(2) + 2 * this.lv(6),
            last: -1,
            s,
          });
        }
      }
    }

    const dmg = this.dmg(12 * (1 + 0.3 * this.lv(3)) * (1 + 0.4 * this.lv(8)));
    for (let i = this.discs.length - 1; i >= 0; i--) {
      const d = this.discs[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      d.s.rotation += dt * 18;
      d.s.position.set(Math.round(d.x), Math.round(d.y));

      if (this.evolved) {
        if (Math.abs(d.x - g.px) > g.viewHW) d.vx = -Math.sign(d.x - g.px) * Math.abs(d.vx);
        if (Math.abs(d.y - g.py) > g.viewHH) d.vy = -Math.sign(d.y - g.py) * Math.abs(d.vy);
      }

      let hitJ = -1;
      g.forEachIn(d.x, d.y, 6, (j) => {
        if (hitJ < 0 && j !== d.last) hitJ = j;
      });
      if (hitJ >= 0) {
        const l = Math.hypot(d.vx, d.vy) || 1;
        g.hit(hitJ, dmg, d.vx / l, d.vy / l, this.elem);
        d.last = hitJ;
        d.bounces--;
        const except = new Set([hitJ]);
        const n = g.nearest(d.x, d.y, 220, except);
        const v = this.speed();
        if (n >= 0) {
          const a = Math.atan2(f.y[n] - d.y, f.x[n] - d.x);
          d.vx = Math.cos(a) * v;
          d.vy = Math.sin(a) * v;
        }
      }
      if (d.life <= 0 || (!this.evolved && d.bounces < 0)) {
        d.s.visible = false;
        this.free.push(d.s);
        this.discs.splice(i, 1);
      }
    }
  }

  draw() {
    for (const d of this.discs) this.g.light(d.x, d.y, 70, 0.6, this.color);
  }
}

export const RICOCHET: WeaponDef = {
  id: 'ricochet',
  school: 'kinetic',
  name: 'ricochet.io',
  tag: 'RCH',
  desc: 'Чакрам отскакивает от врага к врагу до 4 раз',
  perks: ['+2 отскока', 'Урон +30%', 'Скорость полёта +25%', '+1 чакрам', '+2 отскока', 'Перезарядка −20%', 'Урон +40%'],
  evo: { name: 'razorstorm.io', desc: 'Чакрамы не исчезают и носятся по экрану, отражаясь от краёв' },
  make: (g) => new Ricochet(RICOCHET, g),
};
