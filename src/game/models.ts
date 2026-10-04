import { box, capsule, cone, cyl, merge, sphere, torus, xform } from '../gl/geom.js';
import { m4, mul, part, trs } from '../gl/math.js';
import type { Renderer } from '../gl/renderer.js';

// Модели собираются из простых фигур и анимируются процедурно — никаких внешних файлов.
// Пропорции «чиби»: большая голова, короткое тело — читается сверху и выглядит мультяшно.

export type RGB = [number, number, number];

const rgbCache = new Map<string, RGB>();
export function rgb(hex: string): RGB {
  let c = rgbCache.get(hex);
  if (!c) {
    const h = hex.replace('#', '');
    c = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
    rgbCache.set(hex, c);
  }
  return c;
}

export interface Lib {
  cap: number;
  sph: number;
  box: number;
  cyl: number;
  cone: number;
  tor: number;
  robe: number;
  crate: number;
  barrel: number;
  plate: number;
  crystal: number;
}

export function buildLib(r: Renderer): Lib {
  return {
    cap: r.mesh(capsule(0.5, 2, 10, 3)),
    sph: r.mesh(sphere(0.5, 14, 9)),
    box: r.mesh(box(1, 1, 1)),
    cyl: r.mesh(cyl(0.5, 0.5, 1, 12)),
    cone: r.mesh(cyl(0.02, 0.5, 1, 10)),
    tor: r.mesh(torus(0.5, 0.1, 20, 6)),
    robe: r.mesh(cyl(0.28, 0.5, 1, 12)),
    crate: r.mesh(
      merge(
        box(1, 1, 1),
        xform(box(1.06, 0.12, 0.12), 0, 0.47, 0.47),
        xform(box(1.06, 0.12, 0.12), 0, -0.47, 0.47),
        xform(box(1.06, 0.12, 0.12), 0, 0.47, -0.47),
        xform(box(1.06, 0.12, 0.12), 0, -0.47, -0.47),
        xform(box(0.12, 1.06, 0.12), 0.47, 0, 0.47),
        xform(box(0.12, 1.06, 0.12), -0.47, 0, 0.47),
        xform(box(0.12, 1.06, 0.12), 0.47, 0, -0.47),
        xform(box(0.12, 1.06, 0.12), -0.47, 0, -0.47),
      ),
    ),
    barrel: r.mesh(merge(cyl(0.45, 0.45, 1, 14), xform(torus(0.47, 0.05, 16, 4), 0, 0.2, 0), xform(torus(0.47, 0.05, 16, 4), 0, 0.8, 0))),
    plate: r.mesh(cyl(0.5, 0.5, 0.08, 6)),
    crystal: r.mesh(merge(xform(cone(0.25, 1.2, 6), 0, 0, 0), xform(cone(0.16, 0.8, 6), 0.22, 0, 0.1, 1, 1, 1, 0, 0, -0.35), xform(cone(0.14, 0.7, 6), -0.2, 0, -0.08, 1, 1, 1, 0, 0, 0.4))),
  };
}

// ---------- сборка частей ----------

const P = m4();
const L = m4();
const M = m4();
let R: Renderer;
let G: Lib;

export function bindModels(r: Renderer, lib: Lib) {
  R = r;
  G = lib;
}

function root(x: number, y: number, z: number, yaw: number, s: number) {
  trs(P, x, y, z, yaw, s, s, s);
}

// часть: mesh, цвет, свечение, шарнир (px,py,pz), поворот (rx,ry,rz), сдвиг от шарнира, масштаб
function pt(mesh: number, c: RGB, glow: number, px: number, py: number, pz: number, rx: number, ry: number, rz: number, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number) {
  part(L, px, py, pz, rx, ry, rz, ox, oy, oz, sx, sy, sz);
  mul(M, P, L);
  R.put(mesh, M, c[0], c[1], c[2], glow);
}

// простая часть без поворота
function at(mesh: number, c: RGB, glow: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  pt(mesh, c, glow, x, y, z, 0, 0, 0, 0, 0, 0, sx, sy, sz);
}

// конечность-капсула длины len и толщины w, висящая вниз от шарнира
function limb(c: RGB, px: number, py: number, pz: number, rx: number, rz: number, len: number, w: number) {
  pt(G.cap, c, 0, px, py, pz, rx, 0, rz, 0, -len, 0, w, len / 2, w);
}

const WHITE: RGB = [0.95, 0.94, 0.9];
const DARK: RGB = [0.12, 0.1, 0.16];
const METAL: RGB = [0.55, 0.58, 0.66];
const GOLD: RGB = [1, 0.78, 0.25];

export interface Pose {
  t: number; // время для анимации
  move: number; // 0..1 скорость бега
  aim: number; // 0..1 руки подняты для стрельбы
  hit: number; // 0..1 отдача от попадания
  phase: number; // случайный сдвиг фазы
}

// ---------- герои ----------

export interface HeroLook {
  robe: string;
  trim: string;
  glow: string;
  skin: string;
  hat: 'hood' | 'horns' | 'crystal' | 'skull' | 'antenna' | 'cap';
  gun: 'staff' | 'torch' | 'cannon' | 'emitter' | 'rifle' | 'dual';
}

