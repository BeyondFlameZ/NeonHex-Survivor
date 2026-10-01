import { CanvasSource, Texture } from 'pixi.js';
import { BODY, PROP } from './art';
import type { EnemyDef, GroundStyle } from './levels';

// «Пререндеренный» пиксель-арт: карта дважды детальнее (Scale2x), по силуэту строится карта высот,
// из неё нормали и свет сверху-слева, затем свет квантуется в 5 тонов палитры с холодными тенями,
// тёплыми бликами и дизерингом. Пиксели остаются чёткими (nearest), формы — объёмными.
// Текстура отдаётся с resolution = кратности, поэтому 1 тексель = 1 единица мира, масштабы спрайтов прежние.
type Pal = Record<string, string>;
type RGB = [number, number, number];

const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  let v = cache.get(key) as T | undefined;
  if (v === undefined) {
    v = make();
    cache.set(key, v);
  }
  return v;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return { c, g };
}

function toTex(c: HTMLCanvasElement, resolution = 1, nearest = true) {
  return new Texture({ source: new CanvasSource({ resource: c, resolution, scaleMode: nearest ? 'nearest' : 'linear' }) });
}

function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function rgb(c: string): RGB {
  const h = c.replace('#', '');
  if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const mul = (c: RGB, f: number): RGB => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];
const mix = (a: RGB, b: RGB, t: number): RGB => [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];

export function shade(c: string, f: number) {
  const v = mul(rgb(c), f);
  return `rgb(${v[0]},${v[1]},${v[2]})`;
}

export const hexNum = (c: string) => parseInt(c.replace('#', ''), 16);

// ---------- общие части освещения ----------

const COOL: RGB = [42, 26, 74];
const WARM: RGB = [255, 242, 192];
const INK: RGB = [10, 6, 16];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LIGHT = (() => {
  const l = [-0.5, -0.72, 0.85];
  const n = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

// 5 тонов: тени уходят в холодный фиолетовый, блики — в тёплый
function ramp(base: RGB): RGB[] {
  return [mix(mul(base, 0.42), COOL, 0.35), mix(mul(base, 0.66), COOL, 0.18), base, mix(mul(base, 1.18), WARM, 0.12), mix(mul(base, 1.38), WARM, 0.32)];
}

const tone = (v: number) => (v < 0.55 ? 0 : v < 0.78 ? 1 : v < 0.98 ? 2 : v < 1.12 ? 3 : 4);

// чамфер-расстояние до ближайшей «внешней» клетки
function chamfer(W: number, H: number, inside: (i: number) => boolean) {
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = inside(i) ? 1e9 : 0;
  const D = Math.SQRT2;
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      d[i] = Math.min(d[i], get(x - 1, y) + 1, get(x, y - 1) + 1, get(x - 1, y - 1) + D, get(x + 1, y - 1) + D);
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      d[i] = Math.min(d[i], get(x + 1, y) + 1, get(x, y + 1) + 1, get(x + 1, y + 1) + D, get(x - 1, y + 1) + D);
    }
  }
  return d;
}

// ---------- Scale2x (EPX) по символам карты ----------

function scale2x(rows: readonly string[]): string[] {
  const h = rows.length;
  const w = rows[0].length;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : rows[y][x]);
  const out: string[][] = [];
  for (let y = 0; y < h * 2; y++) out.push(new Array<string>(w * 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = at(x, y);
      const A = at(x, y - 1);
      const B = at(x + 1, y);
      const C = at(x - 1, y);
      const D = at(x, y + 1);
      out[2 * y][2 * x] = C === A && C !== D && A !== B ? A : P;
      out[2 * y][2 * x + 1] = A === B && A !== C && B !== D ? B : P;
      out[2 * y + 1][2 * x] = D === C && D !== B && C !== A ? C : P;
      out[2 * y + 1][2 * x + 1] = B === D && B !== A && D !== C ? D : P;
    }
  }
  return out.map((r) => r.join(''));
}

function upscale(rows: readonly string[], times: number) {
  let g: string[] = [...rows];
  for (let k = 0; k < times; k++) g = scale2x(g);
  return g;
}

