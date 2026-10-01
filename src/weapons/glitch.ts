import { Graphics, Sprite } from 'pixi.js';
import { CFG } from '../config';
import type { Game } from '../game';
import * as tex from '../textures';
import { BaseWeapon, F_NOFX, F_NONUM, type WeaponDef } from './types';

const PX = CFG.px;
const TAU = Math.PI * 2;

// ---------- mirror.exe — голографические двойники ----------

class Mirror extends BaseWeapon {
  private clones: Sprite[] = [];
  private ang = 0;

  constructor(def: WeaponDef, g: Game) {
    super(def, g);
    for (let k = 0; k < 2; k++) {
      const s = new Sprite(tex.mageGhost());
      s.anchor.set(0.5);
      s.scale.set(PX);
      s.blendMode = 'add';
      s.visible = false;
      g.layerFx.addChild(s);
      this.clones.push(s);
    }
  }

  private count() {
    return 1 + this.lv(5);
  }

  private pos(k: number): [number, number] {
    const g = this.g;
    const a = this.ang + (k / this.count()) * TAU;
    return [g.px + Math.cos(a) * 46, g.py + Math.sin(a) * 26 - 4];
  }

  update(dt: number) {
    const g = this.g;
    const f = g.enemies.f;
    this.ang += dt * 1.6;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cooldown(0.9 * (this.lv(4) ? 0.8 : 1) * (this.evolved ? 0.33 : 1));
    const dmg = this.dmg(9 * (1 + 0.3 * this.lv(2)) * (1 + 0.4 * this.lv(8)));
    const shots = 1 + this.lv(3) + this.lv(7) + g.amount();
    const v = 480 * g.speedMul();
    for (let k = 0; k < this.count(); k++) {
      const [cx, cy] = this.pos(k);
      const j = g.nearest(cx, cy, 380);
      if (j < 0) continue;
      const base = Math.atan2(f.y[j] - cy, f.x[j] - cx);
      for (let s = 0; s < shots; s++) {
        const a = base + (s - (shots - 1) / 2) * 0.15;
        g.shoot(cx, cy, Math.cos(a) * v, Math.sin(a) * v, dmg, this.lv(6), this.elem, 0, 1);
      }
    }
  }

  onDash() {
    if (!this.evolved) return;
    const g = this.g;
    for (let k = 0; k < this.count(); k++) {
      const [cx, cy] = this.pos(k);
      g.spawnDecoy(cx, cy, 1.5, this.dmg(40), 60);
    }
  }

  draw() {
    const g = this.g;
    for (let k = 0; k < this.clones.length; k++) {
      const s = this.clones[k];
      s.visible = k < this.count();
      if (!s.visible) continue;
      const [cx, cy] = this.pos(k);
      const jitter = ((g.time * 30) | 0) % 7 === 0 ? 2 : 0;
      s.position.set(Math.round(cx) + jitter, Math.round(cy));
      s.tint = this.color;
      s.alpha = 0.55 + Math.sin(g.time * 13 + k) * 0.15;
      s.scale.set(PX * g.facing(), PX);
      g.light(cx, cy, 70, 0.5, this.color);
    }
  }
}

export const MIRROR: WeaponDef = {
  id: 'mirror',
  school: 'glitch',
  name: 'mirror.exe',
  tag: 'MIR',
  desc: 'Голографический двойник кружит рядом и стреляет глитч-зарядами',
  perks: ['Урон +30%', '+1 заряд в залпе', 'Перезарядка −20%', 'Второй двойник', 'Заряды пробивают 1 врага', '+1 заряд в залпе', 'Урон +40%'],
  evo: { name: 'echo_chamber.exe', desc: 'Двойники стреляют втрое чаще и повторяют твой рывок, оставляя взрывные копии' },
  make: (g) => new Mirror(MIRROR, g),
};

// ---------- trail.log — горящий след битых пикселей ----------

interface Pt {
  x: number;
  y: number;
  life: number;
}

class Trail extends BaseWeapon {
  private pts: Pt[] = [];
  private drop = 0;
  private tick = 0;

