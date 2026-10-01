import { CanvasSource, Texture } from 'pixi.js';
import { BODY, PROP } from './art';
import type { EnemyDef, GroundStyle } from './levels';

// Весь арт — пиксельные карты + палитры, рисуется в canvas один раз и кэшируется навсегда.
type Pal = Record<string, string>;

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

function toTex(c: HTMLCanvasElement, nearest = true) {
  return new Texture({ source: new CanvasSource({ resource: c, scaleMode: nearest ? 'nearest' : 'linear' }) });
}

function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function shade(c: string, f: number) {
  const [r, g, b] = hex(c);
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}

export const hexNum = (c: string) => parseInt(c.replace('#', ''), 16);

function drawMap(g: CanvasRenderingContext2D, rows: readonly string[], pal: Pal, white: boolean, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const col = white ? '#ffffff' : pal[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function shadow(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = 'rgba(0,0,0,0.45)';
  const sw = Math.round(w * 0.5);
  const x0 = Math.round((w - sw) / 2);
  g.fillRect(x0, h - 2, sw, 1);
  g.fillRect(x0 + 1, h - 1, sw - 2, 1);
}

type Rim = { dx: number; dy: number; color: string };

function opaque(rows: readonly string[], x: number, y: number) {
  return y >= 0 && y < rows.length && x >= 0 && x < rows[0].length && rows[y][x] !== '.';
}

function paintRim(g: CanvasRenderingContext2D, rows: readonly string[], rim: Rim) {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[0].length; x++) {
      if (!opaque(rows, x, y) || opaque(rows, x + rim.dx, y + rim.dy)) continue;
      g.fillStyle = rim.color;
      g.fillRect(x, y, 1, 1);
    }
  }
}

function charTex(rows: readonly string[], pal: Pal, white = false, rims: Rim[] = [], withShadow = true) {
  const w = rows[0].length;
  const h = rows.length;
  const { c, g } = canvas(w, h);
  if (withShadow) shadow(g, w, h);
  drawMap(g, rows, pal, white);
  for (const r of rims) paintRim(g, rows, r);
  return toTex(c);
}

function plainTex(rows: readonly string[], pal: Pal) {
  const { c, g } = canvas(rows[0].length, rows.length);
  drawMap(g, rows, pal, false);
  return toTex(c);
}

export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function rimMask(rows: readonly string[], dx: number, dy: number) {
  const { c, g } = canvas(rows[0].length, rows.length);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[0].length; x++) {
      if (!opaque(rows, x, y)) continue;
      if (!opaque(rows, x + dx, y + dy)) g.fillStyle = 'rgba(255,255,255,1)';
      else if (!opaque(rows, x + dx * 2, y + dy * 2)) g.fillStyle = 'rgba(255,255,255,0.35)';
      else continue;
      g.fillRect(x, y, 1, 1);
    }
  }
  return toTex(c);
}

// ---------- кибермаг ----------

const MAGE_PAL: Pal = { k: '#0a0818', c: '#1b2a5a', C: '#2d4a8f', t: '#3ef0ff', m: '#8a4dff', w: '#e9fdff' };
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
const MAGE_RIMS: Rim[] = [
  { dx: 1, dy: -1, color: '#8ff8ff' },
  { dx: -1, dy: 1, color: '#6a3bc4' },
];

export const mageFrames = () =>
  memo('mage', () => [charTex(MAGE_A, MAGE_PAL, false, MAGE_RIMS), charTex(MAGE_B, MAGE_PAL, false, MAGE_RIMS)]);

export const mageGhost = () => memo('mageGhost', () => charTex(MAGE_A, MAGE_PAL, true, [], false));

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
    charTex([...MECH_TOP, '...kMMk..kMMk...', '...kmmk..kmmk...', '..kkkkk..kkkkk..', '................', '................'], MECH_PAL, false, [
      { dx: 1, dy: -1, color: '#ffe8a0' },
    ]),
    charTex([...MECH_TOP, '..kMMk....kMMk..', '..kmmk....kmmk..', '.kkkkk....kkkkk.', '................', '................'], MECH_PAL, false, [
      { dx: 1, dy: -1, color: '#ffe8a0' },
    ]),
  ]);