interface ShadeOpts {
  times?: number; // 1 → ×2, 3 → ×8 (боссы)
  glow?: string; // светящиеся символы: без затенения
  metal?: string; // символы с металлическим бликом
  shadow?: boolean;
  white?: boolean; // белый силуэт для вспышки
  flat?: boolean; // без объёма (снаряды)
}

function shade3d(rows: readonly string[], pal: Pal, o: ShadeOpts = {}) {
  const times = o.times ?? 1;
  const S = 1 << times;
  const glow = o.glow ?? 'er';
  const metal = o.metal ?? 'mw';
  const G = upscale(rows, times);
  const H = G.length;
  const W = G[0].length;
  const N = W * H;
  const ch = new Array<string>(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ch[y * W + x] = G[y][x];
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && ch[y * W + x] !== '.';

  const ds = chamfer(W, H, (i) => ch[i] !== '.');
  const dr = chamfer(W, H, (i) => {
    const c = ch[i];
    if (c === '.' || c === 'k') return false;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (op(x + a, y + b) && ch[(y + b) * W + x + a] !== c) return false;
    }
    return true;
  });
  const Rs = 3.5 * S;
  const Rr = 1.6 * S;
  const circ = (t: number) => Math.sqrt(1 - (1 - t) * (1 - t));
  const hm = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (ch[i] === '.') continue;
    hm[i] = 0.62 * circ(Math.min(1, ds[i] / Rs)) + 0.38 * circ(Math.min(1, dr[i] / Rr));
  }
  const h = (x: number, y: number) => (op(x, y) ? hm[y * W + x] : 0);

  const ramps: Record<string, RGB[]> = {};
  const bases: Record<string, RGB> = {};
  for (const k in pal) {
    bases[k] = rgb(pal[k]);
    ramps[k] = ramp(bases[k]);
  }

  const { c, g } = canvas(W, H);
  const img = g.createImageData(W, H);
  const d = img.data;
  const put = (i: number, col: RGB, a = 255) => {
    d[i * 4] = col[0];
    d[i * 4 + 1] = col[1];
    d[i * 4 + 2] = col[2];
    d[i * 4 + 3] = a;
  };

  // пиксельная тень с дизерингом по краю
  if (o.shadow && !o.white) {
    const cx = W / 2 - 0.5;
    const cy = H - S * 1.1;
    const rx = W * 0.32;
    const ry = S * 1.05;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (e < 0.55) put(y * W + x, INK, 120);
        else if (e < 1 && (x + y) % 2 === 0) put(y * W + x, INK, 80);
      }
    }
  }

  const K = 7;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = ch[i];
      if (k === '.') continue;
      const base = bases[k];
      if (!base) continue;
      if (o.white) {
        put(i, [255, 255, 255]);
        continue;
      }
      if (k === 'k') {
        // контур: снаружи тёмный (на освещённой стороне чуть цветной), внутри — тёмный тон соседа
        let near = '';
        for (let r = 1; r <= S + 1 && !near; r++) {
          for (const [a, b] of [[0, -r], [r, 0], [0, r], [-r, 0]]) {
            if (op(x + a, y + b) && ch[(y + b) * W + x + a] !== 'k' && ramps[ch[(y + b) * W + x + a]]) {
              near = ch[(y + b) * W + x + a];
              break;
            }
          }
        }
        const outer = !op(x + 1, y) || !op(x - 1, y) || !op(x, y + 1) || !op(x, y - 1);
        if (outer) {
          const lit = !op(x - 1, y) || !op(x, y - 1);
          put(i, near && lit ? mix(INK, ramps[near][0], 0.45) : INK);
        } else put(i, near ? mul(ramps[near][0], 0.8) : INK);
        continue;
      }
      if (o.flat || glow.includes(k)) {
        put(i, base);
        continue;
      }
      let nx = (-(h(x + 1, y) - h(x - 1, y)) * K) / 2;
      let ny = (-(h(x, y + 1) - h(x, y - 1)) * K) / 2;
      let nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      let v = 0.46 + 0.8 * diff - 0.12 * (y / H);
      if (metal.includes(k)) v += 0.55 * Math.pow(Math.max(0, 2 * diff * nz - LIGHT[2]), 10);
      v += (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 0.09;
      put(i, ramps[k][tone(v)]);
    }
  }
  g.putImageData(img, 0, 0);
  return { c, S, G };
}

