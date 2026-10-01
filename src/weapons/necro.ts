import { Graphics, Sprite } from 'pixi.js';
import { CFG } from '../config';
import type { Game } from '../game';
import * as tex from '../textures';
import { BaseWeapon, F_NOFX, F_NONUM, type WeaponDef } from './types';

const PX = CFG.px;
const TAU = Math.PI * 2;

// ---------- virus.js — зараза, перескакивающая при смерти ----------

class Virus extends BaseWeapon {
  private dps() {
    return this.dmg(6 * (1 + 0.3 * this.lv(3)) * (1 + 0.5 * this.lv(8)));
  }

  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer > 0 || g.enemies.n === 0) return;
    this.timer = this.cooldown(2 * (this.lv(7) ? 0.75 : 1));
    const n = 1 + this.lv(2) + 2 * this.lv(6) + g.amount();
    const sec = (4 + 2 * this.lv(5)) * g.durMul();
    for (let k = 0; k < n; k++) {
      const j = g.randomNear(g.px, g.py, 280);
      if (j < 0) break;
      g.infect(j, sec, this.dps());
      const f = g.enemies.f;
      g.arc(g.lightning(g.px, g.py - 6, f.x[j], f.y[j] - 6), this.color, 0.15, 2);
      g.impact(f.x[j], f.y[j] - 6, this.color, PX * 2);
    }
  }

  onKill(x: number, y: number, j: number) {
    const g = this.g;
    const f = g.enemies.f;
    if (f.inf[j] <= 0) return;
    const spread = 2 + this.lv(4);
    const sec = (4 + 2 * this.lv(5)) * g.durMul();
    const except = new Set([j]);
    for (let k = 0; k < spread; k++) {
      const t = g.nearest(x, y, 100, except);
      if (t < 0) break;
      except.add(t);
      g.infect(t, sec, this.dps());
      g.arc([x, y - 6, f.x[t], f.y[t] - 6], this.color, 0.2, 2);
    }
    if (this.evolved) {
      g.aoe(x, y, 50 * g.areaMul(), this.dps() * 2, this.elem, F_NONUM);
      g.impact(x, y, this.color, PX * 3);
      g.heal(0.5);
    }
  }
}

export const VIRUS: WeaponDef = {
  id: 'virus',
  school: 'necro',
  name: 'virus.js',
  tag: 'VIR',
  desc: 'Заражает врагов. Когда заражённый умирает, вирус перескакивает на соседей',
  perks: ['+1 заражение за раз', 'Урон заразы +30%', 'Перескакивает на 3 соседей', 'Зараза держится на 2 секунды дольше', '+2 заражения за раз', 'Перезарядка −25%', 'Урон +50%'],
  evo: { name: 'pandemic.js', desc: 'Заражённые взрываются при смерти, а каждая такая смерть лечит мага' },
  make: (g) => new Virus(VIRUS, g),
};

// ---------- swarm.bot — рой самонаводящихся ракет ----------

interface Missile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  target: number;
  mini: boolean;
  s: Sprite;
}

class Swarm extends BaseWeapon {
  private ms: Missile[] = [];
  private free: Sprite[] = [];

  constructor(def: WeaponDef, g: Game) {
    super(def, g);
    for (let k = 0; k < 60; k++) {
      const s = new Sprite(tex.missileTex());
      s.anchor.set(0.5);
      s.scale.set(PX);
      s.visible = false;
      g.layerFx.addChild(s);
      this.free.push(s);
    }
  }