  private life() {
    return (2.5 + this.lv(3) + this.lv(7)) * this.g.durMul(this.elem);
  }

  private width() {
    return 12 * (1 + 0.5 * this.lv(4)) * this.g.areaMul();
  }

  update(dt: number) {
    const g = this.g;
    this.drop -= dt;
    if (this.drop <= 0) {
      this.drop = 0.08;
      const last = this.pts[this.pts.length - 1];
      if (!last || Math.hypot(last.x - g.px, last.y - g.py) > 6) this.pts.push({ x: g.px, y: g.py + 6, life: this.life() });
    }

    const dmg = this.dmg(20 * (1 + 0.3 * this.lv(2)) * (1 + 0.3 * this.lv(6)) * (1 + 0.4 * this.lv(8)));
    for (let k = this.pts.length - 1; k >= 0; k--) {
      const p = this.pts[k];
      p.life -= dt;
      if (p.life > 0) continue;
      if (this.evolved) {
        g.aoe(p.x, p.y, 30 * g.areaMul(), dmg * 0.6, this.elem, F_NONUM);
        if (k % 3 === 0) g.impact(p.x, p.y, this.color, PX * 2);
      }
      this.pts.splice(k, 1);
    }

    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.25;
    const w = this.width();
    const hit = new Set<number>();
    for (let k = 1; k < this.pts.length; k++) {
      const a = this.pts[k - 1];
      const b = this.pts[k];
      g.segment(a.x, a.y, b.x, b.y, w, (j) => {
        if (hit.has(j)) return;
        hit.add(j);
        g.hit(j, dmg * 0.25, 0, 0, this.elem, F_NOFX | F_NONUM | 4);
        g.freeze(j, this.lv(5) ? 0.6 : 0.3);
      });
    }
  }

  draw(_fx: Graphics, ground: Graphics) {
    const g = this.g;
    const max = this.life();
    const w = this.width();
    for (let k = 1; k < this.pts.length; k++) {
      const a = this.pts[k - 1];
      const b = this.pts[k];
      const alpha = Math.min(1, b.life / max + 0.2);
      const jit = ((g.time * 24 + k) | 0) % 5 === 0 ? 3 : 0;
      ground.moveTo(a.x, a.y).lineTo(b.x + jit, b.y).stroke({ width: w, color: this.color, alpha: 0.3 * alpha });
      ground.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2, color: 0xffffff, alpha: 0.6 * alpha });
    }
    for (let k = 0; k < this.pts.length; k += 6) g.light(this.pts[k].x, this.pts[k].y, 60, 0.4, this.color);
  }
}

export const TRAIL: WeaponDef = {
  id: 'trail',
  school: 'glitch',
  name: 'trail.log',
  tag: 'TRL',
  desc: 'За магом тянется глитч-след: жжёт и замедляет всех, кто по нему идёт',
  perks: ['Урон +30%', 'След держится на 1 секунду дольше', 'След шире на 50%', 'Замедление вдвое сильнее', 'Урон +30%', 'След держится ещё на 1 секунду дольше', 'Урон +40%'],
  evo: { name: 'ghost_protocol.log', desc: 'Каждый кусок следа, угасая, взрывается' },
  make: (g) => new Trail(TRAIL, g),
};

// ---------- decoy.bin — приманка ----------

class DecoyW extends BaseWeapon {
  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cooldown(7 * (this.lv(5) ? 0.8 : 1) * (this.lv(8) ? 0.8 : 1));
    const life = (4 + this.lv(3)) * g.durMul(this.elem);
    const dmg = this.dmg(40 * (1 + 0.3 * this.lv(2)) * (1 + 0.4 * this.lv(7)));
    const r = 70 * (1 + 0.25 * this.lv(4)) * g.areaMul();
    const n = this.evolved ? 3 : 1 + this.lv(6);
    for (let k = 0; k < n; k++) {
      const a = Math.atan2(g.aimY, g.aimX) + Math.PI + (k - (n - 1) / 2) * 1.2;
      g.spawnDecoy(g.px + Math.cos(a) * 50, g.py + Math.sin(a) * 50, life, this.evolved ? dmg * 1.5 : dmg, r);
    }
  }
}

