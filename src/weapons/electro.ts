import { Graphics, Sprite } from 'pixi.js';
import { CFG } from '../config';
import * as tex from '../textures';
import { BaseWeapon, F_NOFX, F_NONUM, type WeaponDef } from './types';

const PX = CFG.px;

// ---------- bolt.exe — прицельный разряд ----------

class Bolt extends BaseWeapon {
  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    const g = this.g;
    const t = g.nearest(g.px, g.py, 520);
    if (t < 0) return;

    const ev = this.evolved;
    const count = 1 + this.lv(2) + this.lv(5) + g.amount() + (ev ? 2 : 0);
    const pierce = this.lv(4) + this.lv(7) + (ev ? 2 : 0);
    const dmg = this.dmg(10 * (1 + 0.3 * this.lv(3)) * (1 + 0.4 * this.lv(8)));
    const speed = 520 * g.speedMul();
    this.timer = this.cooldown(0.75 * (this.lv(6) ? 0.8 : 1));

    const f = g.enemies.f;
    const base = Math.atan2(f.y[t] - g.py, f.x[t] - g.px);
    for (let k = 0; k < count; k++) {
      const a = base + (k - (count - 1) / 2) * 0.16;
      g.shoot(g.px, g.py - 4, Math.cos(a) * speed, Math.sin(a) * speed, dmg, pierce, this.elem, ev ? 40 * g.areaMul() : 0, 1.1);
    }
    g.impact(g.px + Math.cos(base) * 12, g.py - 4 + Math.sin(base) * 12, this.color, PX);
  }
}

export const BOLT: WeaponDef = {
  id: 'bolt',
  school: 'electro',
  name: 'bolt.exe',
  tag: 'BLT',
  desc: 'Разряд в ближайшего врага',
  perks: [
    '+1 разряд в залпе',
    'Урон +30%',
    'Разряд пробивает 1 врага',
    '+1 разряд в залпе',
    'Перезарядка −20%',
    '+1 пробитие',
    'Урон +40%',
  ],
  evo: { name: 'plasma_storm.exe', desc: '+2 разряда, +2 пробития, каждое попадание взрывается плазмой' },
  make: (g) => new Bolt(BOLT, g),
};

// ---------- arc.lnk — цепная молния ----------

class Arc extends BaseWeapon {
  private hitSet = new Set<number>();

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    const g = this.g;
    const first = g.randomNear(g.px, g.py, 300 * g.areaMul());
    if (first < 0) return;
    this.timer = this.cooldown(1.4 * (this.lv(4) ? 0.85 : 1));

    const chains = 1 + this.lv(7) + g.amount();
    this.chain(first);
    for (let c = 1; c < chains; c++) {
      const s = g.randomNear(g.px, g.py, 300 * g.areaMul());
      if (s >= 0) this.chain(s);
    }
  }

  private chain(first: number) {
    const g = this.g;
    const f = g.enemies.f;
    const jumps = (3 + this.lv(2) + 2 * this.lv(5)) * (this.evolved ? 2 : 1);
    const stunChance = this.lv(6) ? 0.5 : 0.25;
    let d = this.dmg(14 * (1 + 0.3 * this.lv(3)) * (1 + 0.4 * this.lv(8)));

    const seen = this.hitSet;
    seen.clear();
    seen.add(first);
    g.arc(g.lightning(g.px, g.py - 8, f.x[first], f.y[first] - 6), this.color, 0.14, 2);
    this.zap(first, g.px, g.py, d, stunChance);

    let frontier = [first];
    let left = jumps;
    while (frontier.length && left > 0) {
      const next: number[] = [];
      for (const j of frontier) {
        const branches = this.evolved ? 2 : 1;
        for (let b = 0; b < branches && left > 0; b++) {
          const n = g.nearest(f.x[j], f.y[j], 130, seen);
          if (n < 0) break;
          seen.add(n);
          left--;
          d *= 0.85;
          g.arc(g.lightning(f.x[j], f.y[j] - 6, f.x[n], f.y[n] - 6), this.color, 0.14, 2);
          this.zap(n, f.x[j], f.y[j], d, stunChance);
          next.push(n);
        }
      }
      frontier = next;
    }
  }

  private zap(j: number, fromX: number, fromY: number, d: number, stunChance: number) {
    const g = this.g;
    const f = g.enemies.f;
    const dx = f.x[j] - fromX;
    const dy = f.y[j] - fromY;
    const l = Math.hypot(dx, dy) || 1;
    g.hit(j, d, dx / l, dy / l, this.elem);
    if (Math.random() < stunChance) g.stun(j, 0.3);
  }
}