function tex3d(rows: readonly string[], pal: Pal, o: ShadeOpts = {}) {
  const { c, S } = shade3d(rows, pal, o);
  return toTex(c, S);
}

// маска контурного света по детальной сетке (1 тексель шириной)
function rimMask(G: readonly string[], S: number, dx: number, dy: number) {
  const H = G.length;
  const W = G[0].length;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && G[y][x] !== '.';
  const { c, g } = canvas(W, H);
  const img = g.createImageData(W, H);
  const d = img.data;
  const a = Math.max(1, S >> 1);
  const b = a * 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!op(x, y)) continue;
      let al = 0;
      if (!op(x + dx * a, y + dy * a)) al = 255;
      else if (!op(x + dx * b, y + dy * b)) al = 90;
      else continue;
      const i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = al;
    }
  }
  g.putImageData(img, 0, 0);
  return toTex(c, S);
}

export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

// ---------- маг (палитра зависит от класса) ----------

export type MagePal = Record<'c' | 'C' | 't' | 'm', string>;

const MAGE_TOP = [
  '................',
  '......kkkk......',
  '.....kcCCck.....',
  '....kcCCCCck....',
  '....kckkkkck....',
  '....kkwttwkk....',
  '....kckkkkck....',
  '...kkcCCCCckk...',
  '..kmkcCttCckmk..',
  '..kwkcCttCckmk..',
  '...kkcCCCCckk...',
  '...kccCCCCcck...',
];
const MAGE_A = [...MAGE_TOP, '...kcCCmmCCck...', '..kccCCCCCCcck..', '..kkkkkkkkkkkk..', '................'];
const MAGE_B = [...MAGE_TOP, '..kccCCmmCCcck..', '...kcCCCCCCck...', '...kkkkkkkkkk...', '................'];
const magePal = (p: MagePal): Pal => ({ k: '#0a0818', w: '#e9fdff', ...p, C: p.C });

export const mageFrames = (p: MagePal) =>
  memo(`mage:${p.C}:${p.t}`, () => [
    tex3d(MAGE_A, magePal(p), { glow: 'tw', metal: '', shadow: true }),
    tex3d(MAGE_B, magePal(p), { glow: 'tw', metal: '', shadow: true }),
  ]);

export const mageGhost = () => memo('mageGhost', () => tex3d(MAGE_A, magePal({ c: '#000', C: '#000', t: '#000', m: '#000' }), { white: true }));

// ---------- мех-костюм ----------

const MECH_PAL: Pal = { k: '#0a0818', m: '#5a5a6e', M: '#8a8aa0', y: '#ffc94a', t: '#3ef0ff', w: '#e9e9ff' };
const MECH_TOP = [
  '................',
  '.....kkkkkk.....',
  '....kMMMMMMk....',
  '....kMttttMk....',
  '..kkkMMMMMMkkk..',
  '.kMMkmmmmmmkMMk.',
  'kMwMkmyMMymkMwMk',
  'kMMMkmMMMMmkMMMk',
  'kmMkkmmyymmkkMmk',
  '.kk.kmmmmmmk.kk.',
  '....kmmkkmmk....',
];
export const mechFrames = () =>
  memo('mech', () => [
    tex3d([...MECH_TOP, '...kMMk..kMMk...', '...kmmk..kmmk...', '..kkkkk..kkkkk..', '................', '................'], MECH_PAL, { glow: 'ty', metal: 'mMw', shadow: true }),
    tex3d([...MECH_TOP, '..kMMk....kMMk..', '..kmmk....kmmk..', '.kkkkk....kkkkk.', '................', '................'], MECH_PAL, { glow: 'ty', metal: 'mMw', shadow: true }),
  ]);

// ---------- враги ----------

function enemyPal(p: EnemyDef['pal']): Pal {
  return { k: '#0c0610', a: shade(p[0], 0.72), A: p[0], b: shade(p[1], 0.62), B: p[1], e: p[2], r: p[3], w: '#d8d0c0', m: '#8a8aa0' };
}

// у боссов детальнее сетка, чтобы тексель остался около 1 единицы мира
const bodyTimes = (d: EnemyDef) => ((d.size ?? 1) >= 3 ? 3 : 1);

