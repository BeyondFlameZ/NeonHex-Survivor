import { CanvasSource, Texture } from 'pixi.js';
import { BODY, PROP } from './art';
import type { EnemyDef, GroundStyle } from './levels';

// Арт задаётся пиксельными картами, но рисуется в HD: карта дважды сглаживается Scale2x (×4),
// затем получает объём, цветной контур и мягкую тень. Текстура отдаётся с resolution = кратности,
// поэтому в игре её размер в «точках» тот же, что у исходной карты, — масштабы спрайтов не меняются.
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
  return { c, g };
}

function toTex(c: HTMLCanvasElement, resolution = 1) {
  return new Texture({ source: new CanvasSource({ resource: c, resolution, scaleMode: 'linear' }) });
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
const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function shade(c: string, f: number) {
  return css(mul(rgb(c), f));
}

export const hexNum = (c: string) => parseInt(c.replace('#', ''), 16);

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

interface HdOpts {
  glow?: string; // символы-светлячки: без затенения
  times?: number; // 2 → ×4, 3 → ×8
  shadow?: boolean;
  white?: boolean; // белый силуэт для вспышки попадания
  flat?: boolean; // без объёма (снаряды, эффекты)
}

function hdCanvas(rows: readonly string[], pal: Pal, o: HdOpts = {}) {
  const times = o.times ?? 2;
  const S = 1 << times;
  const glow = o.glow ?? 'er';
  const G = upscale(rows, times);
  const H = G.length;
  const W = G[0].length;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && G[y][x] !== '.';
  const colors: Record<string, RGB> = {};
  for (const k in pal) colors[k] = rgb(pal[k]);
  const ink: RGB = [8, 5, 14];
  const sun: RGB = [255, 250, 235];
  const off = Math.max(1, S >> 1);

  const { c: body, g: bg } = canvas(W, H);
  const img = bg.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const row = G[y];
    for (let x = 0; x < W; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const base = colors[ch];
      if (!base) continue;
      let c: RGB;
      if (o.white) c = [255, 255, 255];
      else if (ch === 'k') {
        // цветной контур: затемнённый цвет ближайшей заливки вместо чистого чёрного
        let near: RGB | null = null;
        for (let r = 1; r <= S && !near; r++) {
          for (const [dx, dy] of [[0, -r], [r, 0], [0, r], [-r, 0]]) {
            const xx = x + dx;
            const yy = y + dy;
            if (op(xx, yy) && G[yy][xx] !== 'k' && colors[G[yy][xx]]) {
              near = colors[G[yy][xx]];
              break;
            }
          }
        }
        c = near ? mix(mul(near, 0.32), ink, 0.35) : base;
      } else if (o.flat || glow.includes(ch)) c = base;
      else {
        c = mul(base, 1.14 - 0.32 * (y / H));
        if (!op(x - off, y - off)) c = mix(c, sun, 0.28);
        else if (!op(x + off, y + off)) c = mul(c, 0.72);
      }
      const i = (y * W + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  bg.putImageData(img, 0, 0);

  const { c, g } = canvas(W, H);
  if (o.shadow && !o.white) {
    const rx = W * 0.3;
    const ry = S * 1.2;
    g.save();
    g.translate(W / 2, H - S * 1.2);
    g.scale(1, ry / rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }
  g.drawImage(body, 0, 0);
  return { c, S, G };
}

function hdTex(rows: readonly string[], pal: Pal, o: HdOpts = {}) {
  const { c, S } = hdCanvas(rows, pal, o);
  return toTex(c, S);
}

// маска контурного света для 8 направлений, считается по HD-сетке
function rimMask(G: readonly string[], S: number, dx: number, dy: number) {
  const H = G.length;
  const W = G[0].length;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && G[y][x] !== '.';
  const { c, g } = canvas(W, H);
  const img = g.createImageData(W, H);
  const d = img.data;
  const a = Math.max(1, Math.round(S * 0.75));
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
const magePal = (p: MagePal): Pal => ({ k: '#0a0818', w: '#e9fdff', ...p });

export const mageFrames = (p: MagePal) =>
  memo(`mage:${p.C}:${p.t}`, () => [hdTex(MAGE_A, magePal(p), { glow: 'tw', shadow: true }), hdTex(MAGE_B, magePal(p), { glow: 'tw', shadow: true })]);

export const mageGhost = () =>
  memo('mageGhost', () => hdTex(MAGE_A, magePal({ c: '#000', C: '#000', t: '#000', m: '#000' }), { white: true }));

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
    hdTex([...MECH_TOP, '...kMMk..kMMk...', '...kmmk..kmmk...', '..kkkkk..kkkkk..', '................', '................'], MECH_PAL, { glow: 'ty', shadow: true }),
    hdTex([...MECH_TOP, '..kMMk....kMMk..', '..kmmk....kmmk..', '.kkkkk....kkkkk.', '................', '................'], MECH_PAL, { glow: 'ty', shadow: true }),
  ]);

// ---------- враги ----------

function enemyPal(p: EnemyDef['pal']): Pal {
  return { k: '#0c0610', a: shade(p[0], 0.7), A: p[0], b: shade(p[1], 0.6), B: p[1], e: p[2], r: p[3], w: '#d8d0c0', m: '#7a7a8e' };
}

const bodyTimes = (d: EnemyDef) => ((d.size ?? 1) >= 3 ? 3 : 2);

// [кадр A, кадр B, белая вспышка]
export const enemyFrames = (d: EnemyDef) =>
  memo(`enemy:${d.name}:${d.body}`, () => {
    const body = BODY[d.body];
    const pal = enemyPal(d.pal);
    const t = bodyTimes(d);
    return [hdTex(body.a, pal, { times: t, shadow: true }), hdTex(body.b, pal, { times: t, shadow: true }), hdTex(body.a, pal, { times: t, white: true })];
  });

export const minionFrames = () =>
  memo('minion', () => {
    const pal = enemyPal(['#2a8a5a', '#1a3a3a', '#7dff6a', '#7dff6a']);
    return [hdTex(BODY.humanoid.a, pal, { shadow: true }), hdTex(BODY.humanoid.b, pal, { shadow: true })];
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

export const propTex = (kind: string, pal: Pal) =>
  memo(`prop:${kind}:${pal.a}:${pal.e}`, () => {
    const flatGlow = kind === 'crack' || kind === 'rune';
    return hdTex(PROP[kind], pal, { shadow: !flatGlow, flat: flatGlow });
  });

// ---------- живописный пол локаций ----------

export const GROUND_SIZE = 192;

export const groundTile = (src: GroundStyle, f = 1) =>
  memo(`ground:${src.pattern}:${src.base}:${f}`, () => {
    const S = GROUND_SIZE;
    const base = mul(rgb(src.base), f);
    const dark = mul(rgb(src.dark), f);
    const light = mul(rgb(src.light), f);
    const line = mul(rgb(src.line), f);
    const glow = rgb(src.glow);
    const { c, g } = canvas(S, S);
    const r = rng(src.base.charCodeAt(2) * 131 + src.pattern.length * 7);
    g.fillStyle = css(base);
    g.fillRect(0, 0, S, S);

    // всё рисуем с переносом через край — плитка бесшовная
    const wrap = (draw: (ox: number, oy: number) => void) => {
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) draw(ox, oy);
    };
    const blob = (x: number, y: number, rad: number, col: RGB, a: number) =>
      wrap((ox, oy) => {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, css(col, a));
        gr.addColorStop(1, css(col, 0));
        g.fillStyle = gr;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      });
    const path = (pts: number[], width: number, col: RGB, a: number, glowCol?: RGB) =>
      wrap((ox, oy) => {
        g.beginPath();
        g.moveTo(pts[0] + ox, pts[1] + oy);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] + ox, pts[i + 1] + oy);
        g.lineWidth = width;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = css(col, a);
        if (glowCol) {
          g.shadowColor = css(glowCol, 0.9);
          g.shadowBlur = 8;
        }
        g.stroke();
        g.shadowBlur = 0;
      });
    const walk = (len: number, step: number) => {
      const pts = [r() * S, r() * S];
      let a = r() * Math.PI * 2;
      for (let k = 0; k < len; k++) {
        a += (r() - 0.5) * 1.2;
        pts.push(pts[pts.length - 2] + Math.cos(a) * step, pts[pts.length - 1] + Math.sin(a) * step);
      }
      return pts;
    };

    for (let i = 0; i < 70; i++) blob(r() * S, r() * S, 10 + r() * 34, r() < 0.5 ? light : dark, 0.35 + r() * 0.3);

    switch (src.pattern) {
      case 'slab': {
        const seam = (pts: number[]) => {
          path(pts, 3, dark, 0.9);
          path(pts.map((v, i) => v + (i % 2 ? 1.5 : 1.5)), 1.2, light, 0.6);
        };
        seam([0, 0, S, 0]);
        seam([0, 96, S, 96]);
        seam([0, 0, 0, 96]);
        seam([110, 0, 110, 96]);
        seam([50, 96, 50, S]);
        seam([150, 96, 150, S]);
        for (let i = 0; i < 6; i++) path(walk(6, 7), 1.4, dark, 0.8);
        for (let i = 0; i < 10; i++) blob(r() * S, r() * S, 6 + r() * 10, mul([62, 84, 64], f), 0.35);
        path(walk(4, 6), 1.2, glow, 0.8, glow);
        break;
      }
      case 'basalt': {
        for (let i = 0; i < 8; i++) path(walk(8, 9), 2, line, 0.9);
        for (let i = 0; i < 3; i++) {
          const pts = walk(10, 9);
          path(pts, 2.4, mul([122, 42, 16], f), 0.9, glow);
          path(pts, 0.9, [255, 220, 120], 0.9);
        }
        break;
      }
      case 'ice': {
        for (let i = 0; i < 8; i++) {
          const x = r() * S;
          path([x, 0, x + S * 0.5, S], 8, light, 0.25);
        }
        for (let i = 0; i < 6; i++) path(walk(7, 8), 1.2, [220, 245, 255], 0.45);
        for (let i = 0; i < 14; i++) blob(r() * S, r() * S, 2 + r() * 2, [240, 252, 255], 0.9);
        break;
      }
      case 'flesh': {
        for (let i = 0; i < 12; i++) {
          const x = r() * S;
          const y = r() * S;
          const rad = 10 + r() * 16;
          blob(x, y, rad, dark, 0.6);
          wrap((ox, oy) => {
            g.beginPath();
            g.ellipse(x + ox, y + oy, rad, rad * (0.7 + r() * 0.3), r() * 3, 0, Math.PI * 2);
            g.lineWidth = 2;
            g.strokeStyle = css(line, 0.7);
            g.stroke();
          });
        }
        for (let i = 0; i < 3; i++) {
          const pts = walk(10, 8);
          path(pts, 2.2, mul([78, 98, 36], f), 0.8, glow);
        }
        break;
      }
      case 'cathedral': {
        for (let ty = 0; ty < 3; ty++) {
          for (let tx = 0; tx < 3; tx++) {
            const x = tx * 64;
            const y = ty * 64;
            const gr = g.createLinearGradient(x, y, x + 64, y + 64);
            const cc = (tx + ty) % 2 ? dark : light;
            gr.addColorStop(0, css(mix(cc, [255, 255, 255], 0.06), 0.8));
            gr.addColorStop(1, css(mul(cc, 0.85), 0.8));
            g.fillStyle = gr;
            g.fillRect(x + 2, y + 2, 60, 60);
          }
        }
        for (let k = 0; k <= S; k += 64) {
          path([k, 0, k, S], 3, mul(line, 0.7), 1);
          path([0, k, S, k], 3, mul(line, 0.7), 1);
        }
        for (let i = 0; i < 4; i++) path(walk(5, 7), 1.2, dark, 0.8);
        wrap((ox, oy) => {
          g.beginPath();
          g.arc(96 + ox, 96 + oy, 9, 0, Math.PI * 2);
          g.lineWidth = 1.6;
          g.strokeStyle = css(glow, 0.8);
          g.shadowColor = css(glow, 1);
          g.shadowBlur = 10;
          g.stroke();
          g.shadowBlur = 0;
        });
        break;
      }
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = css(r() < 0.5 ? mul(light, 1.15) : mul(dark, 0.85), 0.6);
      g.fillRect(r() * S, r() * S, 1 + r(), 1 + r());
    }
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
    return toTex(c);
  });

// ---------- предметы на карте ----------

export const healOrbTex = () =>
  memo('heal', () => hdTex(['.kkkkk.', 'kRRRRwk', 'kRrrRRk', 'kRrrrRk', 'kRRrRRk', 'kRRRRRk', '.kkkkk.'], { k: '#2a0610', R: '#ff2d55', r: '#a80a2a', w: '#ffd8e0' }, { glow: 'w' }));

export const shardPickTex = () =>
  memo('shardPick', () => hdTex(['..k..', '.kVk.', 'kVwVk', 'kVVvk', '.kvk.', '..k..'], { k: '#2a0a3a', V: '#c46bff', v: '#7a2ab0', w: '#ffffff' }, { glow: 'Vvw' }));

const CHEST_ROWS = ['..kkkkkkkk..', '.kbBBBBBBbk.', 'kbBBBBBBBBbk', 'kyyyyyyyyyyk', 'kbbbbkkbbbbk', 'kbBBbkykbBbk', 'kbBBbkkkbBbk', 'kbBBBBBBBBbk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk', '............'];

export const chestTex = (legendary = false) =>
  memo(`chest:${legendary}`, () =>
    hdTex(CHEST_ROWS, legendary ? { k: '#140804', b: '#7a3a0a', B: '#c8641a', y: '#ffd24a' } : { k: '#140a04', b: '#5a3a1a', B: '#8a5a2a', y: '#ffc94a' }, { glow: 'y', shadow: true }),
  );

export const shrineTex = () =>
  memo('shrine', () =>
    hdTex(
      ['....k....', '...kek...', '...kek...', '..kaeak..', '..kaAak..', '..kaAak..', '..kaeak..', '..kaAak..', '..kaAak..', '.kaaAaak.', '.kaAAAak.', 'kaaaaaaak', 'kbbbbbbbk', 'kkkkkkkkk', '.........'],
      { k: '#08050c', a: '#3a3450', A: '#5a5078', e: '#ffc94a', b: '#2a2438' },
      { glow: 'e', shadow: true },
    ),
  );

export const fountainTex = () =>
  memo('fountain', () =>
    hdTex(
      ['.....kk.....', '....kwwk....', '.....kk.....', '....kmmk....', '..kkkmmkkk..', '.kmeeeeeemk.', 'kmeewweeeemk', 'kmeeeeeweemk', '.kmmmmmmmmk.', '..kkkkkkkk..', '............'],
      { k: '#08050c', m: '#5a5a70', e: '#ff2d55', w: '#ffd8e0' },
      { glow: 'ew', shadow: true },
    ),
  );

// ---------- снаряды ----------

const flat = { flat: true, glow: '' };

export const boltTex = () => memo('bolt', () => hdTex(['.ttt.', 'twwwt', 'twWwt', 'twwwt', '.ttt.'], { t: '#3ef0ff', w: '#b8fbff', W: '#ffffff' }, flat));

export const orbTex = () => memo('orb', () => hdTex(['.ggg.', 'gwwwg', 'gwWwg', 'gwwwg', '.ggg.'], { g: '#a0a0a0', w: '#e0e0e0', W: '#ffffff' }, flat));

export const shardTex = () => memo('shard', () => hdTex(['kww...', 'kWWWww', 'kww...'], { k: '#4a7aa8', w: '#9ad8ff', W: '#ffffff' }, flat));

export const chakramTex = () =>
  memo('chakram', () => hdTex(['..www..', '.wkkkw.', 'wkW.Wkw', 'wk...kw', 'wkW.Wkw', '.wkkkw.', '..www..'], { w: '#e8f4ff', k: '#6a8aa8', W: '#ffffff' }, flat));

export const missileTex = () => memo('missile', () => hdTex(['.gg..', 'rgGGW', '.gg..'], { g: '#2a8a3a', G: '#7dff6a', W: '#ffffff', r: '#ff7a2d' }, flat));

export const turretTex = () =>
  memo('turret', () =>
    hdTex(['...kkk...', '..kyyyk..', 'kkkyWykkk', '..kmmmk..', '.kmMMMmk.', '.kmMMMmk.', 'kmmmmmmmk', 'kkkkkkkkk', '.........'], { k: '#08050c', y: '#ffc94a', W: '#fff3c0', m: '#4a4a5e', M: '#7a7a8e' }, { glow: 'yW', shadow: true }),
  );

export const crystalTex = () => memo('gem', () => hdTex(['..w..', '.wwl.', 'wwlld', 'wlldd', '.ldd.', '..d..'], { w: '#ffffff', l: '#cfcfcf', d: '#858585' }, flat));

export const droneTex = () => memo('drone', () => hdTex(['...m...', '..mMm..', '.mMwMm.', 'mMMwMMm', '.mmmmm.'], { m: '#8a4dff', M: '#c46bff', w: '#ffffff' }, flat));

export const mineTex = () => memo('mine', () => hdTex(['.kkkk.', 'kroork', 'koyyok', 'koyyok', 'kroork', '.kkkk.'], { k: '#1a0a06', r: '#5c1a0a', o: '#ff7a2d', y: '#ffd24a' }, { glow: 'oy' }));

export const meteorTex = () =>
  memo('meteor', () => hdTex(['..ooo..', '.oyyyo.', 'oyWWyyo', 'oyWWyyo', 'oyyyyyo', '.oyyyo.', '..ooo..'], { o: '#ff4a1a', y: '#ffb03a', W: '#fff3c0' }, flat));

export const pylonTex = () =>
  memo('pylon', () =>
    hdTex(['...t...', '..tWt..', '...t...', '..kkk..', '..kck..', '..kck..', '.kkckk.', '.kcCck.', '.kcCck.', 'kkkkkkk', '.......'], { t: '#3ef0ff', W: '#ffffff', k: '#0a0818', c: '#2d4a8f', C: '#3ef0ff' }, { glow: 'tWC', shadow: true }),
  );

// ---------- эффекты ----------

export const pixelTex = () =>
  memo('pixel', () => {
    const { c, g } = canvas(1, 1);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 1, 1);
    return toTex(c);
  });