export function drawHero(look: HeroLook, x: number, z: number, yaw: number, p: Pose, scale = 1, y = 0) {
  const robe = rgb(look.robe);
  const trim = rgb(look.trim);
  const glow = rgb(look.glow);
  const skin = rgb(look.skin);
  const sw = Math.sin(p.t * 11 + p.phase) * 0.7 * p.move;
  const bob = Math.abs(Math.sin(p.t * 11 + p.phase)) * 0.08 * p.move;
  root(x, y + bob, z, yaw, scale);
  const lean = -p.hit * 0.25 + p.move * 0.12;
  // ноги
  limb(DARK, 0.17, 0.6, 0, sw, 0, 0.55, 0.22);
  limb(DARK, -0.17, 0.6, 0, -sw, 0, 0.55, 0.22);
  // корпус-мантия
  pt(G.robe, robe, 0, 0, 0.42, 0, lean, 0, 0, 0, 0, 0, 0.62, 0.78, 0.55);
  pt(G.box, trim, 0, 0, 0.82, 0.24, lean, 0, 0, 0, 0, 0, 0.18, 0.34, 0.06);
  // голова
  const hy = 1.42;
  at(G.sph, skin, 0, 0, hy, 0.02, 0.72, 0.7, 0.72);
  // визор
  pt(G.box, glow, 0.9, 0, hy + 0.03, 0.28, 0, 0, 0, 0, 0, 0, 0.5, 0.14, 0.12);
  switch (look.hat) {
    case 'hood':
      pt(G.sph, robe, 0, 0, hy + 0.06, -0.04, 0, 0, 0, 0, 0, 0, 0.82, 0.8, 0.82);
      pt(G.cone, robe, 0, 0, hy + 0.3, -0.12, -0.5, 0, 0, 0, 0, 0, 0.45, 0.55, 0.45);
      break;
    case 'horns':
      pt(G.cone, trim, 0, 0.2, hy + 0.25, 0, 0, 0, -0.5, 0, 0, 0, 0.16, 0.42, 0.16);
      pt(G.cone, trim, 0, -0.2, hy + 0.25, 0, 0, 0, 0.5, 0, 0, 0, 0.16, 0.42, 0.16);
      break;
    case 'crystal':
      pt(G.cone, glow, 0.4, 0, hy + 0.3, 0, 0, 0, 0, 0, 0, 0, 0.22, 0.5, 0.22);
      pt(G.cone, glow, 0.4, 0.42, 1.02, 0, 0, 0, -0.8, 0, 0, 0, 0.18, 0.4, 0.18);
      pt(G.cone, glow, 0.4, -0.42, 1.02, 0, 0, 0, 0.8, 0, 0, 0, 0.18, 0.4, 0.18);
      break;
    case 'skull':
      pt(G.sph, robe, 0, 0, hy + 0.06, -0.05, 0, 0, 0, 0, 0, 0, 0.84, 0.82, 0.84);
      at(G.sph, WHITE, 0, 0, hy - 0.05, 0.22, 0.42, 0.4, 0.3);
      break;
    case 'antenna':
      at(G.box, trim, 0, 0, 1.05, -0.36, 0.5, 0.55, 0.28);
      pt(G.cyl, METAL, 0, 0.14, 1.3, -0.4, 0, 0, 0, 0, 0, 0, 0.05, 0.6, 0.05);
      at(G.sph, glow, 1, 0.14, 1.92, -0.4, 0.14, 0.14, 0.14);
      break;
    case 'cap':
      pt(G.cyl, trim, 0, 0, hy + 0.2, -0.02, -0.12, 0, 0, 0, 0, 0, 0.74, 0.16, 0.74);
      pt(G.box, trim, 0, 0, hy + 0.2, 0.32, -0.12, 0, 0, 0, 0, 0, 0.5, 0.05, 0.3);
      break;
  }
  // руки: при стрельбе подняты вперёд
  const armRx = -1.35 * p.aim + -sw * (1 - p.aim);
  limb(robe, 0.38, 1.05, 0, armRx, -0.15, 0.45, 0.2);
  limb(robe, -0.38, 1.05, 0, p.aim > 0.5 ? armRx : sw, 0.15, 0.45, 0.2);
  // оружие в правой руке: следует за рукой
  const gx = 0.38;
  const gy = 1.05;
  const ga = armRx;
  switch (look.gun) {
    case 'staff':
      pt(G.cyl, METAL, 0, gx, gy, 0, ga, 0, 0, 0, -0.5, 0.06, 0.07, 1.1, 0.07);
      pt(G.sph, glow, 1, gx, gy, 0, ga, 0, 0, 0, 0.66, 0.06, 0.24, 0.24, 0.24);
      break;
    case 'torch':
      pt(G.cyl, DARK, 0, gx, gy, 0, ga, 0, 0, 0, -0.45, 0.1, 0.16, 0.6, 0.16);
      pt(G.cone, glow, 1, gx, gy, 0, ga + Math.PI, 0, 0, 0, 0.45, -0.1, 0.24, 0.3, 0.24);
      break;
    case 'cannon':
      pt(G.cyl, trim, 0, gx, gy, 0, ga, 0, 0, 0, -0.6, 0.1, 0.24, 0.7, 0.24);
      pt(G.sph, glow, 0.8, gx, gy, 0, ga, 0, 0, 0, -0.62, 0.1, 0.2, 0.2, 0.2);
      break;
    case 'emitter':
      pt(G.box, DARK, 0, gx, gy, 0, ga, 0, 0, 0, -0.45, 0.08, 0.2, 0.5, 0.2);
      pt(G.sph, glow, 1, gx, gy, 0, ga, 0, 0, 0, -0.72, 0.08, 0.2, 0.2, 0.2);
      break;
    case 'rifle':
      pt(G.box, METAL, 0, gx, gy, 0, ga, 0, 0, 0, -0.55, 0.1, 0.14, 0.9, 0.2);
      pt(G.box, glow, 0.8, gx, gy, 0, ga, 0, 0, 0, -0.55, 0.22, 0.06, 0.6, 0.06);
      break;
    case 'dual':
      pt(G.box, DARK, 0, gx, gy, 0, ga, 0, 0, 0, -0.42, 0.08, 0.12, 0.34, 0.16);
      pt(G.box, DARK, 0, -gx, gy, 0, p.aim > 0.5 ? ga : sw, 0, 0, 0, -0.42, 0.08, 0.12, 0.34, 0.16);
      pt(G.box, glow, 1, gx, gy, 0, ga, 0, 0, 0, -0.6, 0.08, 0.05, 0.1, 0.05);
      break;
  }
}