  private launch(x: number, y: number, a: number, mini: boolean) {
    const s = this.free.pop();
    if (!s) return;
    s.visible = true;
    s.scale.set(mini ? PX * 0.7 : PX);
    const v = 200;
    this.ms.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 3, target: -1, mini, s });
  }

  update(dt: number) {
    const g = this.g;
    const f = g.enemies.f;
    this.timer -= dt;
    if (this.timer <= 0 && g.enemies.n > 0) {
      this.timer = this.cooldown(1.2 * (this.lv(6) ? 0.8 : 1));
      const n = 2 + this.lv(2) + 2 * this.lv(5) + g.amount();
      for (let k = 0; k < n; k++) this.launch(g.px, g.py - 8, -Math.PI / 2 + (k - (n - 1) / 2) * 0.5, false);
    }

    const dmg = this.dmg(10 * (1 + 0.3 * this.lv(3)) * (1 + 0.4 * this.lv(8)));
    const R = 26 * (1 + 0.3 * this.lv(4)) * g.areaMul();
    const maxV = 340 * g.speedMul();
    for (let i = this.ms.length - 1; i >= 0; i--) {
      const m = this.ms[i];
      m.life -= dt;
      if (m.target < 0 || m.target >= g.enemies.n || f.hp[m.target] <= 0) m.target = g.randomNear(m.x, m.y, 320);
      if (m.target >= 0) {
        const dx = f.x[m.target] - m.x;
        const dy = f.y[m.target] - m.y;
        const d = Math.hypot(dx, dy) || 1;
        m.vx += (dx / d) * 1400 * dt;
        m.vy += (dy / d) * 1400 * dt;
        const v = Math.hypot(m.vx, m.vy);
        if (v > maxV) {
          m.vx = (m.vx / v) * maxV;
          m.vy = (m.vy / v) * maxV;
        }
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.s.rotation = Math.atan2(m.vy, m.vx);
      m.s.position.set(Math.round(m.x), Math.round(m.y));
      if ((g.time * 60) % 2 < 1) g.spark(m.x, m.y, -m.vx * 0.1, -m.vy * 0.1, 0.2, 0xff7a2d);

      let boom = m.life <= 0;
      if (!boom && g.anyIn(m.x, m.y, 5)) boom = true;
      if (!boom) continue;
      const d2 = m.mini ? dmg * 0.5 : dmg;
      g.aoe(m.x, m.y, m.mini ? R * 0.6 : R, d2, this.elem, F_NONUM, (j) => {
        if (this.lv(7)) g.infect(j, 3, d2 * 0.3);
      });
      g.impact(m.x, m.y, this.color, PX * (m.mini ? 1 : 2));
      g.flash(m.x, m.y, R * 2.5, 0.9, 0xff7a2d, 0.12);
      if (this.evolved && !m.mini) {
        for (let k = 0; k < 2; k++) this.launch(m.x, m.y, Math.random() * TAU, true);
      }
      m.s.visible = false;
      this.free.push(m.s);
      this.ms.splice(i, 1);
    }
  }

  draw() {
    for (const m of this.ms) this.g.light(m.x, m.y, 50, 0.5, 0xff7a2d);
  }
}

export const SWARM: WeaponDef = {
  id: 'swarm',
  school: 'necro',
  name: 'swarm.bot',
  tag: 'SWM',
  desc: 'Рой самонаводящихся ракет-паразитов',
  perks: ['+1 ракета', 'Урон +30%', 'Радиус взрыва +30%', '+2 ракеты', 'Перезарядка −20%', 'Взрывы заражают врагов', 'Урон +40%'],
  evo: { name: 'hive.mind', desc: 'Каждая ракета при попадании выпускает две мини-ракеты' },
  make: (g) => new Swarm(SWARM, g),
};

// ---------- reanimate.exe — поднимает мёртвых на твою сторону ----------

class Reanimate extends BaseWeapon {
  private cap() {
    const base = 2 + this.lv(3) + this.lv(6) + (this.evolved ? 4 : 0);
    return this.g.minionCap(base);
  }

  private raise(x: number, y: number) {
    const g = this.g;
    if (g.minionCount() >= this.cap()) return;
    const dmg = this.dmg(12 * (1 + 0.4 * this.lv(4)) * (1 + 0.5 * this.lv(8)));
    const life = (this.evolved ? 30 : 12) * (1 + 0.5 * this.lv(5)) * g.durMul();
    if (g.spawnMinion(x, y, dmg, life) && this.evolved) {
      g.aoe(x, y, 60 * g.areaMul(), dmg * 2, this.elem);
      g.flash(x, y, 160, 1, this.color, 0.2);
    }
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cooldown(10);
    const g = this.g;
    const a = Math.random() * TAU;
    this.raise(g.px + Math.cos(a) * 40, g.py + Math.sin(a) * 40);
  }

  onKill(x: number, y: number) {
    const chance = 0.08 + 0.04 * this.lv(2) + 0.06 * this.lv(7);
    if (Math.random() < chance) this.raise(x, y);
  }
}