// [кадр A, кадр B, белая вспышка]
export const enemyFrames = (d: EnemyDef) =>
  memo(`enemy:${d.name}:${d.body}`, () => {
    const body = BODY[d.body];
    const pal = enemyPal(d.pal);
    const t = bodyTimes(d);
    return [tex3d(body.a, pal, { times: t, shadow: true }), tex3d(body.b, pal, { times: t, shadow: true }), tex3d(body.a, pal, { times: t, white: true })];
  });

export const minionFrames = () =>
  memo('minion', () => {
    const pal = enemyPal(['#2a8a5a', '#1a3a3a', '#7dff6a', '#7dff6a']);
    return [tex3d(BODY.humanoid.a, pal, { shadow: true }), tex3d(BODY.humanoid.b, pal, { shadow: true })];
  });

// [кадр][направление]
export const rimMasks = (d: EnemyDef) =>
  memo(`rim:${d.body}:${bodyTimes(d)}`, () => {
    const t = bodyTimes(d);
    return [BODY[d.body].a, BODY[d.body].b].map((rows) => {
      const G = upscale(rows, t);
      return DIRS.map(([dx, dy]) => rimMask(G, 1 << t, dx, dy));
    });
  });

// ---------- декорации ----------

// плоские лежат на полу, высокие сортируются по глубине вместе с персонажами
export const FLAT_PROPS = new Set(['crack', 'rune', 'bones', 'candles']);

export const propTex = (kind: string, pal: Pal) =>
  memo(`prop:${kind}:${pal.a}:${pal.e}`, () => {
    const decal = kind === 'crack' || kind === 'rune';
    return tex3d(PROP[kind], pal, { shadow: !decal, flat: decal, metal: 'mw' });
  });

// ---------- объёмный пиксельный пол ----------

export const GROUND_SIZE = 96;