// ---------- враги ----------

export type Body = 'humanoid' | 'skeleton' | 'brute' | 'beast' | 'bat' | 'blob' | 'caster' | 'spider' | 'skull' | 'knight' | 'goblin';

// pal: [основной, вторичный, глаза, акцент]
export function drawEnemy(body: Body, pal: [string, string, string, string], x: number, z: number, yaw: number, p: Pose, scale: number, flash: number, frozen: boolean) {
  let A = rgb(pal[0]);
  let B = rgb(pal[1]);
  const E = rgb(pal[2]);
  const C = rgb(pal[3]);
  if (frozen) {
    A = [0.6, 0.85, 1];
    B = [0.45, 0.7, 0.95];
  }
  if (flash > 0) {
    A = [1, 1, 1];
    B = [1, 1, 1];
  }
  const t = p.t * 9 + p.phase;
  const sw = Math.sin(t) * 0.6 * p.move;
  const bob = Math.abs(Math.sin(t)) * 0.06 * p.move;
  const eyeGlow = 1;
  switch (body) {
    case 'humanoid': {
      root(x, bob, z, yaw, scale);
      limb(B, 0.16, 0.58, 0, sw, 0, 0.55, 0.22);
      limb(B, -0.16, 0.58, 0, -sw, 0, 0.55, 0.22);
      pt(G.cap, B, 0, 0, 0.5, 0, 0.3, 0, 0, 0, 0, 0, 0.6, 0.36, 0.48);
      at(G.sph, A, 0, 0, 1.38, 0.18, 0.64, 0.62, 0.64);
      at(G.sph, E, eyeGlow, 0.12, 1.42, 0.46, 0.12, 0.12, 0.08);
      at(G.sph, E, eyeGlow, -0.12, 1.42, 0.46, 0.12, 0.12, 0.08);
      at(G.sph, C, 0.3, 0.12, 0.9, 0.3, 0.16, 0.16, 0.1);
      limb(A, 0.36, 1.05, 0.12, -1.3 + sw * 0.3, -0.1, 0.5, 0.18);
      limb(A, -0.36, 1.05, 0.12, -1.3 - sw * 0.3, 0.1, 0.5, 0.18);
      break;
    }
    case 'skeleton': {
      root(x, bob, z, yaw, scale);
      limb(A, 0.13, 0.62, 0, sw, 0, 0.58, 0.12);
      limb(A, -0.13, 0.62, 0, -sw, 0, 0.58, 0.12);
      pt(G.cyl, A, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.5, 0.1);
      for (let k = 0; k < 3; k++) pt(G.tor, A, 0, 0, 0.75 + k * 0.13, 0, 0, 0, 0, 0, 0, 0, 0.52 - k * 0.06, 0.9, 0.36);
      at(G.sph, A, 0, 0, 1.4, 0.04, 0.6, 0.58, 0.6);
      at(G.sph, E, eyeGlow, 0.11, 1.42, 0.27, 0.14, 0.14, 0.08);
      at(G.sph, E, eyeGlow, -0.11, 1.42, 0.27, 0.14, 0.14, 0.08);
      at(G.box, DARK, 0, 0, 1.24, 0.24, 0.24, 0.06, 0.06);
      limb(A, 0.32, 1.12, 0, -sw * 0.8 - p.aim * 1.2, -0.1, 0.5, 0.1);
      limb(A, -0.32, 1.12, 0, sw * 0.8 - p.aim * 1.2, 0.1, 0.5, 0.1);
      if (p.aim > 0) pt(G.tor, B, 0, -0.32, 1.12, 0, -1.2, 0, Math.PI / 2, 0, -0.55, 0, 0.7, 0.7, 0.7);
      break;
    }
    case 'brute': {
      root(x, bob * 0.6, z, yaw, scale);
      limb(B, 0.28, 0.5, 0, sw * 0.6, 0, 0.45, 0.3);
      limb(B, -0.28, 0.5, 0, -sw * 0.6, 0, 0.45, 0.3);
      pt(G.sph, A, 0, 0, 1.05, 0.05, 0.2, 0, 0, 0, 0, 0, 1.25, 1.05, 1.05);
      at(G.sph, B, 0, 0, 0.72, 0.12, 0.95, 0.5, 0.8);
      at(G.sph, A, 0, 0, 1.55, 0.42, 0.42, 0.4, 0.42);
      at(G.sph, E, eyeGlow, 0.09, 1.6, 0.6, 0.1, 0.1, 0.06);
      at(G.sph, E, eyeGlow, -0.09, 1.6, 0.6, 0.1, 0.1, 0.06);
      at(G.sph, C, 0.5, 0, 1.05, 0.55, 0.22, 0.22, 0.12);
      limb(A, 0.62, 1.3, 0.05, -0.4 + sw * 0.5, -0.25, 0.7, 0.32);
      limb(A, -0.62, 1.3, 0.05, -0.4 - sw * 0.5, 0.25, 0.7, 0.32);
      at(G.sph, A, 0, 0.66, 0.6, 0.35, 0.36, 0.36, 0.36);
      at(G.sph, A, 0, -0.66, 0.6, 0.35, 0.36, 0.36, 0.36);
      break;
    }
    case 'beast': {
      root(x, bob, z, yaw, scale);
      pt(G.cap, A, 0, 0, 0.75, -0.55, Math.PI / 2, 0, 0, 0, 0, 0, 0.5, 0.55, 0.46);
      at(G.sph, B, 0, 0, 0.62, 0.0, 0.42, 0.3, 0.9);
      for (const [lx, lz, ph] of [[0.17, 0.32, 0], [-0.17, 0.32, Math.PI], [0.17, -0.35, Math.PI], [-0.17, -0.35, 0]] as const) {
        limb(B, lx, 0.62, lz, Math.sin(t + ph) * 0.7 * p.move, 0, 0.4, 0.15);
      }
      at(G.sph, A, 0, 0, 0.95, 0.68, 0.48, 0.42, 0.52);
      at(G.sph, B, 0, 0, 0.86, 0.92, 0.26, 0.2, 0.28);
      at(G.sph, E, eyeGlow, 0.12, 1.02, 0.86, 0.1, 0.1, 0.06);
      at(G.sph, E, eyeGlow, -0.12, 1.02, 0.86, 0.1, 0.1, 0.06);
      pt(G.cone, A, 0, 0.15, 1.15, 0.6, 0, 0, -0.3, 0, 0, 0, 0.12, 0.26, 0.1);
      pt(G.cone, A, 0, -0.15, 1.15, 0.6, 0, 0, 0.3, 0, 0, 0, 0.12, 0.26, 0.1);
      pt(G.cone, C, 0.3, 0, 0.85, -0.58, -2.2 + Math.sin(t * 1.5) * 0.3, 0, 0, 0, 0, 0, 0.1, 0.5, 0.1);
      break;
    }
    case 'bat': {
      const hover = 1.2 + Math.sin(t * 0.7) * 0.15;
      root(x, hover, z, yaw, scale);
      at(G.sph, A, 0, 0, 0, 0, 0.6, 0.55, 0.55);
      at(G.sph, E, eyeGlow, 0.12, 0.05, 0.25, 0.11, 0.11, 0.06);
      at(G.sph, E, eyeGlow, -0.12, 0.05, 0.25, 0.11, 0.11, 0.06);
      pt(G.cone, A, 0, 0.16, 0.24, 0, 0, 0, -0.2, 0, 0, 0, 0.14, 0.28, 0.1);
      pt(G.cone, A, 0, -0.16, 0.24, 0, 0, 0, 0.2, 0, 0, 0, 0.14, 0.28, 0.1);
      const flap = Math.sin(p.t * 18 + p.phase) * 0.7;
      pt(G.box, B, 0, 0.22, 0, 0, 0, 0, flap, 0.45, 0, 0, 0.9, 0.06, 0.5);
      pt(G.box, B, 0, -0.22, 0, 0, 0, 0, -flap, -0.45, 0, 0, 0.9, 0.06, 0.5);
      at(G.cone, C, 0.4, 0, -0.3, 0, 0.12, 0.2, 0.12);
      break;
    }
    case 'blob': {
      const sq = 1 + Math.sin(t * 0.8) * 0.12;
      root(x, 0, z, yaw, scale);
      at(G.sph, A, 0.15, 0, 0.5 * sq, 0, 1.15 / Math.sqrt(sq), 1.0 * sq, 1.15 / Math.sqrt(sq));
      at(G.sph, B, 0, 0, 0.2, 0, 1.2, 0.35, 1.2);
      at(G.sph, WHITE, 0, 0.18, 0.62 * sq, 0.4, 0.2, 0.22, 0.12);
      at(G.sph, WHITE, 0, -0.18, 0.62 * sq, 0.4, 0.2, 0.22, 0.12);
      at(G.sph, E, eyeGlow, 0.18, 0.62 * sq, 0.47, 0.1, 0.12, 0.06);
      at(G.sph, E, eyeGlow, -0.18, 0.62 * sq, 0.47, 0.1, 0.12, 0.06);
      at(G.sph, C, 0.6, 0.25, 0.85 * sq, -0.1, 0.18, 0.18, 0.18);
      break;
    }
    case 'caster': {
      root(x, Math.sin(t * 0.5) * 0.05, z, yaw, scale);
      pt(G.robe, B, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9, 1.15, 0.85);
      pt(G.sph, B, 0, 0, 1.35, 0, 0, 0, 0, 0, 0, 0, 0.72, 0.75, 0.72);
      pt(G.cone, B, 0, 0, 1.6, -0.12, -0.45, 0, 0, 0, 0, 0, 0.45, 0.6, 0.45);
      at(G.sph, DARK, 0, 0, 1.33, 0.18, 0.5, 0.5, 0.3);
      at(G.sph, E, eyeGlow, 0.1, 1.36, 0.33, 0.1, 0.08, 0.06);
      at(G.sph, E, eyeGlow, -0.1, 1.36, 0.33, 0.1, 0.08, 0.06);
      at(G.box, A, 0, 0, 0.75, 0.38, 0.2, 0.5, 0.06);
      const st = -0.3 - p.aim * 0.9;
      pt(G.cyl, METAL, 0, 0.5, 1.1, 0.1, st, 0, -0.1, 0, -0.7, 0, 0.07, 1.6, 0.07);
      pt(G.sph, C, 1, 0.5, 1.1, 0.1, st, 0, -0.1, 0, 0.95, 0, 0.26, 0.26, 0.26);
      break;
    }
    case 'spider': {
      root(x, 0.15 + bob, z, yaw, scale);
      at(G.sph, A, 0, 0, 0.55, -0.45, 0.95, 0.8, 1.05);
      at(G.sph, B, 0, 0, 0.5, 0.2, 0.55, 0.45, 0.55);
      for (let k = 0; k < 4; k++) {
        const zz = 0.32 - k * 0.2;
        const ph = Math.sin(t + k * 1.3) * 0.35 * p.move;
        pt(G.box, B, 0, 0.18, 0.5, zz, 0, ph, 0.9, 0.42, 0, 0, 0.8, 0.07, 0.07);
        pt(G.box, B, 0, -0.18, 0.5, zz, 0, -ph, -0.9, -0.42, 0, 0, 0.8, 0.07, 0.07);
      }
      at(G.sph, E, eyeGlow, 0.1, 0.6, 0.45, 0.1, 0.1, 0.06);
      at(G.sph, E, eyeGlow, -0.1, 0.6, 0.45, 0.1, 0.1, 0.06);
      at(G.sph, C, 0.6, 0, 0.75, -0.45, 0.3, 0.2, 0.3);
      break;
    }
    case 'skull': {
      const hover = 0.9 + Math.sin(t * 0.6) * 0.18;
      root(x, hover, z, yaw, scale);
      at(G.sph, A, 0, 0, 0.3, 0, 0.95, 0.85, 0.9);
      pt(G.box, A, 0, 0, 0.02, 0.12, 0.2 + Math.abs(Math.sin(t)) * 0.2, 0, 0, 0, -0.08, 0.1, 0.5, 0.18, 0.45);
      at(G.sph, DARK, 0, 0.17, 0.35, 0.33, 0.24, 0.26, 0.15);
      at(G.sph, DARK, 0, -0.17, 0.35, 0.33, 0.24, 0.26, 0.15);
      at(G.sph, E, eyeGlow, 0.17, 0.35, 0.39, 0.12, 0.12, 0.06);
      at(G.sph, E, eyeGlow, -0.17, 0.35, 0.39, 0.12, 0.12, 0.06);
      pt(G.cone, C, 1, 0, 0.62, -0.1, -0.5, 0, Math.sin(t * 1.3) * 0.2, 0, 0, 0, 0.6, 0.9, 0.5);
      break;
    }
    case 'knight': {
      root(x, bob, z, yaw, scale);
      limb(METAL, 0.17, 0.6, 0, sw, 0, 0.55, 0.24);
      limb(METAL, -0.17, 0.6, 0, -sw, 0, 0.55, 0.24);
      pt(G.cap, B, 0, 0, 0.5, 0, 0.05, 0, 0, 0, 0, 0, 0.7, 0.38, 0.52);
      at(G.sph, METAL, 0, 0.42, 1.08, 0, 0.34, 0.28, 0.34);
      at(G.sph, METAL, 0, -0.42, 1.08, 0, 0.34, 0.28, 0.34);
      at(G.sph, METAL, 0, 0, 1.45, 0.02, 0.66, 0.68, 0.66);
      at(G.box, DARK, 0, 0, 1.47, 0.3, 0.42, 0.08, 0.08);
      at(G.box, E, 1, 0, 1.47, 0.33, 0.3, 0.04, 0.04);
      pt(G.cone, C, 0.3, 0, 1.75, -0.05, -0.4, 0, 0, 0, 0, 0, 0.1, 0.4, 0.3);
      limb(B, 0.42, 1.05, 0, -0.5 - p.aim, -0.1, 0.45, 0.2);
      pt(G.box, WHITE, 0, 0.42, 1.05, 0, -0.5 - p.aim, 0, 0, 0, -0.95, 0.15, 0.08, 1.0, 0.16);
      limb(B, -0.42, 1.05, 0, -0.7, 0.2, 0.42, 0.2);
      pt(G.box, A, 0, -0.42, 1.05, 0, -0.7, 0, 0.2, -0.05, -0.45, 0.22, 0.12, 0.75, 0.6);
      break;
    }
    case 'goblin': {
      root(x, bob, z, yaw, scale * 0.85);
      limb(B, 0.14, 0.45, 0, sw * 1.3, 0, 0.42, 0.18);
      limb(B, -0.14, 0.45, 0, -sw * 1.3, 0, 0.42, 0.18);
      pt(G.cap, A, 0, 0, 0.42, 0, 0.35, 0, 0, 0, 0, 0, 0.55, 0.3, 0.45);
      at(G.sph, A, 0, 0, 1.15, 0.22, 0.58, 0.52, 0.6);
      pt(G.cone, A, 0, 0.32, 1.22, 0.18, 0, 0, -1.2, 0, 0, 0, 0.14, 0.4, 0.1);
      pt(G.cone, A, 0, -0.32, 1.22, 0.18, 0, 0, 1.2, 0, 0, 0, 0.14, 0.4, 0.1);
      at(G.sph, E, eyeGlow, 0.11, 1.2, 0.47, 0.12, 0.12, 0.06);
      at(G.sph, E, eyeGlow, -0.11, 1.2, 0.47, 0.12, 0.12, 0.06);
      at(G.sph, B, 0, 0, 1.0, -0.42, 0.95, 1.0, 0.85);
      at(G.sph, GOLD, 0.6, 0.15, 1.45, -0.35, 0.22, 0.22, 0.22);
      at(G.sph, GOLD, 0.6, -0.12, 1.4, -0.3, 0.18, 0.18, 0.18);
      limb(A, 0.32, 0.9, 0.1, -sw, -0.3, 0.4, 0.14);
      limb(A, -0.32, 0.9, 0.1, sw, 0.3, 0.4, 0.14);
      break;
    }
  }
}

