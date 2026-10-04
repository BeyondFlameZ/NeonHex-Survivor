import type { LevelDef } from './content.js';
import { drawProp, rgb, type PropKind, type RGB } from './models.js';
import type { Renderer } from '../gl/renderer.js';
import { CELL } from '../gl/textures.js';

// Арена: квадрат 96×96, по краям дома, внутри препятствия, разрушаемые урны/бочки и ловушки-руны.
export const HALF = 48;

export interface PropInst {
  kind: PropKind;
  x: number;
  z: number;
  rot: number;
  s: number;
  a: RGB;
  b: RGB;
  glow: RGB;
  w: number;
  d: number;
  light: boolean;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Breakable {
  x: number;
  z: number;
  kind: 'urn' | 'barrel';
  alive: boolean;
}

export interface Trap {
  x: number;
  z: number;
  phase: number;
  fired: number;
}

function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const LIGHTS = new Set<PropKind>(['lamp', 'brazier', 'crystal', 'vat', 'cross', 'candles', 'pod']);

export class World {
  props: PropInst[] = [];
  circles: Circle[] = [];
  rects: Rect[] = [];
  breakables: Breakable[] = [];
  traps: Trap[] = [];
  glow: RGB;

  constructor(
    readonly L: LevelDef,
    seed: number,
  ) {
    const r = rng(seed * 7919 + 17);
    this.glow = rgb(L.ground.glow);
    const H = rgb(L.house.a);
    const HB = rgb(L.house.b);
    const HG = rgb(L.house.glow);
    // дома по периметру
    for (let side = 0; side < 4; side++) {
      let p = -HALF - 4;
      while (p < HALF + 4) {
        const w = 8 + r() * 6;
        const d = 7 + r() * 3;
        const c = p + w / 2;
        const off = HALF + d / 2 + 0.5;
        const [x, z, rot] = side === 0 ? [c, -off, 0] : side === 1 ? [c, off, Math.PI] : side === 2 ? [-off, c, Math.PI / 2] : [off, c, -Math.PI / 2];
        this.props.push({ kind: 'house', x, z, rot, s: 1, a: H, b: HB, glow: HG, w, d, light: false });
        p += w + 0.6;
      }
    }
    const free = (x: number, z: number, rad: number) => {
      if (Math.hypot(x, z) < 9) return false;
      if (Math.abs(x) > HALF - rad - 1 || Math.abs(z) > HALF - rad - 1) return false;
      for (const c of this.circles) if (Math.hypot(c.x - x, c.z - z) < c.r + rad + 2.5) return false;
      for (const q of this.rects) if (x > q.x0 - rad - 2.5 && x < q.x1 + rad + 2.5 && z > q.z0 - rad - 2.5 && z < q.z1 + rad + 2.5) return false;
      return true;
    };
    // крупные: стеклянные фонари и контейнеры
    for (let k = 0; k < 7; k++) {
      for (let tries = 0; tries < 30; tries++) {
        const big = r() < 0.5 ? 'skylight' : 'container';
        const rot = r() < 0.5 ? 0 : Math.PI / 2;
        const x = (r() * 2 - 1) * (HALF - 8);
        const z = (r() * 2 - 1) * (HALF - 8);
        const hw = big === 'skylight' ? 2 : 1.1;
        const hd = big === 'skylight' ? 3 : 2.5;
        const ex = rot ? hd : hw;
        const ez = rot ? hw : hd;
        if (!free(x, z, Math.max(ex, ez))) continue;
        const pdef = L.props.find((p) => p.kind === big) ?? { a: '#8a7a6a', b: '#5a4a3a', glow: L.ground.glow };
        const a = big === 'skylight' ? rgb('#9a8a76') : rgb(pdef.a);
        const b = big === 'skylight' ? rgb('#6a5a48') : rgb(pdef.b);
        this.props.push({ kind: big, x, z, rot, s: 1, a, b, glow: rgb(pdef.glow), w: 1, d: 1, light: false });
        this.rects.push({ x0: x - ex, z0: z - ez, x1: x + ex, z1: z + ez });
        break;
      }
    }
    // мелкие декорации локации
    const total = L.props.reduce((s, p) => s + p.w, 0);
    for (let k = 0; k < 46; k++) {
      let pick = r() * total;
      let def = L.props[0];
      for (const p of L.props) {
        pick -= p.w;
        if (pick <= 0) {
          def = p;
          break;
        }
      }
      if (def.kind === 'skylight' || def.kind === 'container') continue;
      const rad = def.kind === 'pillar' || def.kind === 'vat' || def.kind === 'pod' ? 0.9 : 0.6;
      for (let tries = 0; tries < 20; tries++) {
        const x = (r() * 2 - 1) * (HALF - 3);
        const z = (r() * 2 - 1) * (HALF - 3);
        if (!free(x, z, rad)) continue;
        const solid = def.kind !== 'candles';
        this.props.push({ kind: def.kind, x, z, rot: r() * Math.PI * 2, s: 0.9 + r() * 0.3, a: rgb(def.a), b: rgb(def.b), glow: rgb(def.glow), w: 1, d: 1, light: LIGHTS.has(def.kind) });
        if (solid) this.circles.push({ x, z, r: rad });
        break;
      }
    }
    // разрушаемое и ловушки
    for (let k = 0; k < 14; k++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = (r() * 2 - 1) * (HALF - 4);
        const z = (r() * 2 - 1) * (HALF - 4);
        if (!free(x, z, 0.6)) continue;
        this.breakables.push({ x, z, kind: r() < 0.7 ? 'urn' : 'barrel', alive: true });
        break;
      }
    }
    for (let k = 0; k < 7; k++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = (r() * 2 - 1) * (HALF - 6);
        const z = (r() * 2 - 1) * (HALF - 6);
        if (!free(x, z, 1.2)) continue;
        this.traps.push({ x, z, phase: r() * 4, fired: -1 });
        break;
      }
    }
  }

  // выталкивание круга из препятствий; возвращает true, если было касание
  collide(p: { x: number; z: number }, rad: number) {
    let hit = false;
    for (const c of this.circles) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const rr = c.r + rad;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (rr - d);
      p.z += (dz / d) * (rr - d);
      hit = true;
    }
    for (const q of this.rects) {
      const cx = Math.max(q.x0, Math.min(p.x, q.x1));
      const cz = Math.max(q.z0, Math.min(p.z, q.z1));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (rad - d);
        p.z += (dz / d) * (rad - d);
      } else {
        // центр внутри прямоугольника — выталкиваем к ближайшей стороне
        const ex = Math.min(p.x - q.x0, q.x1 - p.x);
        const ez = Math.min(p.z - q.z0, q.z1 - p.z);
        if (ex < ez) p.x = p.x - q.x0 < q.x1 - p.x ? q.x0 - rad : q.x1 + rad;
        else p.z = p.z - q.z0 < q.z1 - p.z ? q.z0 - rad : q.z1 + rad;
      }
      hit = true;
    }
    const lim = HALF - rad;
    if (p.x < -lim) p.x = -lim;
    if (p.x > lim) p.x = lim;
    if (p.z < -lim) p.z = -lim;
    if (p.z > lim) p.z = lim;
    return hit;
  }

  draw(r: Renderer, t: number, cx: number, cz: number, viewR: number) {
    for (const p of this.props) {
      const far = p.kind === 'house' ? viewR + 14 : viewR + 4;
      if (Math.abs(p.x - cx) > far || Math.abs(p.z - cz) > far) continue;
      drawProp(p.kind, p.x, p.z, p.rot, p.s, p.a, p.b, p.glow, t, p.w, p.d);
      if (p.kind !== 'house') r.sprite(0, CELL.disc, p.x + 0.25, 0.02, p.z + 0.3, p.kind === 'pillar' || p.kind === 'vat' ? 1.6 : 1.1, 0, 0, 0, 0.35);
      if (p.light) {
        const y = p.kind === 'lamp' ? 2.85 : p.kind === 'brazier' ? 1.6 : 1;
        r.sprite(3, CELL.glow, p.x, y, p.z, 2.4, p.glow[0], p.glow[1], p.glow[2], 0.55 + Math.sin(t * 7 + p.x) * 0.08);
        r.sprite(1, CELL.glow, p.x, 0.03, p.z, 4.5, p.glow[0], p.glow[1], p.glow[2], 0.28);
      }
    }
    const urn = rgb('#9a6a3a');
    const urnB = rgb('#6a4a2a');
    const bar = rgb('#7a3a2a');
    const fire = rgb('#ff7a2d');
    for (const b of this.breakables) {
      if (!b.alive || Math.abs(b.x - cx) > viewR + 4 || Math.abs(b.z - cz) > viewR + 4) continue;
      if (b.kind === 'urn') drawProp('urn', b.x, b.z, 0, 0.9, urn, urnB, fire, t);
      else drawProp('barrel', b.x, b.z, 0, 0.85, bar, urnB, fire, t);
      r.sprite(0, CELL.disc, b.x + 0.15, 0.02, b.z + 0.2, 0.9, 0, 0, 0, 0.35);
    }
    const plate = rgb('#3a3440');
    for (const tr of this.traps) {
      if (Math.abs(tr.x - cx) > viewR + 4 || Math.abs(tr.z - cz) > viewR + 4) continue;
      drawProp('trap', tr.x, tr.z, 0, 1, plate, plate, this.glow, t);
      const ph = (t + tr.phase) % 4;
      if (ph > 3) r.sprite(1, CELL.ring, tr.x, 0.05, tr.z, 1.4 + (ph - 3) * 0.6, this.glow[0], this.glow[1], this.glow[2], 0.8);
    }
  }
}