export const groundTile = (src: GroundStyle, f = 1) =>
  memo(`ground:${src.pattern}:${src.base}:${f}`, () => {
    const S = GROUND_SIZE;
    const N = S * S;
    const pat = src.pattern;
    const base = mul(rgb(src.base), f);
    const glowc = rgb(src.glow);
    const r = rng(pat.length * 31 + 7);
    const noise = new Float32Array(N);
    for (let i = 0; i < N; i++) noise[i] = r();
    const at = (x: number, y: number) => (((y % S) + S) % S) * S + (((x % S) + S) % S);
    const sm = (x: number, y: number) => {
      let s = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += noise[at(x + a, y + b)];
      return s / 9;
    };
    const Hm = new Float32Array(N);
    const mat = new Uint8Array(N); // 0 камень, 1 щель, 2 свечение
    const tint = new Float32Array(N).fill(1);

    if (pat === 'slab' || pat === 'cathedral') {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          let e: number;
          if (pat === 'cathedral') {
            const cx = x % 32;
            const cy = y % 32;
            e = Math.min(cx, cy, 31 - cx, 31 - cy);
            tint[i] = ((x >> 5) + (y >> 5)) % 2 ? 1.06 : 0.9;
          } else {
            const row = (y / 48) | 0;
            const off = row === 0 ? 0 : 24;
            const w = row === 0 ? 48 : 32;
            const cx = (x + off) % w;
            const cy = y % 48;
            e = Math.min(cx, cy, w - 1 - cx, 47 - cy);
            tint[i] = 0.94 + (0.12 * ((((((x + off) / w) | 0) * 7 + row * 3) % 3) / 2));
          }
          if (e < 1.5) mat[i] = 1;
          else Hm[i] = Math.min(1, (e - 1) / 3);
        }
      }
    } else {
      const n = pat === 'basalt' ? 12 : pat === 'ice' ? 9 : 16;
      const pr = rng(7 + pat.length);
      const pts: number[] = [];
      for (let k = 0; k < n; k++) pts.push(pr() * S, pr() * S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          let d1 = 1e9;
          let d2 = 1e9;
          let bi = 0;
          for (let k = 0; k < n; k++) {
            let dx = Math.abs(x - pts[k * 2]);
            let dy = Math.abs(y - pts[k * 2 + 1]);
            dx = Math.min(dx, S - dx);
            dy = Math.min(dy, S - dy);
            const dd = Math.hypot(dx, dy);
            if (dd < d1) {
              d2 = d1;
              d1 = dd;
              bi = k;
            } else if (dd < d2) d2 = dd;
          }
          const i = y * S + x;
          const e = (d2 - d1) / 2;
          tint[i] = 0.92 + (0.16 * ((bi * 37) % 5)) / 4;
          if (e < 1.2) {
            mat[i] = (pat === 'basalt' && bi % 3 === 0) || (pat === 'flesh' && e < 0.55 && bi % 4 === 0) ? 2 : 1;
          } else {
            const t = Math.min(1, (e - 1.2) / (pat === 'flesh' ? 5 : 3));
            Hm[i] = pat === 'flesh' ? Math.sqrt(1 - (1 - t) * (1 - t)) : t;
          }
        }
      }
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (mat[y * S + x] === 0) Hm[y * S + x] = Hm[y * S + x] * 0.85 + sm(x, y) * 0.15;

    const rm = ramp(base);
    const gap = mix(mul(base, 0.35), COOL, 0.4);
    const { c, g } = canvas(S, S);
    const img = g.createImageData(S, S);
    const d = img.data;
    const put = (i: number, col: RGB) => {
      d[i * 4] = col[0];
      d[i * 4 + 1] = col[1];
      d[i * 4 + 2] = col[2];
      d[i * 4 + 3] = 255;
    };
    const K = 5;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        if (mat[i] === 2) {
          put(i, noise[i] > 0.4 ? mix(glowc, [255, 240, 200], 0.3 * noise[i]) : mul(glowc, 0.75));
          continue;
        }
        if (mat[i] === 1) {
          put(i, gap);
          continue;
        }
        let nx = (-(Hm[at(x + 1, y)] - Hm[at(x - 1, y)]) * K) / 2;
        let ny = (-(Hm[at(x, y + 1)] - Hm[at(x, y - 1)]) * K) / 2;
        let nz = 1;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
        let v = (0.47 + 0.72 * diff) * tint[i];
        const spec = Math.pow(Math.max(0, 2 * diff * nz - LIGHT[2]), 8);
        if (pat === 'ice') v += 0.25 * spec;
        if (pat === 'flesh') v += 0.2 * spec;
        v += (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 0.1;
        put(i, rm[tone(v)]);
      }
    }
    // трещины с глубиной: тёмная линия и светлая кромка под ней
    for (let k = 0; k < 5; k++) {
      let x = (r() * S) | 0;
      let y = (r() * S) | 0;
      let a = r() * Math.PI * 2;
      for (let s = 0; s < 14; s++) {
        a += (r() - 0.5) * 1.2;
        x = (x + Math.round(Math.cos(a)) + S) % S;
        y = (y + Math.round(Math.sin(a)) + S) % S;
        if (mat[y * S + x] === 0) {
          put(y * S + x, gap);
          put(at(x, y + 1), rm[3]);
        }
      }
    }
    if (pat === 'cathedral') {
      for (const [cx, cy] of [[16, 16], [80, 48], [48, 80]]) {
        for (let a = 0; a < 24; a++) {
          const t = (a / 24) * Math.PI * 2;
          put(at(cx + Math.round(Math.cos(t) * 5), cy + Math.round(Math.sin(t) * 5)), glowc);
        }
      }
    }
    if (pat === 'slab') {
      const moss = mix(rgb('#3e5440'), base, 0.3);
      for (let k = 0; k < 30; k++) {
        const i = ((r() * S) | 0) * S + ((r() * S) | 0);
        if (mat[i] === 0) put(i, moss);
      }
    }
    g.putImageData(img, 0, 0);
    return toTex(c);
  });

export const fogTex = () =>
  memo('fog', () => {
    const S = 128;
    const { c, g } = canvas(S, S);
    const r = rng(99);
    for (let i = 0; i < 26; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 14 + r() * 30;
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
          grad.addColorStop(0, 'rgba(255,255,255,0.35)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grad;
          g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
        }
      }
    }
    return toTex(c, 1, false);
  });

// ---------- предметы на карте ----------

export const healOrbTex = () =>
  memo('heal', () => tex3d(['.kkkkk.', 'kRRRRwk', 'kRrrRRk', 'kRrrrRk', 'kRRrRRk', 'kRRRRRk', '.kkkkk.'], { k: '#2a0610', R: '#ff2d55', r: '#c81a3a', w: '#ffd8e0' }, { glow: 'w', metal: 'R' }));