// ---------- мелкие модели: снаряды, кристаллы, предметы ----------

export function drawOrb(x: number, y: number, z: number, s: number, c: RGB, glow = 1) {
  root(x, y, z, 0, s);
  at(G.sph, c, glow, 0, 0, 0, 1, 1, 1);
}

export function drawGem(x: number, z: number, t: number, c: RGB, s = 1) {
  root(x, 0.35 + Math.sin(t * 3 + x) * 0.08, z, t * 2 + z, s);
  pt(G.cone, c, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.3, 0.3);
  pt(G.cone, c, 0.6, 0, 0, 0, Math.PI, 0, 0, 0, 0, 0, 0.3, 0.3, 0.3);
}

export function drawChest(x: number, z: number, t: number, legendary: boolean) {
  root(x, 0, z, 0.4, 1);
  const wood = legendary ? rgb('#c8641a') : rgb('#8a5a2a');
  at(G.box, wood, 0, 0, 0.35, 0, 1.1, 0.7, 0.75);
  pt(G.cyl, wood, 0, 0, 0.7, 0, 0, 0, Math.PI / 2, 0, -0.55, 0, 0.75, 1.1, 0.75);
  at(G.box, GOLD, 0.5 + Math.sin(t * 4) * 0.2, 0, 0.55, 0.39, 0.22, 0.26, 0.06);
  at(G.box, GOLD, 0.3, 0, 0.35, 0, 1.14, 0.1, 0.79);
}