// ---------- враги ----------

function enemyPal(p: EnemyDef['pal']): Pal {
  return {
    k: '#0c0610',
    a: shade(p[0], 0.62),
    A: p[0],
    b: shade(p[1], 0.6),
    B: p[1],
    e: p[2],
    r: p[3],
    w: '#d8d0c0',
    m: '#7a7a8e',
  };
}

// [кадр A, кадр B, белая вспышка]
export const enemyFrames = (d: EnemyDef) =>
  memo(`enemy:${d.name}:${d.body}`, () => {
    const body = BODY[d.body];
    const pal = enemyPal(d.pal);
    return [charTex(body.a, pal), charTex(body.b, pal), charTex(body.a, pal, true)];
  });

// перепрошитые мертвецы некрокода — тот же гуманоид, но в неоновой палитре
export const minionFrames = () =>
  memo('minion', () => {
    const pal = enemyPal(['#2a6a4a', '#1a2a2a', '#7dff6a', '#7dff6a']);
    const body = BODY.humanoid;
    return [charTex(body.a, pal, false, [{ dx: 1, dy: -1, color: '#7dff6a' }]), charTex(body.b, pal, false, [{ dx: 1, dy: -1, color: '#7dff6a' }])];
  });

// [кадр][направление]
export const rimMasks = (body: string) =>
  memo(`rim:${body}`, () => [BODY[body].a, BODY[body].b].map((rows) => DIRS.map(([dx, dy]) => rimMask(rows, dx, dy))));

// ---------- декорации ----------

export const propTex = (kind: string, pal: Pal) =>
  memo(`prop:${kind}:${pal.a}:${pal.e}`, () => charTex(PROP[kind], pal, false, [], kind !== 'crack' && kind !== 'rune'));

// ---------- пол локаций ----------

export const groundTile = (st: GroundStyle) =>
  memo(`ground:${st.pattern}:${st.base}`, () => {
    const S = 48;
    const { c, g } = canvas(S, S);
    const r = rng(st.base.length * 131 + st.pattern.length * 7);
    const px = (x: number, y: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(((x % S) + S) % S, ((y % S) + S) % S, 1, 1);
    };
    g.fillStyle = st.base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) px((r() * S) | 0, (r() * S) | 0, r() < 0.5 ? st.light : st.dark);

    const crack = (len: number, col: string, glow?: string) => {
      let x = (r() * S) | 0;
      let y = (r() * S) | 0;
      for (let k = 0; k < len; k++) {
        px(x, y, col);
        if (glow && r() < 0.18) px(x, y, glow);
        const d = (r() * 4) | 0;
        x += d === 0 ? 1 : d === 1 ? -1 : 0;
        y += d === 2 ? 1 : d === 3 ? -1 : 0;
      }
    };

    switch (st.pattern) {
      case 'slab': {
        g.fillStyle = st.line;
        g.fillRect(0, 0, S, 1);
        g.fillRect(0, 0, 1, S);
        g.fillRect(0, 24, 24, 1);
        g.fillRect(24, 24, 1, 24);
        g.fillRect(30, 0, 1, 24);
        for (let i = 0; i < 4; i++) crack(10, st.dark);
        for (let i = 0; i < 12; i++) px((r() * S) | 0, (r() * S) | 0, '#2a3a2a');
        px(40, 36, st.glow);
        break;
      }
      case 'basalt': {
        for (let i = 0; i < 6; i++) crack(18, st.line);
        for (let i = 0; i < 2; i++) crack(22, '#5a1a0a', st.glow);
        break;
      }
      case 'ice': {
        for (let y = 0; y < S; y += 6) for (let x = 0; x < S; x++) if (r() < 0.25) px(x + y, y, st.light);
        for (let i = 0; i < 4; i++) crack(16, st.line);
        for (let i = 0; i < 6; i++) px((r() * S) | 0, (r() * S) | 0, '#e8ffff');
        break;
      }
      case 'flesh': {
        for (let i = 0; i < 9; i++) {
          const cx = r() * S;
          const cy = r() * S;
          const rad = 3 + r() * 5;
          for (let a = 0; a < 40; a++) {
            const t = (a / 40) * Math.PI * 2;
            px((cx + Math.cos(t) * rad) | 0, (cy + Math.sin(t) * rad) | 0, st.line);
          }
        }
        for (let i = 0; i < 3; i++) crack(20, '#3a4a1a', st.glow);
        break;
      }
      case 'cathedral': {
        for (let ty = 0; ty < 3; ty++) {
          for (let tx = 0; tx < 3; tx++) {
            g.fillStyle = (tx + ty) % 2 ? st.dark : st.light;
            g.fillRect(tx * 16 + 1, ty * 16 + 1, 15, 15);
          }
        }
        g.fillStyle = st.line;
        for (let k = 0; k <= 48; k += 16) {
          g.fillRect(k, 0, 1, S);
          g.fillRect(0, k, S, 1);
        }
        for (let i = 0; i < 3; i++) crack(10, st.base);
        px(24, 24, st.glow);
        px(23, 24, '#6a2a8a');
        px(25, 24, '#6a2a8a');
        break;
      }
    }
    return toTex(c);
  });