export const shardPickTex = () =>
  memo('shardPick', () => tex3d(['..k..', '.kVk.', 'kVwVk', 'kVVvk', '.kvk.', '..k..'], { k: '#2a0a3a', V: '#c46bff', v: '#8a3ad0', w: '#ffffff' }, { glow: 'w', metal: 'Vv' }));

const CHEST_ROWS = ['..kkkkkkkk..', '.kbBBBBBBbk.', 'kbBBBBBBBBbk', 'kyyyyyyyyyyk', 'kbbbbkkbbbbk', 'kbBBbkykbBbk', 'kbBBbkkkbBbk', 'kbBBBBBBBBbk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk', '............'];

export const chestTex = (legendary = false) =>
  memo(`chest:${legendary}`, () =>
    tex3d(CHEST_ROWS, legendary ? { k: '#140804', b: '#7a3a0a', B: '#c8641a', y: '#ffd24a' } : { k: '#140a04', b: '#5a3a1a', B: '#8a5a2a', y: '#ffc94a' }, { glow: '', metal: 'y', shadow: true }),
  );

export const shrineTex = () =>
  memo('shrine', () =>
    tex3d(
      ['....k....', '...kek...', '...kek...', '..kaeak..', '..kaAak..', '..kaAak..', '..kaeak..', '..kaAak..', '..kaAak..', '.kaaAaak.', '.kaAAAak.', 'kaaaaaaak', 'kbbbbbbbk', 'kkkkkkkkk', '.........'],
      { k: '#08050c', a: '#3a3450', A: '#5a5078', e: '#ffc94a', b: '#2a2438' },
      { glow: 'e', shadow: true },
    ),
  );

export const fountainTex = () =>
  memo('fountain', () =>
    tex3d(
      ['.....kk.....', '....kwwk....', '.....kk.....', '....kmmk....', '..kkkmmkkk..', '.kmeeeeeemk.', 'kmeewweeeemk', 'kmeeeeeweemk', '.kmmmmmmmmk.', '..kkkkkkkk..', '............'],
      { k: '#08050c', m: '#5a5a70', e: '#ff2d55', w: '#ffd8e0' },
      { glow: 'ew', metal: 'm', shadow: true },
    ),
  );

// ---------- снаряды: чёткие, без объёма ----------

const flat: ShadeOpts = { flat: true, glow: '' };

export const boltTex = () => memo('bolt', () => tex3d(['.ttt.', 'twwwt', 'twWwt', 'twwwt', '.ttt.'], { t: '#3ef0ff', w: '#b8fbff', W: '#ffffff' }, flat));

export const orbTex = () => memo('orb', () => tex3d(['.ggg.', 'gwwwg', 'gwWwg', 'gwwwg', '.ggg.'], { g: '#a0a0a0', w: '#e0e0e0', W: '#ffffff' }, flat));

export const shardTex = () => memo('shard', () => tex3d(['kww...', 'kWWWww', 'kww...'], { k: '#4a7aa8', w: '#9ad8ff', W: '#ffffff' }, flat));

export const chakramTex = () =>
  memo('chakram', () => tex3d(['..www..', '.wkkkw.', 'wkW.Wkw', 'wk...kw', 'wkW.Wkw', '.wkkkw.', '..www..'], { w: '#e8f4ff', k: '#6a8aa8', W: '#ffffff' }, flat));

export const missileTex = () => memo('missile', () => tex3d(['.gg..', 'rgGGW', '.gg..'], { g: '#2a8a3a', G: '#7dff6a', W: '#ffffff', r: '#ff7a2d' }, flat));

export const turretTex = () =>
  memo('turret', () =>
    tex3d(['...kkk...', '..kyyyk..', 'kkkyWykkk', '..kmmmk..', '.kmMMMmk.', '.kmMMMmk.', 'kmmmmmmmk', 'kkkkkkkkk', '.........'], { k: '#08050c', y: '#ffc94a', W: '#fff3c0', m: '#4a4a5e', M: '#7a7a8e' }, { glow: 'yW', metal: 'mM', shadow: true }),
  );

export const crystalTex = () => memo('gem', () => tex3d(['..w..', '.wwl.', 'wwlld', 'wlldd', '.ldd.', '..d..'], { w: '#ffffff', l: '#cfcfcf', d: '#858585' }, flat));

