import { CanvasSource, Texture } from 'pixi.js';

// Весь арт — пиксельные карты + палитры. Варианты врагов = palette swap одной карты, как в старых играх.
type Pal = Record<string, string>;

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

function drawMap(g: CanvasRenderingContext2D, rows: readonly string[], pal: Pal, white: boolean) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      g.fillStyle = white ? '#ffffff' : pal[ch];
      g.fillRect(x, y, 1, 1);
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

// rim = пиксели силуэта, у которых сосед в сторону света пустой. Перекрашивают контур — как в Hades.
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

// 8 направлений света; индекс = round(angle / 45°), ось Y вниз
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

// белая маска рим-лайта под направление: внешний пиксель 100%, следующий 35%. Красится tint'ом цвета источника.
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

function plainTex(rows: readonly string[], pal: Pal) {
  const { c, g } = canvas(rows[0].length, rows.length);
  drawMap(g, rows, pal, false);
  return toTex(c);
}

// ---------- кибермаг ----------

const MAGE_PAL: Pal = {
  k: '#0a0818',
  c: '#1b2a5a',
  C: '#2d4a8f',
  t: '#3ef0ff',
  m: '#8a4dff',
  w: '#e9fdff',
};

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

// двухцветный rim: холодный неон сверху-справа, фиолетовый отсвет снизу-слева
const MAGE_RIMS: Rim[] = [
  { dx: 1, dy: -1, color: '#8ff8ff' },
  { dx: -1, dy: 1, color: '#6a3bc4' },
];

export const mageFrames = () => [charTex(MAGE_A, MAGE_PAL, false, MAGE_RIMS), charTex(MAGE_B, MAGE_PAL, false, MAGE_RIMS)];

// силуэт для послеобразов рывка
export const mageGhost = () => charTex(MAGE_A, MAGE_PAL, true, [], false);

// ---------- нанозомби (3 палитры) ----------

const ZOMBIE_TOP = [
  '................',
  '.....kkkkk......',
  '....kgGGGgk.....',
  '....kGeGeGk.....',
  '....kgGGGgk.....',
  '....kgrggkk.....',
  '...kkkgggkkkkk..',
  '..kbbBBBBbgGGk..',
  '..kbBBrBBbkkkk..',
  '..kbBBBBBbk.....',
  '..kbbBBBbbk.....',
  '...kbbbbbk......',
];
const ZOMBIE_A = [...ZOMBIE_TOP, '...kbk.kbk......', '...kgk.kgk......', '...kkk.kkk......', '................'];
const ZOMBIE_B = [...ZOMBIE_TOP, '....kbkkbk......', '....kgkkgk......', '....kkkkkk......', '................'];

const ENEMY_PALS: Pal[] = [
  // 0 — нанозомби
  { k: '#120810', g: '#4f6a45', G: '#7c9a62', e: '#ffe14a', r: '#ff2d55', b: '#2e2340', B: '#4a3a66' },
  // 1 — берсерк
  { k: '#140606', g: '#8a3b2a', G: '#c8603a', e: '#fff27a', r: '#ff9a3c', b: '#3a1414', B: '#5c2020' },
  // 2 — мясной голем
  { k: '#0e0616', g: '#5a3a7a', G: '#8a5ab8', e: '#3ef0ff', r: '#c46bff', b: '#2a1a3a', B: '#43305c' },
];

// [кадр A, кадр B, белая вспышка попадания]
export const enemyFrames = (kind: number) => {
  const pal = ENEMY_PALS[kind];
  return [charTex(ZOMBIE_A, pal), charTex(ZOMBIE_B, pal), charTex(ZOMBIE_A, pal, true)];
};

// [кадр][направление] — формы у всех видов врагов общие, так что масок всего 16
export const enemyRimMasks = () => [ZOMBIE_A, ZOMBIE_B].map((rows) => DIRS.map(([dx, dy]) => rimMask(rows, dx, dy)));

// ---------- снаряды, лут, дроны ----------

export const boltTex = () =>
  plainTex(['.ttt.', 'twwwt', 'twWwt', 'twwwt', '.ttt.'], { t: '#3ef0ff', w: '#b8fbff', W: '#ffffff' });