// мягкий туман — линейная фильтрация, тонируется цветом локации
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
    return toTex(c, false);
  });

// ---------- предметы на карте ----------

export const healOrbTex = () =>
  memo('heal', () => plainTex(['.kkkkk.', 'kRRRRwk', 'kRrrRRk', 'kRrrrRk', 'kRRrRRk', 'kRRRRRk', '.kkkkk.'], { k: '#2a0610', R: '#ff2d55', r: '#a80a2a', w: '#ffd8e0' }));

export const chestTex = () =>
  memo('chest', () =>
    charTex(
      ['..kkkkkkkk..', '.kbBBBBBBbk.', 'kbBBBBBBBBbk', 'kyyyyyyyyyyk', 'kbbbbkkbbbbk', 'kbBBbkykbBbk', 'kbBBbkkkbBbk', 'kbBBBBBBBBbk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk', '............'],
      { k: '#140a04', b: '#5a3a1a', B: '#8a5a2a', y: '#ffc94a' },
    ),
  );

export const shrineTex = () =>
  memo('shrine', () =>
    charTex(
      ['....k....', '...kek...', '...kek...', '..kaeak..', '..kaAak..', '..kaAak..', '..kaeak..', '..kaAak..', '..kaAak..', '.kaaAaak.', '.kaAAAak.', 'kaaaaaaak', 'kbbbbbbbk', 'kkkkkkkkk', '.........'],
      { k: '#08050c', a: '#2a2438', A: '#4a4060', e: '#ffc94a', b: '#1a1624' },
    ),
  );

export const fountainTex = () =>
  memo('fountain', () =>
    charTex(
      ['.....kk.....', '....kwwk....', '.....kk.....', '....kmmk....', '..kkkmmkkk..', '.kmeeeeeemk.', 'kmeewweeeemk', 'kmeeeeeweemk', '.kmmmmmmmmk.', '..kkkkkkkk..', '............'],
      { k: '#08050c', m: '#4a4a5e', e: '#ff2d55', w: '#ffd8e0' },
    ),
  );

// ---------- снаряды и эффекты ----------

export const boltTex = () =>
  memo('bolt', () => plainTex(['.ttt.', 'twwwt', 'twWwt', 'twwwt', '.ttt.'], { t: '#3ef0ff', w: '#b8fbff', W: '#ffffff' }));

