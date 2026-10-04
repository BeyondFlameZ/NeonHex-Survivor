import type { Renderer } from '../gl/renderer.js';
import { CELL } from '../gl/textures.js';
import { SoA } from './pools.js';
import type { RGB } from './models.js';

type PK = 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'life' | 'max' | 'size' | 'grow' | 'r' | 'g' | 'b' | 'cell' | 'layer' | 'grav';
type NK = 'x' | 'y' | 'z' | 'v' | 'life' | 'crit' | 'r' | 'g' | 'b';

interface Arc {
  pts: number[];
  c: RGB;
  life: number;
  max: number;
}

// частицы, кольца, молнии и цифры урона — всё спрайтами
export class Fx {
  readonly p = new SoA<PK>(1600, ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'max', 'size', 'grow', 'r', 'g', 'b', 'cell', 'layer', 'grav']);
  readonly nums = new SoA<NK>(160, ['x', 'y', 'z', 'v', 'life', 'crit', 'r', 'g', 'b']);
  private arcs: Arc[] = [];
  numbers = true;

  part(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, c: RGB, cell: number = CELL.glow, layer = 3, grav = 0, grow = 0) {
    const i = this.p.add();
    if (i < 0) return;
    const f = this.p.f;
    f.x[i] = x;
    f.y[i] = y;
    f.z[i] = z;
    f.vx[i] = vx;
    f.vy[i] = vy;
    f.vz[i] = vz;
    f.life[i] = f.max[i] = life;
    f.size[i] = size;
    f.grow[i] = grow;
    f.r[i] = c[0];
    f.g[i] = c[1];
    f.b[i] = c[2];
    f.cell[i] = cell;
    f.layer[i] = layer;
    f.grav[i] = grav;
  }

  burst(x: number, y: number, z: number, n: number, speed: number, c: RGB, life = 0.4, size = 0.25, cell: number = CELL.glow, grav = 0, layer = 3) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.part(x, y, z, Math.cos(a) * v, (Math.random() * 0.8 + 0.2) * speed * 0.6, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), size, c, cell, layer, grav);
    }
  }

  // расходящееся кольцо на земле
  ring(x: number, z: number, r: number, c: RGB, life = 0.35, cell: number = CELL.ring) {
    this.part(x, 0.06, z, 0, 0, 0, life, r * 0.3, c, cell, 1, 0, r * 2.2);
  }

  flash(x: number, y: number, z: number, size: number, c: RGB, life = 0.15) {
    this.part(x, y, z, 0, 0, 0, life, size, c, CELL.glow, 3, 0, -size * 2);
  }

  number(x: number, y: number, z: number, v: number, crit: boolean, c: RGB) {
    if (!this.numbers) return;
    const i = this.nums.add();
    if (i < 0) return;
    const f = this.nums.f;
    f.x[i] = x + (Math.random() - 0.5) * 0.4;
    f.y[i] = y;
    f.z[i] = z;
    f.v[i] = Math.max(1, Math.round(v));
    f.life[i] = 0.7;
    f.crit[i] = crit ? 1 : 0;
    f.r[i] = c[0];
    f.g[i] = c[1];
    f.b[i] = c[2];
  }

  lightning(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: RGB, life = 0.16) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const segs = Math.max(3, Math.min(12, Math.round(len * 1.5)));
    const pts = [x0, y0, z0];
    for (let k = 1; k < segs; k++) {
      const t = k / segs;
      const off = (Math.random() - 0.5) * Math.min(0.8, len * 0.2);
      pts.push(x0 + dx * t + (-dz / len) * off, y0 + (y1 - y0) * t + (Math.random() - 0.5) * 0.3, z0 + dz * t + (dx / len) * off);
    }
    pts.push(x1, y1, z1);
    if (this.arcs.length < 60) this.arcs.push({ pts, c, life, max: life });
  }

  update(dt: number) {
    const p = this.p;
    const f = p.f;
    for (let i = p.n - 1; i >= 0; i--) {
      f.life[i] -= dt;
      if (f.life[i] <= 0) {
        p.kill(i);
        continue;
      }
      f.vy[i] -= f.grav[i] * dt;
      f.x[i] += f.vx[i] * dt;
      f.y[i] += f.vy[i] * dt;
      f.z[i] += f.vz[i] * dt;
      if (f.grav[i] > 0 && f.y[i] < 0.05) {
        f.y[i] = 0.05;
        f.vy[i] *= -0.35;
        f.vx[i] *= 0.6;
        f.vz[i] *= 0.6;
      }
      f.size[i] = Math.max(0.01, f.size[i] + f.grow[i] * dt);
    }
    const n = this.nums;
    for (let i = n.n - 1; i >= 0; i--) {
      n.f.life[i] -= dt;
      n.f.y[i] += dt * 1.6;
      if (n.f.life[i] <= 0) n.kill(i);
    }
    for (let k = this.arcs.length - 1; k >= 0; k--) {
      this.arcs[k].life -= dt;
      if (this.arcs[k].life <= 0) this.arcs.splice(k, 1);
    }
  }

  draw(r: Renderer) {
    const f = this.p.f;
    for (let i = 0; i < this.p.n; i++) {
      const k = f.life[i] / f.max[i];
      const a = f.layer[i] === 1 ? k : Math.min(1, k * 2);
      r.sprite(f.layer[i], f.cell[i], f.x[i], f.y[i], f.z[i], f.size[i], f.r[i], f.g[i], f.b[i], a);
    }
    for (const arc of this.arcs) {
      const k = arc.life / arc.max;
      const pts = arc.pts;
      for (let j = 3; j < pts.length; j += 3) {
        const x0 = pts[j - 3];
        const y0 = pts[j - 2];
        const z0 = pts[j - 1];
        const x1 = pts[j];
        const y1 = pts[j + 1];
        const z1 = pts[j + 2];
        const steps = 4;
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          r.sprite(3, CELL.glow, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 0.32, arc.c[0], arc.c[1], arc.c[2], k);
          r.sprite(3, CELL.glow, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 0.14, 1, 1, 1, k);
        }
      }
    }
    // цифры: раскладываем по горизонтали экрана
    const v = r.cam.view;
    const rx = v[0];
    const ry = v[4];
    const rz = v[8];
    const nf = this.nums.f;
    for (let i = 0; i < this.nums.n; i++) {
      const s = nf.crit[i] ? 0.62 : 0.42;
      const str = String(nf.v[i]);
      const a = Math.min(1, nf.life[i] * 3);
      const w = s * 0.72;
      const start = -((str.length - 1) * w) / 2;
      for (let d = 0; d < str.length; d++) {
        const o = start + d * w;
        r.sprite(2, CELL.digit0 + (str.charCodeAt(d) - 48), nf.x[i] + rx * o, nf.y[i] + ry * o, nf.z[i] + rz * o, s, nf.r[i], nf.g[i], nf.b[i], a);
      }
    }
  }
}