// серый кристалл — цвет задаётся tint'ом
export const crystalTex = () =>
  plainTex(['..w..', '.wwl.', 'wwlld', 'wlldd', '.ldd.', '..d..'], { w: '#ffffff', l: '#cfcfcf', d: '#858585' });

export const droneTex = () =>
  plainTex(['...m...', '..mMm..', '.mMwMm.', 'mMMwMMm', '.mmmmm.'], { m: '#8a4dff', M: '#c46bff', w: '#ffffff' });

export const pixelTex = () => {
  const { c, g } = canvas(1, 1);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 1, 1);
  return toTex(c);
};

export const splatTextures = () => {
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
};

// ---------- окружение ----------

export const groundTile = () => {
  const S = 48;
  const { c, g } = canvas(S, S);
  const r = rng(7);
  g.fillStyle = '#0c0a1e';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 110; i++) {
    g.fillStyle = r() < 0.5 ? '#110d29' : '#09071a';
    g.fillRect((r() * S) | 0, (r() * S) | 0, 1, 1);
  }

  // швы плит и заклёпки
  g.fillStyle = '#18123a';
  g.fillRect(0, 0, S, 1);
  g.fillRect(0, 0, 1, S);
  g.fillRect(0, 24, 24, 1);
  g.fillRect(24, 24, 1, 24);
  g.fillStyle = '#2a2260';
  for (const [x, y] of [[2, 2], [S - 3, 2], [2, S - 3], [S - 3, S - 3], [26, 26]]) g.fillRect(x, y, 1, 1);

  // дорожки энергосети; яркие узлы подхватывает bloom
  const trace = (x0: number, y0: number, x1: number, y1: number) => {
    g.fillStyle = '#1b3550';
    g.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0) + 1, 1);
    g.fillRect(x1, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1);
    g.fillStyle = '#2a6a8a';
    g.fillRect(x0, y0, 1, 1);
    g.fillStyle = '#3ef0ff';
    g.fillRect(x1, y1, 1, 1);
  };
  trace(4, 10, 19, 18);
  trace(30, 6, 42, 20);
  trace(8, 40, 20, 33);
  trace(33, 44, 44, 36);
  return toTex(c);
};

export const lightTex = () => {
  const S = 256;
  const { c, g } = canvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return toTex(c, false);
};

export const vignetteTex = () => {
  const S = 256;
  const { c, g } = canvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.22, S / 2, S / 2, S * 0.72);
  grad.addColorStop(0, 'rgba(4,2,12,0)');
  grad.addColorStop(1, 'rgba(4,2,12,0.88)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return toTex(c, false);
};

// ---------- цифры урона: шрифт 3x5 с чёрной обводкой ----------

const DIGITS = [
  '111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111',
];

export const digitTextures = () =>
  DIGITS.map((d) => {
    const { c, g } = canvas(5, 7);
    g.fillStyle = '#05030c';
    for (let i = 0; i < 15; i++) if (d[i] === '1') g.fillRect(i % 3, (i / 3) | 0, 3, 3);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 15; i++) if (d[i] === '1') g.fillRect((i % 3) + 1, ((i / 3) | 0) + 1, 1, 1);
    return toTex(c);
  });

// ---------- вспышка попадания: 3 кадра, рисованная форма вместо россыпи частиц ----------

export const impactFrames = () => {
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
};

// ---------- оружие ----------

export const mineTex = () =>
  plainTex(['.kkkk.', 'kroork', 'koyyok', 'koyyok', 'kroork', '.kkkk.'], {
    k: '#1a0a06',
    r: '#5c1a0a',
    o: '#ff7a2d',
    y: '#ffd24a',
  });

export const meteorTex = () =>
  plainTex(['..ooo..', '.oyyyo.', 'oyWWyyo', 'oyWWyyo', 'oyyyyyo', '.oyyyo.', '..ooo..'], {
    o: '#ff4a1a',
    y: '#ffb03a',
    W: '#fff3c0',
  });

export const pylonTex = () =>
  charTex(
    ['...t...', '..tWt..', '...t...', '..kkk..', '..kck..', '..kck..', '.kkckk.', '.kcCck.', '.kcCck.', 'kkkkkkk', '.......'],
    { t: '#3ef0ff', W: '#ffffff', k: '#0a0818', c: '#2d4a8f', C: '#3ef0ff' },
  );