export function drawShrine(x: number, z: number, t: number, c: RGB) {
  root(x, 0, z, 0, 1);
  at(G.cyl, rgb('#3a3450'), 0, 0, 0, 0, 1.6, 0.25, 1.6);
  at(G.box, rgb('#4a4064'), 0, 0, 1.1, 0, 0.5, 2, 0.5);
  root(x, 2.6 + Math.sin(t * 2) * 0.15, z, t, 1);
  pt(G.sph, c, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.55, 0.55, 0.55);
}

export function drawFountain(x: number, z: number, t: number) {
  root(x, 0, z, 0, 1);
  at(G.cyl, rgb('#5a5a70'), 0, 0, 0, 0, 2.2, 0.45, 2.2);
  at(G.cyl, rgb('#ff2d55'), 0.7, 0, 0.42, 0, 1.8, 0.06, 1.8);
  at(G.cyl, rgb('#5a5a70'), 0, 0, 0.4, 0, 0.3, 0.9, 0.3);
  root(x, 1.5 + Math.sin(t * 3) * 0.1, z, t, 1);
  at(G.sph, rgb('#ff6a8a'), 1, 0, 0, 0, 0.35, 0.35, 0.35);
}

export function drawHealOrb(x: number, z: number, t: number) {
  root(x, 0.5 + Math.sin(t * 4) * 0.1, z, t, 1);
  at(G.sph, rgb('#ff2d55'), 0.7, 0, 0, 0, 0.45, 0.45, 0.45);
  at(G.box, WHITE, 0.6, 0, 0, 0.22, 0.12, 0.3, 0.05);
  at(G.box, WHITE, 0.6, 0, 0, 0.22, 0.3, 0.12, 0.05);
}