export const DECOY: WeaponDef = {
  id: 'decoy',
  school: 'glitch',
  name: 'decoy.bin',
  tag: 'DCY',
  desc: 'Голограмма-приманка отвлекает врагов на себя, а потом взрывается',
  perks: ['Урон взрыва +30%', 'Приманка живёт на 1 секунду дольше', 'Радиус взрыва +25%', 'Перезарядка −20%', 'Две приманки', 'Урон +40%', 'Перезарядка ещё −20%'],
  evo: { name: 'honeypot.bin', desc: 'Сразу три приманки треугольником, взрыв в полтора раза сильнее' },
  make: (g) => new DecoyW(DECOY, g),
};

// ---------- stasis.sys — пузырь остановленного времени ----------

interface Bubble {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  tick: number;
}

class Stasis extends BaseWeapon {
  private bubbles: Bubble[] = [];

  update(dt: number) {
    const g = this.g;
    const f = g.enemies.f;
    this.timer -= dt;
    if (this.timer <= 0 && g.enemies.n > 0) {
      this.timer = this.cooldown((this.evolved ? 3 : 8) * (this.lv(4) ? 0.8 : 1) * (this.lv(7) ? 0.8 : 1));
      const n = 1 + this.lv(5);
      for (let k = 0; k < n; k++) {
        const j = k === 0 ? g.densest() : g.randomInView();
        if (j < 0) continue;
        const r = 70 * (1 + 0.2 * this.lv(2)) * (1 + 0.2 * this.lv(6)) * g.areaMul() * (this.evolved ? 2 : 1);
        const life = (3 + this.lv(3)) * g.durMul(this.elem);
        this.bubbles.push({ x: f.x[j], y: f.y[j], r, life, max: life, tick: 0 });
        g.impact(f.x[j], f.y[j], this.color, PX * 4);
      }
    }

    for (let k = this.bubbles.length - 1; k >= 0; k--) {
      const b = this.bubbles[k];
      b.life -= dt;
      if (b.life <= 0) {
        g.flash(b.x, b.y, b.r * 2.5, 1.2, this.color, 0.25);
        this.bubbles.splice(k, 1);
        continue;
      }
      g.forEachIn(b.x, b.y, b.r, (j) => g.stasis(j, Math.min(b.life, 0.3)));
      if (this.lv(8)) {
        b.tick -= dt;
        if (b.tick <= 0) {
          b.tick = 0.25;
          g.aoe(b.x, b.y, b.r, this.dmg(20) * 0.25, this.elem, F_NOFX | F_NONUM | 4);
        }
      }
    }
  }

  draw(_fx: Graphics, ground: Graphics) {
    const g = this.g;
    for (const b of this.bubbles) {
      const k = Math.min(1, b.life / 0.3);
      ground.circle(b.x, b.y, b.r).fill({ color: this.color, alpha: 0.1 * k });
      const n = 16;
      for (let s = 0; s < n; s += 2) {
        const a0 = (s / n) * TAU + g.time * 0.8;
        const a1 = ((s + 1) / n) * TAU + g.time * 0.8;
        ground.arc(b.x, b.y, b.r, a0, a1).stroke({ width: 2, color: this.color, alpha: 0.7 * k });
      }
      g.light(b.x, b.y, b.r * 1.5, 0.5 * k, this.color);
    }
  }
}

export const STASIS: WeaponDef = {
  id: 'stasis',
  school: 'glitch',
  name: 'stasis.sys',
  tag: 'STS',
  desc: 'Пузырь останавливает время: враги внутри застывают, а весь полученный урон потом бьёт по ним ещё раз',
  perks: ['Радиус +20%', 'Пузырь держится на 1 секунду дольше', 'Перезарядка −20%', 'Второй пузырь', 'Радиус ещё +20%', 'Перезарядка ещё −20%', 'Пузырь сам наносит урон'],
  evo: { name: 'time_prison.sys', desc: 'Пузыри вдвое больше и появляются каждые 3 секунды' },
  make: (g) => new Stasis(STASIS, g),
};