export const REANIMATE: WeaponDef = {
  id: 'reanimate',
  school: 'necro',
  name: 'reanimate.exe',
  tag: 'RNM',
  desc: 'Убитые враги иногда встают перепрошитыми миньонами и дерутся за тебя',
  perks: ['Шанс поднятия +4%', '+1 к лимиту миньонов', 'Урон миньонов +40%', 'Миньоны живут на 50% дольше', '+1 к лимиту миньонов', 'Шанс поднятия +6%', 'Урон миньонов +50%'],
  evo: { name: 'necro_lord.exe', desc: 'Лимит +4, миньоны живут 30 секунд и появляются со взрывом' },
  make: (g) => new Reanimate(REANIMATE, g),
};

// ---------- leech.hook — кровососущие крюки ----------

interface Hook {
  j: number;
  life: number;
}

class Leech extends BaseWeapon {
  private hooks: Hook[] = [];
  private tick = 0;

  update(dt: number) {
    const g = this.g;
    const f = g.enemies.f;
    const range = this.evolved ? 220 : 200;
    const maxHooks = this.evolved ? 10 : 1 + this.lv(2) + 2 * this.lv(6) + g.amount();

    this.timer -= dt;
    if ((this.evolved || this.timer <= 0) && this.hooks.length < maxHooks) {
      this.timer = this.cooldown(4 * (this.lv(7) ? 0.75 : 1));
      const except = new Set(this.hooks.map((h) => h.j));
      while (this.hooks.length < maxHooks) {
        const j = g.nearest(g.px, g.py, range, except);
        if (j < 0) break;
        except.add(j);
        this.hooks.push({ j, life: (2.5 + this.lv(4)) * g.durMul() });
        g.impact(f.x[j], f.y[j] - 6, this.color, PX * 2);
      }
    }

    this.tick -= dt;
    const doTick = this.tick <= 0;
    if (doTick) this.tick = 0.25;
    const dps = this.dmg(12 * (1 + 0.3 * this.lv(3)) * (1 + 0.4 * this.lv(8)));
    const healK = (this.evolved ? 0.03 : 0.05) * (this.lv(5) ? 2 : 1);

    for (let k = this.hooks.length - 1; k >= 0; k--) {
      const h = this.hooks[k];
      h.life -= dt;
      const alive = h.j < g.enemies.n && f.hp[h.j] > 0 && Math.hypot(f.x[h.j] - g.px, f.y[h.j] - g.py) < range * 1.3;
      if (!alive || h.life <= 0) {
        this.hooks.splice(k, 1);
        continue;
      }
      if (doTick) {
        const d = dps * 0.25;
        g.hit(h.j, d, 0, 0, this.elem, F_NOFX | F_NONUM | 4);
        g.heal(d * healK);
        g.spark(f.x[h.j], f.y[h.j] - 6, (g.px - f.x[h.j]) * 2, (g.py - f.y[h.j]) * 2, 0.3, 0xff2d55);
      }
    }
  }

  // индексы врагов сдвигаются при удалении — крюк на «чужом» враге просто отцепится по дистанции
  onKill(_x: number, _y: number, j: number) {
    this.hooks = this.hooks.filter((h) => h.j !== j);
  }

  draw(fx: Graphics) {
    const g = this.g;
    const f = g.enemies.f;
    for (const h of this.hooks) {
      if (h.j >= g.enemies.n) continue;
      const x = f.x[h.j];
      const y = f.y[h.j] - 6;
      const mx = (g.px + x) / 2 + Math.sin(g.time * 12 + h.j) * 8;
      const my = (g.py + y) / 2 - 12;
      fx.moveTo(g.px, g.py - 6).quadraticCurveTo(mx, my, x, y).stroke({ width: 2, color: 0xff2d55, alpha: 0.85 });
      g.light(x, y, 50, 0.5, 0xff2d55);
    }
  }
}

export const LEECH: WeaponDef = {
  id: 'leech',
  school: 'necro',
  name: 'leech.hook',
  tag: 'LCH',
  desc: 'Крюк впивается в ближайшего врага, высасывает здоровье и лечит тебя',
  perks: ['+1 крюк', 'Урон +30%', 'Крюки держатся на 1 секунду дольше', 'Лечение ×2', '+2 крюка', 'Перезарядка −25%', 'Урон +40%'],
  evo: { name: 'blood_pact.hook', desc: 'До 10 крюков постоянно цепляются ко всем врагам вокруг' },
  make: (g) => new Leech(LEECH, g),
};