export function drawMinion(x: number, z: number, yaw: number, p: Pose) {
  drawEnemy('humanoid', ['#2a8a5a', '#1a3a3a', '#7dff6a', '#7dff6a'], x, z, yaw, p, 0.85, 0, false);
}

export function drawTurret(x: number, z: number, yaw: number, c: RGB) {
  root(x, 0, z, 0, 1);
  at(G.cyl, METAL, 0, 0, 0, 0, 0.9, 0.5, 0.9);
  root(x, 0.5, z, yaw, 1);
  at(G.sph, rgb('#4a4a5e'), 0, 0, 0.25, 0, 0.7, 0.55, 0.7);
  pt(G.cyl, DARK, 0, 0, 0.3, 0, Math.PI / 2, 0, 0, 0, 0, 0, 0.14, 0.7, 0.14);
  at(G.sph, c, 1, 0, 0.3, 0.72, 0.14, 0.14, 0.14);
}

export function drawMech(x: number, z: number, yaw: number, p: Pose, glow: RGB) {
  const sw = Math.sin(p.t * 8) * 0.5 * p.move;
  root(x, 0, z, yaw, 1.35);
  limb(METAL, 0.3, 0.75, 0, sw, 0, 0.7, 0.32);
  limb(METAL, -0.3, 0.75, 0, -sw, 0, 0.7, 0.32);
  at(G.box, rgb('#8a8aa0'), 0, 0, 1.15, 0, 1.1, 0.8, 0.75);
  at(G.box, glow, 0.9, 0, 1.3, 0.38, 0.6, 0.14, 0.04);
  at(G.box, rgb('#5a5a6e'), 0, 0, 1.75, 0, 0.6, 0.4, 0.55);
  limb(METAL, 0.7, 1.4, 0, -1.3 * p.aim, -0.2, 0.75, 0.3);
  limb(METAL, -0.7, 1.4, 0, -1.3 * p.aim, 0.2, 0.75, 0.3);
}

