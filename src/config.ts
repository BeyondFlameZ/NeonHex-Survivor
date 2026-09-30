export const CFG = {
  dt: 1 / 60,
  px: 2, // 1 пиксель арта = 2 единицы мира
  bloom: true,

  maxEnemies: 2500,
  maxBullets: 800,
  maxGems: 1500,
  maxSparks: 2500,
  maxGibs: 1200,
  maxDecals: 300,
  maxImpacts: 300,
  maxGhosts: 40,
  maxNumbers: 200,
  maxLights: 96,

  cell: 48,
  gridCols: 96,
  gridRows: 96,
  far: 1400,

  boltRange: 520,
  boltRadius: 6,
  enemyMaxR: 22,

  player: { speed: 170, radius: 12, hp: 100, pickup: 80, iframes: 0.35 },
  enemy: { contactDmg: 8 },
  drone: { orbit: 72, radius: 12 },
  dash: { time: 0.16, mult: 3.4, cooldown: 1.1, iframes: 0.24 },
  spawn: { base: 1.2, perMin: 6, maxRate: 45 },
} as const;

export const COL = {
  bg: 0x0c0a1e,
  arcane: 0x3ef0ff,
  crystal: 0xc46bff,
  blood: 0xff2d55,
  bloodDark: 0x8a1030,
  gold: 0xffc94a,
  hpBack: 0x2a1a5e,
} as const;