// мягкая точка для искр и брызг: 2×2 точки мира-арта
export const dotTex = () =>
  memo('dot', () => {
    const S = 16;
    const { c, g } = canvas(S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    return toTex(c, 8);
  });

export const splatTextures = () =>
  memo('splat', () => {
    const out: Texture[] = [];
    for (let v = 0; v < 3; v++) {
      const S = 48;
      const { c, g } = canvas(S, S);
      const r = rng(101 + v * 17);
      for (let k = 0; k < 7; k++) {
        const x = S / 2 + (r() - 0.5) * 16;
        const y = S / 2 + (r() - 0.5) * 12;
        const rad = 5 + r() * 8;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(110,12,36,0.95)');
        gr.addColorStop(0.7, 'rgba(74,8,24,0.8)');
        gr.addColorStop(1, 'rgba(74,8,24,0)');
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let k = 0; k < 8; k++) {
        g.fillStyle = 'rgba(90,10,30,0.8)';
        g.beginPath();
        g.arc(S / 2 + (r() - 0.5) * 40, S / 2 + (r() - 0.5) * 34, 1 + r() * 1.6, 0, Math.PI * 2);
        g.fill();
      }
      out.push(toTex(c, 4));
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
    return toTex(c);
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
    return toTex(c);
  });

// гладкие цифры урона: 5×7 точек, как у старого пиксельного шрифта
export const digitTextures = () =>
  memo('digits', () => {
    const out: Texture[] = [];
    for (let n = 0; n < 10; n++) {
      const { c, g } = canvas(20, 28);
      g.font = '900 25px "Arial Black", "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(5,3,12,0.95)';
      g.strokeText(String(n), 10, 15);
      g.fillStyle = '#ffffff';
      g.fillText(String(n), 10, 15);
      out.push(toTex(c, 4));
    }
    return out;
  });

export const impactFrames = () =>
  memo('impact', () => {
    const S = 44;
    const m = S / 2;
    const out: Texture[] = [];
    for (let f = 0; f < 3; f++) {
      const { c, g } = canvas(S, S);
      g.lineCap = 'round';
      if (f === 0) {
        const gr = g.createRadialGradient(m, m, 0, m, m, 10);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, S, S);
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 3;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          g.beginPath();
          g.moveTo(m + Math.cos(a) * 4, m + Math.sin(a) * 4);
          g.lineTo(m + Math.cos(a) * 13, m + Math.sin(a) * 13);
          g.stroke();
        }
      } else if (f === 1) {
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(m, m, 12, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = 2.4;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          g.beginPath();
          g.moveTo(m + Math.cos(a) * 15, m + Math.sin(a) * 15);
          g.lineTo(m + Math.cos(a) * 20, m + Math.sin(a) * 20);
          g.stroke();
        }
      } else {
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 1.6;
        g.setLineDash([3, 4]);
        g.beginPath();
        g.arc(m, m, 18, 0, Math.PI * 2);
        g.stroke();
      }
      out.push(toTex(c, 4));
    }
    return out;
  });

// иконка для манифеста не нужна в игре — рисуется отдельно в public/