export const ARC: WeaponDef = {
  id: 'arc',
  school: 'electro',
  name: 'arc.lnk',
  tag: 'ARC',
  desc: 'Цепная молния: перескакивает на 3 врагов, может оглушить',
  perks: [
    '+1 перескок',
    'Урон +30%',
    'Перезарядка −15%',
    '+2 перескока',
    'Шанс оглушения 50%',
    '+1 цепь одновременно',
    'Урон +40%',
  ],
  evo: { name: 'thunder.grid', desc: 'Каждый перескок раздваивается, число перескоков удвоено' },
  make: (g) => new Arc(ARC, g),
};

// ---------- strike.sat — удары с орбиты ----------

class Strike extends BaseWeapon {
  private queue: number[] = [];

  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer <= 0 && g.enemies.n > 0) {
      this.timer = this.cooldown(2.2 * (this.lv(6) ? 0.8 : 1));
      const count = 2 + this.lv(2) + this.lv(5) + 2 * this.lv(7) + g.amount();
      for (let k = 0; k < count; k++) this.queue.push(k * 0.09);
    }

    for (let i = this.queue.length - 1; i >= 0; i--) {
      this.queue[i] -= dt;
      if (this.queue[i] > 0) continue;
      this.queue.splice(i, 1);
      const j = g.randomInView();
      if (j < 0) continue;
      const r = 36 * (1 + 0.25 * this.lv(3)) * g.areaMul();
      const dmg = this.dmg(22 * (1 + 0.3 * this.lv(4)) * (1 + 0.4 * this.lv(8)));
      g.orbital(g.enemies.f.x[j], g.enemies.f.y[j], r, dmg, this.color, this.evolved ? dmg * 0.6 : 0);
    }
  }
}

export const STRIKE: WeaponDef = {
  id: 'strike',
  school: 'electro',
  name: 'strike.sat',
  tag: 'SAT',
  desc: 'Спутник бьёт столбами молний по случайным врагам на экране',
  perks: [
    '+1 удар',
    'Радиус +25%',
    'Урон +30%',
    '+1 удар',
    'Перезарядка −20%',
    '+2 удара',
    'Урон +40%',
  ],
  evo: { name: 'ion_cannon.sat', desc: 'Удары оставляют ионное поле, которое 2 секунды жжёт всех внутри' },
  make: (g) => new Strike(STRIKE, g),
};

// ---------- tesla.node — сеть узлов ----------

interface Node {
  x: number;
  y: number;
  life: number;
}

class Tesla extends BaseWeapon {
  private nodes: Node[] = [];
  private sprites: Sprite[] = [];
  private tick = 0;
  private zapT = 0;
  private ang = 0;

  constructor(def: WeaponDef, g: import('../game').Game) {
    super(def, g);
    const t = tex.pylonTex();
    for (let k = 0; k < 8; k++) {
      const s = new Sprite(t);
      s.anchor.set(0.5, 0.85);
      s.scale.set(PX);
      s.visible = false;
      g.layerGround.addChild(s);
      this.sprites.push(s);
    }
  }

  private count() {
    return Math.min(8, 2 + this.lv(2) + this.lv(5) + this.g.amount());
  }