export const droneTex = () =>
  memo('drone', () => tex3d(['...m...', '..mMm..', '.mMwMm.', 'mMMwMMm', '.mmmmm.'], { m: '#8a4dff', M: '#c46bff', w: '#ffffff' }, { glow: 'w', metal: 'mM' }));

export const mineTex = () => memo('mine', () => tex3d(['.kkkk.', 'kroork', 'koyyok', 'koyyok', 'kroork', '.kkkk.'], { k: '#1a0a06', r: '#5c1a0a', o: '#ff7a2d', y: '#ffd24a' }, { glow: 'oy' }));

export const meteorTex = () =>
  memo('meteor', () => tex3d(['..ooo..', '.oyyyo.', 'oyWWyyo', 'oyWWyyo', 'oyyyyyo', '.oyyyo.', '..ooo..'], { o: '#ff4a1a', y: '#ffb03a', W: '#fff3c0' }, flat));

export const pylonTex = () =>
  memo('pylon', () =>
    tex3d(['...t...', '..tWt..', '...t...', '..kkk..', '..kck..', '..kck..', '.kkckk.', '.kcCck.', '.kcCck.', 'kkkkkkk', '.......'], { t: '#3ef0ff', W: '#ffffff', k: '#0a0818', c: '#2d4a8f', C: '#3ef0ff' }, { glow: 'tWC', shadow: true }),
  );

// ---------- эффекты (пиксельные) ----------

export const pixelTex = () =>
  memo('pixel', () => {
    const { c, g } = canvas(1, 1);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 1, 1);
    return toTex(c);
  });

export const splatTextures = () =>
  memo('splat', () => {
    const out: Texture[] = [];
    for (let v = 0; v < 3; v++) {
      const S = 24;
      const { c, g } = canvas(S, S);
      const r = rng(101 + v * 17);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5);
          if (d < 6 + r() * 4) {
            g.fillStyle = d < 3 ? '#7a1028' : d < 5 ? '#5e0c20' : '#4a0818';
            g.fillRect(x, y, 1, 1);
          } else if (d < 11 && r() < 0.1) {
            g.fillStyle = '#4a0818';
            g.fillRect(x, y, 1, 1);
          }
        }
      }
      out.push(toTex(c, 2));
    }
    return out;
  });

export const lightTex = () =>
  memo('light', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return toTex(c, 1, false);
  });

export const vignetteTex = () =>
  memo('vignette', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const grad = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
    grad.addColorStop(0, 'rgba(4,2,8,0)');
    grad.addColorStop(0.65, 'rgba(4,2,8,0.28)');
    grad.addColorStop(1, 'rgba(4,2,8,0.75)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return toTex(c, 1, false);
  });

// пиксельные цифры 3×5 с тенью
const DIGITS = [
  '111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111',
];

export const digitTextures = () =>
  memo('digits', () =>
    DIGITS.map((d) => {
      const { c, g } = canvas(5, 7);
      g.fillStyle = '#05030c';
      for (let i = 0; i < 15; i++) if (d[i] === '1') g.fillRect(i % 3, (i / 3) | 0, 3, 3);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 15; i++) if (d[i] === '1') g.fillRect((i % 3) + 1, ((i / 3) | 0) + 1, 1, 1);
      return toTex(c);
    }),
  );

export const impactFrames = () =>
  memo('impact', () => {
    const S = 11;
    const m = 5;
    const out: Texture[] = [];
    for (let f = 0; f < 3; f++) {
      const { c, g } = canvas(S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = x - m;
          const dy = y - m;
          const d = Math.hypot(dx, dy);
          const axis = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
          let a = 0;
          if (f === 0) a = d <= 1.5 ? 1 : axis && d <= 2.9 ? 0.8 : 0;
          else if (f === 1) a = Math.abs(d - 3) < 0.6 ? 0.9 : axis && d > 3.5 && d <= 5 ? 1 : 0;
          else a = Math.abs(d - 4.4) < 0.55 && (x + y) % 2 === 0 ? 0.6 : 0;
          if (a === 0) continue;
          g.fillStyle = `rgba(255,255,255,${a})`;
          g.fillRect(x, y, 1, 1);
        }
      }
      out.push(toTex(c));
    }
    return out;
  });