// белый шарик для тонирования (вражеские снаряды, ракеты)
export const orbTex = () =>
  memo('orb', () => plainTex(['.ggg.', 'gwwwg', 'gwWwg', 'gwwwg', '.ggg.'], { g: '#a0a0a0', w: '#e0e0e0', W: '#ffffff' }));

export const shardTex = () => memo('shard', () => plainTex(['kww...', 'kWWWww', 'kww...'], { k: '#4a7aa8', w: '#9ad8ff', W: '#ffffff' }));

export const chakramTex = () =>
  memo('chakram', () => plainTex(['..www..', '.wkkkw.', 'wkW.Wkw', 'wk...kw', 'wkW.Wkw', '.wkkkw.', '..www..'], { w: '#e8f4ff', k: '#6a8aa8', W: '#ffffff' }));

export const missileTex = () => memo('missile', () => plainTex(['.gg..', 'rgGGW', '.gg..'], { g: '#2a8a3a', G: '#7dff6a', W: '#ffffff', r: '#ff7a2d' }));

export const turretTex = () =>
  memo('turret', () =>
    charTex(['...kkk...', '..kyyyk..', 'kkkyWykkk', '..kmmmk..', '.kmMMMmk.', '.kmMMMmk.', 'kmmmmmmmk', 'kkkkkkkkk', '.........'], {
      k: '#08050c',
      y: '#ffc94a',
      W: '#fff3c0',
      m: '#4a4a5e',
      M: '#7a7a8e',
    }),
  );

export const crystalTex = () =>
  memo('gem', () => plainTex(['..w..', '.wwl.', 'wwlld', 'wlldd', '.ldd.', '..d..'], { w: '#ffffff', l: '#cfcfcf', d: '#858585' }));

export const droneTex = () =>
  memo('drone', () => plainTex(['...m...', '..mMm..', '.mMwMm.', 'mMMwMMm', '.mmmmm.'], { m: '#8a4dff', M: '#c46bff', w: '#ffffff' }));

export const mineTex = () =>
  memo('mine', () => plainTex(['.kkkk.', 'kroork', 'koyyok', 'koyyok', 'kroork', '.kkkk.'], { k: '#1a0a06', r: '#5c1a0a', o: '#ff7a2d', y: '#ffd24a' }));

export const meteorTex = () =>
  memo('meteor', () =>
    plainTex(['..ooo..', '.oyyyo.', 'oyWWyyo', 'oyWWyyo', 'oyyyyyo', '.oyyyo.', '..ooo..'], { o: '#ff4a1a', y: '#ffb03a', W: '#fff3c0' }),
  );

export const pylonTex = () =>
  memo('pylon', () =>
    charTex(
      ['...t...', '..tWt..', '...t...', '..kkk..', '..kck..', '..kck..', '.kkckk.', '.kcCck.', '.kcCck.', 'kkkkkkk', '.......'],
      { t: '#3ef0ff', W: '#ffffff', k: '#0a0818', c: '#2d4a8f', C: '#3ef0ff' },
    ),
  );

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
      const S = 12;
      const { c, g } = canvas(S, S);
      const r = rng(101 + v * 17);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5);
          if (d < 3 + r() * 2.2) {
            g.fillStyle = d < 2 ? '#6e0c24' : '#4a0818';
            g.fillRect(x, y, 1, 1);
          } else if (d < 6 && r() < 0.12) {
            g.fillStyle = '#4a0818';
            g.fillRect(x, y, 1, 1);
          }
        }
      }
      out.push(toTex(c));
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
    return toTex(c, false);
  });

export const vignetteTex = () =>
  memo('vignette', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const grad = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.72);
    grad.addColorStop(0, 'rgba(4,2,8,0)');
    grad.addColorStop(0.6, 'rgba(4,2,8,0.55)');
    grad.addColorStop(1, 'rgba(4,2,8,0.95)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return toTex(c, false);
  });

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