  update(dt: number) {
    const g = this.g;
    const n = this.count();
    const R = 110 * g.areaMul();

    if (this.evolved) {
      // клетка Фарадея: узлы крутятся вокруг мага и не гаснут
      this.ang += dt * 0.9;
      this.nodes.length = n;
      for (let k = 0; k < n; k++) {
        const a = this.ang + (k / n) * Math.PI * 2;
        this.nodes[k] = { x: g.px + Math.cos(a) * R, y: g.py + Math.sin(a) * R, life: 1 };
      }
    } else {
      for (let k = this.nodes.length - 1; k >= 0; k--) {
        this.nodes[k].life -= dt;
        if (this.nodes[k].life <= 0) this.nodes.splice(k, 1);
      }
      this.timer -= dt;
      if (this.timer <= 0 && this.nodes.length === 0) {
        const life = (5 + 2 * this.lv(4)) * g.durMul();
        const a0 = Math.random() * Math.PI * 2;
        for (let k = 0; k < n; k++) {
          const a = a0 + (k / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
          const d = R * (0.75 + Math.random() * 0.4);
          this.nodes.push({ x: g.px + Math.cos(a) * d, y: g.py + Math.sin(a) * d, life });
          g.impact(g.px + Math.cos(a) * d, g.py + Math.sin(a) * d, this.color, PX * 2);
        }
        this.timer = this.cooldown(7 * (this.lv(6) ? 0.8 : 1));
      }
    }

    for (let k = 0; k < this.sprites.length; k++) {
      const s = this.sprites[k];
      const nd = this.nodes[k];
      s.visible = !!nd;
      if (nd) s.position.set(Math.round(nd.x), Math.round(nd.y));
    }

    const links = this.nodes.length;
    if (links < 2) return;
    const dmg = this.dmg(18 * (1 + 0.3 * this.lv(3)) * (1 + 0.4 * this.lv(8)));

    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.25;
      const per = dmg * 0.25;
      const closed = links >= 3;
      for (let k = 0; k < (closed ? links : links - 1); k++) {
        const a = this.nodes[k];
        const b = this.nodes[(k + 1) % links];
        const lx = b.x - a.x;
        const ly = b.y - a.y;
        const len = Math.hypot(lx, ly) || 1;
        // нормаль к отрезку — враги отлетают поперёк сетки
        g.segment(a.x, a.y, b.x, b.y, 10, (j) => g.hit(j, per, -ly / len, lx / len, this.elem, F_NONUM | F_NOFX));
      }
    }

    if (this.lv(7)) {
      this.zapT -= dt;
      if (this.zapT <= 0) {
        this.zapT = 1;
        const f = g.enemies.f;
        for (const nd of this.nodes) {
          const j = g.nearest(nd.x, nd.y, 120);
          if (j < 0) continue;
          g.arc(g.lightning(nd.x, nd.y - 16, f.x[j], f.y[j] - 6), this.color, 0.12, 1.5);
          g.hit(j, dmg * 0.6, 0, 0, this.elem);
        }
      }
    }
  }

  draw(fx: Graphics) {
    const g = this.g;
    for (const nd of this.nodes) g.light(nd.x, nd.y - 16, 90, 0.6, this.color);
    const links = this.nodes.length;
    if (links < 2) return;
    const closed = links >= 3;
    for (let k = 0; k < (closed ? links : links - 1); k++) {
      const a = this.nodes[k];
      const b = this.nodes[(k + 1) % links];
      const pts = g.lightning(a.x, a.y - 16, b.x, b.y - 16);
      fx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) fx.lineTo(pts[i], pts[i + 1]);
      fx.stroke({ width: 1.5, color: this.color, alpha: 0.85 });
    }
  }
}

export const TESLA: WeaponDef = {
  id: 'tesla',
  school: 'electro',
  name: 'tesla.node',
  tag: 'TSL',
  desc: 'Ставит узлы вокруг мага, дуги между ними режут всех, кто пересекает сеть',
  perks: [
    '+1 узел',
    'Урон +30%',
    'Сеть держится на 2 секунды дольше',
    '+1 узел',
    'Перезарядка −20%',
    'Узлы бьют молнией ближайшего врага раз в секунду',
    'Урон +40%',
  ],
  evo: { name: 'faraday.cage', desc: 'Узлы кружат вокруг мага и не гаснут никогда' },
  make: (g) => new Tesla(TESLA, g),
};