// ---------- декорации ----------

export type PropKind = 'crate' | 'barrel' | 'pillar' | 'tomb' | 'lamp' | 'crystal' | 'vat' | 'pod' | 'skylight' | 'container' | 'cross' | 'candles' | 'brazier' | 'urn' | 'trap' | 'wall' | 'house';

export function drawProp(kind: PropKind, x: number, z: number, rot: number, s: number, a: RGB, b: RGB, glow: RGB, t: number, w = 1, d = 1) {
  root(x, 0, z, rot, s);
  switch (kind) {
    case 'crate':
      at(G.crate, a, 0, 0, 0.5, 0, 1, 1, 1);
      break;
    case 'barrel':
      at(G.barrel, a, 0, 0, 0, 0, 1, 1.1, 1);
      at(G.cyl, glow, 0.6, 0, 1.1, 0, 0.6, 0.04, 0.6);
      break;
    case 'urn':
      at(G.sph, a, 0, 0, 0.45, 0, 0.75, 0.85, 0.75);
      at(G.cyl, b, 0, 0, 0.8, 0, 0.35, 0.25, 0.35);
      break;
    case 'pillar':
      at(G.cyl, b, 0, 0, 0, 0, 1.3, 0.3, 1.3);
      at(G.cyl, a, 0, 0, 0.3, 0, 0.9, 3.2, 0.9);
      at(G.cyl, b, 0, 0, 3.5, 0, 1.2, 0.3, 1.2);
      at(G.box, glow, 0.8, 0, 2, 0.44, 0.12, 1.2, 0.05);
      break;
    case 'tomb':
      at(G.box, a, 0, 0, 0.75, 0, 1, 1.5, 0.35);
      pt(G.cyl, a, 0, 0, 1.5, 0, Math.PI / 2, 0, 0, 0, -0.18, 0, 1, 0.35, 0.5);
      at(G.box, glow, 0.8, 0, 1.0, 0.18, 0.12, 0.6, 0.04);
      at(G.box, glow, 0.8, 0, 1.15, 0.18, 0.4, 0.12, 0.04);
      at(G.box, b, 0, 0, 0.08, 0.3, 1.3, 0.16, 0.9);
      break;
    case 'cross':
      at(G.box, b, 0, 0, 0.1, 0, 0.8, 0.2, 0.8);
      at(G.box, glow, 1, 0, 1.3, 0, 0.18, 2.3, 0.18);
      at(G.box, glow, 1, 0, 1.8, 0, 1.0, 0.18, 0.18);
      break;
    case 'lamp':
      at(G.cyl, DARK, 0, 0, 0, 0, 0.14, 3, 0.14);
      at(G.box, DARK, 0, 0.35, 3, 0, 0.8, 0.1, 0.1);
      at(G.sph, glow, 1, 0.7, 2.85, 0, 0.32, 0.32, 0.32);
      break;
    case 'brazier':
      at(G.cyl, METAL, 0, 0, 0, 0, 0.2, 1, 0.2);
      at(G.cyl, METAL, 0, 0, 1, 0, 0.9, 0.3, 0.9);
      root(x, 1.3, z, t * 2, s);
      at(G.cone, glow, 1, 0, 0, 0, 0.6, 0.8 + Math.sin(t * 9 + x) * 0.15, 0.6);
      break;
    case 'crystal':
      at(G.crystal, glow, 0.55, 0, 0, 0, 1.4, 1.6, 1.4);
      break;
    case 'vat':
      at(G.cyl, METAL, 0, 0, 0, 0, 1.6, 0.35, 1.6);
      at(G.cyl, glow, 0.6, 0, 0.35, 0, 1.3, 1.8, 1.3);
      at(G.sph, a, 0, 0, 1.2, 0, 0.5, 0.7, 0.5);
      at(G.cyl, METAL, 0, 0, 2.15, 0, 1.6, 0.3, 1.6);
      break;
    case 'pod':
      at(G.sph, a, 0, 0, 0.6, 0, 1.4, 1.2, 1.4);
      at(G.sph, glow, 0.9, 0, 0.75, 0.45, 0.5, 0.5, 0.45);
      at(G.sph, b, 0, 0.5, 0.3, -0.3, 0.5, 0.4, 0.5);
      break;
    case 'candles':
      for (const [cx, cz, h] of [[0, 0, 0.6], [0.35, 0.15, 0.4], [-0.3, 0.2, 0.5]] as const) {
        at(G.cyl, rgb('#e8dcc4'), 0, cx, 0, cz, 0.16, h, 0.16);
        at(G.sph, glow, 1, cx, h + 0.12, cz, 0.1, 0.18, 0.1);
      }
      break;
    case 'trap':
      at(G.plate, a, 0, 0, 0.02, 0, 2.2, 1, 2.2);
      at(G.plate, glow, 0.5 + Math.max(0, Math.sin(t * 3 + x)) * 0.5, 0, 0.06, 0, 1.4, 0.6, 1.4);
      break;
    case 'container':
      at(G.box, a, 0, 0, 1.1, 0, 2.2 * w, 2.2, 5 * d);
      for (let k = -2; k <= 2; k++) at(G.box, b, 0, 0, 1.1, k * d, 2.3 * w, 2.25, 0.12);
      break;
    case 'skylight': {
      // стеклянный фонарь на крыше, как в референсе: рама и решётка над тёмным стеклом
      at(G.box, b, 0, 0, 0.3, 0, 4 * w, 0.6, 6 * d);
      at(G.box, rgb('#1a2230'), 0.15, 0, 0.62, 0, 3.6 * w, 0.06, 5.6 * d);
      for (let k = -2; k <= 2; k++) at(G.box, a, 0, 0, 0.7, k * 1.1 * d, 3.8 * w, 0.1, 0.12);
      for (const k of [-1, 0, 1]) at(G.box, a, 0, k * 1.2 * w, 0.7, 0, 0.12, 0.1, 5.8 * d);
      break;
    }
    case 'wall':
      at(G.box, a, 0, 0, 1.2, 0, w, 2.4, d);
      at(G.box, b, 0, 0, 2.5, 0, w + 0.2, 0.25, d + 0.2);
      break;
    case 'house': {
      at(G.box, a, 0, 0, 3, 0, w, 6, d);
      at(G.box, b, 0, 0, 6.2, 0, w + 0.4, 0.4, d + 0.4);
      // окна светятся
      const nx = Math.max(1, Math.floor(w / 2.4));
      for (let i = 0; i < nx; i++) {
        const ox = (i - (nx - 1) / 2) * 2.4;
        for (const oy of [2, 4.4]) {
          const lit = (Math.floor(x * 7 + z * 3 + i * 5 + oy) & 3) !== 0;
          at(G.box, lit ? glow : DARK, lit ? 0.7 : 0, ox, oy, d / 2 + 0.02, 1.1, 1.2, 0.05);
          at(G.box, lit ? glow : DARK, lit ? 0.7 : 0, ox, oy, -d / 2 - 0.02, 1.1, 1.2, 0.05);
        }
      }
      break;
    }
  }
}
