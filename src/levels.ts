import type { RunResult } from './save';

// поведения врагов
export const B = {
  CHASE: 0,
  FLY: 1,
  RANGED: 2,
  CHARGE: 3,
  EXPLODE: 4,
  SPLIT: 5,
  SUMMON: 6,
  HEAL: 7,
  BLINK: 8,
  SPIT: 9,
  TANK: 10,
  BOSS: 11,
} as const;

export const BEH_NAME = [
  'Преследует',
  'Летает',
  'Стреляет издалека',
  'Делает рывок',
  'Взрывается рядом',
  'Делится при смерти',
  'Призывает помощь',
  'Лечит союзников',
  'Телепортируется',
  'Плюётся кислотой',
  'Живучий танк',
  'Босс',
];

// [основной, вторичный, глаза, акцент]
export type Pal4 = [string, string, string, string];

export interface EnemyDef {
  name: string;
  body: string;
  pal: Pal4;
  beh: number;
  hp: number;
  spd: number;
  dmg: number;
  r: number;
  size?: number;
  xp?: number;
  kbr?: number;
  cd?: number;
  proj?: number;
  child?: number;
  count?: number;
}

export interface BossDef extends EnemyDef {
  title: string;
  patterns: string[];
}

export interface GroundStyle {
  pattern: 'slab' | 'basalt' | 'ice' | 'flesh' | 'cathedral';
  base: string;
  dark: string;
  light: string;
  line: string;
  glow: string;
}

export interface PropDef {
  kind: string;
  pal: Record<string, string>;
  weight: number;
  light?: number;
  anim?: string;
}

export interface LevelDef {
  name: string;
  sub: string;
  desc: string;
  ground: GroundStyle;
  fog: string;
  torch: number;
  props: PropDef[];
  enemies: EnemyDef[];
  boss: BossDef;
  hpMul: number;
  dmgMul: number;
  rate: number;
  bossAt: number;
  killGoal: number;
  special: { text: string; check: (r: RunResult) => boolean };
  unlock: string;
}

const pp = (a: string, A: string, e: string, r: string, b = '#2a2a38', B = '#3a3a4a'): Record<string, string> => ({
  k: '#08050c',
  a,
  A,
  b,
  B,
  e,
  r,
  w: '#d8d0c0',
  m: '#5a5a6e',
});

// время появления типа (сек) и частота
export const UNLOCK_AT = [0, 25, 60, 100, 140, 190, 240, 300, 360];
export const WEIGHT = [10, 6, 5, 5, 4, 3, 3, 3, 3];
export const ELITE_AT = [150, 300, 420];

export const LEVELS: LevelDef[] = [
  {
    name: 'Кибер-некрополь',
    sub: 'Сектор 0',
    desc: 'Заброшенное кладбище корпорации. Нанозараза подняла мёртвых, и они всё ещё помнят, где жили.',
    ground: { pattern: 'slab', base: '#2b3034', dark: '#20252a', light: '#3a4046', line: '#4a5258', glow: '#3ef0ff' },
    fog: '#4a7a6a',
    torch: 0x7dffd8,
    props: [
      { kind: 'tomb', pal: pp('#4e545c', '#737b84', '#3ef0ff', '#3ef0ff', '#2a2e34', '#3e444c'), weight: 5 },
      { kind: 'cross', pal: pp('#3e444c', '#555d66', '#3ef0ff', '#7dffd8', '#2a2e34', '#3e444c'), weight: 2, light: 0x3ef0ff },
      { kind: 'bones', pal: pp('#8a8478', '#c8c0a8', '#ff2d55', '#ff2d55'), weight: 3 },
      { kind: 'brazier', pal: pp('#2a2a2a', '#3a3a3a', '#fff3c0', '#7dffd8'), weight: 1, light: 0x7dffd8, anim: 'brazier2' },
    ],
    enemies: [
      { name: 'Нанозомби', body: 'humanoid', pal: ['#5f7a4f', '#3a2e52', '#ffe14a', '#ff2d55'], beh: B.CHASE, hp: 10, spd: 55, dmg: 8, r: 11 },
      { name: 'Гнилой бегун', body: 'humanoid', pal: ['#8a6a4a', '#2e1f1f', '#ff5a2d', '#ff2d55'], beh: B.CHASE, hp: 6, spd: 105, dmg: 6, r: 10 },
      { name: 'Костяной страж', body: 'skeleton', pal: ['#c8c0a8', '#6a6a7a', '#3ef0ff', '#3ef0ff'], beh: B.CHASE, hp: 22, spd: 60, dmg: 10, r: 11, kbr: 0.6, xp: 2 },
      { name: 'Трупный пёс', body: 'beast', pal: ['#6a5a4a', '#3a2a2a', '#ff2d55', '#ff2d55'], beh: B.CHARGE, hp: 16, spd: 70, dmg: 10, r: 11, cd: 3, xp: 2 },
      { name: 'Нетопырь-дрон', body: 'bat', pal: ['#3a3a5a', '#2a2a3a', '#3ef0ff', '#ff2d55'], beh: B.FLY, hp: 7, spd: 95, dmg: 6, r: 10 },
      { name: 'Кислотный слизень', body: 'blob', pal: ['#6aa84a', '#3a6a2a', '#e8ff6a', '#b8ff3a'], beh: B.SPLIT, hp: 28, spd: 45, dmg: 8, r: 12, xp: 2 },
      { name: 'Могильщик', body: 'caster', pal: ['#4a4a5a', '#2a2a38', '#7dff6a', '#7dff6a'], beh: B.SUMMON, hp: 35, spd: 40, dmg: 8, r: 12, cd: 5, child: 0, count: 3, xp: 4 },
      { name: 'Раздутый', body: 'brute', pal: ['#7a8a5a', '#5a4a3a', '#ffe14a', '#b8ff3a'], beh: B.EXPLODE, hp: 14, spd: 70, dmg: 25, r: 12, xp: 2 },
      { name: 'Скелет-лучник', body: 'skeleton', pal: ['#b8b0a0', '#4a3a2a', '#ff5a2d', '#ffb03a'], beh: B.RANGED, hp: 12, spd: 50, dmg: 8, r: 11, cd: 2.2, proj: 170, xp: 2 },
    ],
    boss: {
      name: 'Архилич',
      title: 'Архилич Сектора 0',
      body: 'caster',
      pal: ['#2a3a3a', '#1a2a2a', '#3ef0ff', '#7dff6a'],
      beh: B.BOSS,
      hp: 10000,
      spd: 45,
      dmg: 20,
      r: 40,
      size: 3.5,
      xp: 0,
      kbr: 0.05,
      patterns: ['burst', 'summon', 'volley', 'spikes'],
    },
    hpMul: 1,
    dmgMul: 1,
    rate: 1,
    bossAt: 480,
    killGoal: 700,
    special: { text: 'Победи, ни разу не опустившись ниже 50% здоровья', check: (r) => r.won && r.minHp >= 0.5 },
    unlock: 'pyre',
  },
  {
    name: 'Пылающая плавильня',
    sub: 'Горн корпорации',
    desc: 'Цеха, где плавили киберимпланты. Теперь в лаве куют демонов.',
    ground: { pattern: 'basalt', base: '#33231f', dark: '#261915', light: '#43302a', line: '#563c33', glow: '#ff7a2d' },
    fog: '#8a3a1a',
    torch: 0xff9a3c,
    props: [
      { kind: 'pillar', pal: pp('#4a3530', '#66493f', '#ff7a2d', '#ff4a1a', '#2a1a18', '#3e2a24'), weight: 3 },
      { kind: 'crack', pal: pp('#000', '#000', '#ffb03a', '#ff4a1a'), weight: 5, light: 0xff7a2d },
      { kind: 'brazier', pal: pp('#2a1a1a', '#3a2a2a', '#fff3c0', '#ff7a2d'), weight: 2, light: 0xff9a3c, anim: 'brazier2' },
      { kind: 'bones', pal: pp('#6a5a4a', '#9a8a70', '#ff7a2d', '#ff4a1a'), weight: 2 },
    ],
    enemies: [
      { name: 'Угольный голем', body: 'brute', pal: ['#5e3e32', '#2e1a14', '#ff7a2d', '#ff4a1a'], beh: B.TANK, hp: 50, spd: 38, dmg: 12, r: 15, size: 1.3, kbr: 0.3, xp: 3 },
      { name: 'Бес', body: 'bat', pal: ['#a83a2a', '#5a1a1a', '#ffd24a', '#ff7a2d'], beh: B.FLY, hp: 8, spd: 105, dmg: 7, r: 10 },
      { name: 'Пиро-культист', body: 'caster', pal: ['#5a1a1a', '#3a0a0a', '#ffd24a', '#ff7a2d'], beh: B.RANGED, hp: 16, spd: 45, dmg: 10, r: 11, cd: 2, proj: 190, xp: 2 },
      { name: 'Лавовый слизень', body: 'blob', pal: ['#ff6a2a', '#a8301a', '#fff27a', '#ffd24a'], beh: B.SPLIT, hp: 30, spd: 45, dmg: 9, r: 12, xp: 2 },
      { name: 'Адская гончая', body: 'beast', pal: ['#8a2a1a', '#3a1010', '#ffd24a', '#ff7a2d'], beh: B.CHARGE, hp: 20, spd: 75, dmg: 12, r: 11, cd: 2.6, xp: 2 },
      { name: 'Огненный череп', body: 'skull', pal: ['#e8d8c0', '#8a6a4a', '#ff7a2d', '#ff4a1a'], beh: B.EXPLODE, hp: 12, spd: 85, dmg: 28, r: 10, xp: 2 },
      { name: 'Демон-кузнец', body: 'knight', pal: ['#5a3a3a', '#3a1a1a', '#ffd24a', '#ff4a1a'], beh: B.TANK, hp: 60, spd: 45, dmg: 14, r: 12, kbr: 0.4, xp: 4 },
      { name: 'Жрец пепла', body: 'caster', pal: ['#6a6a6a', '#3a3a3a', '#ffb03a', '#ff7a2d'], beh: B.HEAL, hp: 30, spd: 40, dmg: 6, r: 11, cd: 4, xp: 3 },
      { name: 'Магма-паук', body: 'spider', pal: ['#6a2a1e', '#a83a1a', '#ffd24a', '#ff7a2d'], beh: B.CHASE, hp: 10, spd: 110, dmg: 8, r: 10 },
    ],
    boss: {
      name: 'Владыка Горна',
      title: 'Владыка Горна',
      body: 'brute',
      pal: ['#4a1a1a', '#2a0a0a', '#ffd24a', '#ff4a1a'],
      beh: B.BOSS,
      hp: 14000,
      spd: 50,
      dmg: 26,
      r: 42,
      size: 3.5,
      xp: 0,
      kbr: 0.05,
      patterns: ['charge', 'burst', 'slam', 'summon'],
    },
    hpMul: 1.6,
    dmgMul: 1.25,
    rate: 1.1,
    bossAt: 480,
    killGoal: 1200,
    special: { text: 'Собери сет из 4 оружий одной школы', check: (r) => r.maxSet >= 4 },
    unlock: 'cryo',
  },
  {
    name: 'Ледяные катакомбы',
    sub: 'Криохранилище',
    desc: 'Здесь спали замороженные клиенты бессмертия. Проснулись не все — но и не те.',
    ground: { pattern: 'ice', base: '#2a3e55', dark: '#1f2f42', light: '#3a5470', line: '#527090', glow: '#9ad8ff' },
    fog: '#6a8aaa',
    torch: 0x9ad8ff,
    props: [
      { kind: 'spike', pal: pp('#4a6a8a', '#8ab8d8', '#e8ffff', '#9ad8ff', '#2a3a4e', '#3a4a5e'), weight: 4 },
      { kind: 'crystal', pal: pp('#2a3a4e', '#3a4a5e', '#9ad8ff', '#3ef0ff'), weight: 3, light: 0x9ad8ff },
      { kind: 'bones', pal: pp('#8a98a8', '#c8d8e8', '#3ef0ff', '#9ad8ff'), weight: 3 },
      { kind: 'pillar', pal: pp('#40566f', '#64809e', '#9ad8ff', '#3ef0ff', '#2a3a4e', '#3a4e66'), weight: 2 },
    ],
    enemies: [
      { name: 'Ледяной упырь', body: 'humanoid', pal: ['#7aa8c8', '#2a3a5a', '#e8ffff', '#9ad8ff'], beh: B.CHASE, hp: 12, spd: 55, dmg: 9, r: 11 },
      { name: 'Морозный волк', body: 'beast', pal: ['#c8d8e8', '#6a7a9a', '#3ef0ff', '#9ad8ff'], beh: B.CHARGE, hp: 20, spd: 80, dmg: 12, r: 11, cd: 2.4, xp: 2 },
      { name: 'Кристальный страж', body: 'knight', pal: ['#6a8aa8', '#3a4a6a', '#e8ffff', '#9ad8ff'], beh: B.TANK, hp: 70, spd: 40, dmg: 14, r: 12, kbr: 0.3, xp: 4 },
      { name: 'Вьюжный дух', body: 'skull', pal: ['#e8f4ff', '#9ab8d8', '#3ef0ff', '#9ad8ff'], beh: B.BLINK, hp: 16, spd: 70, dmg: 10, r: 10, cd: 3, xp: 2 },
      { name: 'Ледяной снайпер', body: 'skeleton', pal: ['#d8e8f0', '#3a4a6a', '#3ef0ff', '#9ad8ff'], beh: B.RANGED, hp: 14, spd: 45, dmg: 10, r: 11, cd: 2.4, proj: 240, xp: 2 },
      { name: 'Осколочник', body: 'blob', pal: ['#9ad8ff', '#4a7aa8', '#ffffff', '#e8ffff'], beh: B.SPLIT, hp: 32, spd: 45, dmg: 9, r: 12, xp: 2 },
      { name: 'Снежный паук', body: 'spider', pal: ['#e8f0f8', '#8aa8c8', '#3ef0ff', '#9ad8ff'], beh: B.CHASE, hp: 10, spd: 115, dmg: 8, r: 10 },
      { name: 'Инеистый маг', body: 'caster', pal: ['#3a5a8a', '#1a2a4a', '#e8ffff', '#3ef0ff'], beh: B.SUMMON, hp: 40, spd: 40, dmg: 8, r: 12, cd: 5, child: 0, count: 3, xp: 4 },
      { name: 'Мёрзлый титан', body: 'brute', pal: ['#8aa8c8', '#4a5a7a', '#3ef0ff', '#e8ffff'], beh: B.TANK, hp: 90, spd: 34, dmg: 16, r: 15, size: 1.3, kbr: 0.25, xp: 5 },
    ],
    boss: {
      name: 'Королева Инея',
      title: 'Королева Инея',
      body: 'caster',
      pal: ['#8ab8e8', '#2a4a8a', '#ffffff', '#3ef0ff'],
      beh: B.BOSS,
      hp: 19000,
      spd: 55,
      dmg: 30,
      r: 40,
      size: 3.5,
      xp: 0,
      kbr: 0.05,
      patterns: ['volley', 'spikes', 'teleport', 'burst'],
    },
    hpMul: 2.3,
    dmgMul: 1.5,
    rate: 1.2,
    bossAt: 480,
    killGoal: 1600,
    special: { text: 'Победи, ни разу не сделав рывок', check: (r) => r.won && r.dashes === 0 },
    unlock: 'virus',
  },
  {
    name: 'Биоулей',
    sub: 'Лаборатория 7',
    desc: 'Эксперимент по выращиванию солдат вышел из-под контроля. Стены здесь дышат.',
    ground: { pattern: 'flesh', base: '#2f3820', dark: '#232a17', light: '#3e4a2b', line: '#53623a', glow: '#b8ff3a' },
    fog: '#5a7a2a',
    torch: 0xb8ff3a,
    props: [
      { kind: 'vat', pal: pp('#5a6a2a', '#8aa84a', '#b8ff3a', '#7dff6a'), weight: 2, light: 0x7dff6a },
      { kind: 'pod', pal: pp('#4a3a2a', '#6a5a3a', '#b8ff3a', '#ff2d55'), weight: 4, light: 0xb8ff3a },
      { kind: 'bones', pal: pp('#6a7a4a', '#9aaa7a', '#b8ff3a', '#7dff6a'), weight: 3 },
      { kind: 'crystal', pal: pp('#2a3a1a', '#3a4a2a', '#b8ff3a', '#7dff6a'), weight: 2, light: 0xb8ff3a },
    ],
    enemies: [
      { name: 'Мутант', body: 'humanoid', pal: ['#8aa84a', '#4a5a2a', '#ff2d55', '#b8ff3a'], beh: B.CHASE, hp: 14, spd: 58, dmg: 10, r: 11 },
      { name: 'Рой-паразит', body: 'bat', pal: ['#6a8a3a', '#3a4a1a', '#ffe14a', '#b8ff3a'], beh: B.FLY, hp: 6, spd: 120, dmg: 6, r: 9 },
      { name: 'Споровик', body: 'blob', pal: ['#a8c84a', '#5a6a2a', '#ff2d55', '#e8ff6a'], beh: B.SPIT, hp: 24, spd: 40, dmg: 14, r: 12, cd: 3, xp: 3 },
      { name: 'Гнойный бегемот', body: 'brute', pal: ['#6a7a3a', '#3a3a1a', '#ff2d55', '#b8ff3a'], beh: B.TANK, hp: 100, spd: 35, dmg: 18, r: 15, size: 1.3, kbr: 0.25, xp: 5 },
      { name: 'Прыгун', body: 'beast', pal: ['#5a7a3a', '#2a3a1a', '#ff2d55', '#b8ff3a'], beh: B.CHARGE, hp: 22, spd: 80, dmg: 13, r: 11, cd: 2.2, xp: 2 },
      { name: 'Слизь-репликатор', body: 'blob', pal: ['#7dff6a', '#2a8a3a', '#ffffff', '#e8ff6a'], beh: B.SPLIT, hp: 34, spd: 48, dmg: 9, r: 12, xp: 2 },
      { name: 'Хирург', body: 'skeleton', pal: ['#d8d8c8', '#4a6a5a', '#7dff6a', '#ff2d55'], beh: B.BLINK, hp: 20, spd: 70, dmg: 12, r: 11, cd: 3, xp: 3 },
      { name: 'Токсичный раздутый', body: 'brute', pal: ['#9aba5a', '#6a5a3a', '#ffe14a', '#7dff6a'], beh: B.EXPLODE, hp: 18, spd: 72, dmg: 32, r: 12, xp: 2 },
      { name: 'Матка роя', body: 'spider', pal: ['#8a6a3a', '#4a3a1a', '#ffe14a', '#b8ff3a'], beh: B.SUMMON, hp: 50, spd: 35, dmg: 10, r: 14, size: 1.3, cd: 4.5, child: 1, count: 4, xp: 5 },
    ],
    boss: {
      name: 'Праматерь Улья',
      title: 'Праматерь Улья',
      body: 'blob',
      pal: ['#8ab84a', '#4a6a2a', '#ff2d55', '#e8ff6a'],
      beh: B.BOSS,
      hp: 25000,
      spd: 40,
      dmg: 34,
      r: 44,
      size: 3.8,
      xp: 0,
      kbr: 0.05,
      patterns: ['summon', 'spikes', 'burst', 'slam'],
    },
    hpMul: 3.2,
    dmgMul: 1.8,
    rate: 1.3,
    bossAt: 480,
    killGoal: 2000,
    special: { text: 'Скомпилируй 2 оружия за забег', check: (r) => r.evolutions >= 2 },
    unlock: 'orbit',
  },
  {
    name: 'Собор Бездны',
    sub: 'Ядро',
    desc: 'Сердце заразы. Корпорация пыталась взломать ад — ад взломал её в ответ.',
    ground: { pattern: 'cathedral', base: '#33204a', dark: '#261838', light: '#44305e', line: '#563c78', glow: '#ff4fd8' },
    fog: '#6a2a8a',
    torch: 0xc46bff,
    props: [
      { kind: 'pillar', pal: pp('#45305e', '#634585', '#ff4fd8', '#c46bff', '#2a1a3a', '#3a2650'), weight: 3 },
      { kind: 'candles', pal: pp('#000', '#000', '#fff3c0', '#ffb03a', '#3a2a1a', '#5a4a3a'), weight: 3, light: 0xffb03a },
      { kind: 'rune', pal: pp('#000', '#000', '#ff4fd8', '#c46bff'), weight: 2, light: 0xff4fd8 },
      { kind: 'crack', pal: pp('#000', '#000', '#ff4fd8', '#ff2d55'), weight: 3, light: 0xff2d55 },
    ],
    enemies: [
      { name: 'Одержимый', body: 'humanoid', pal: ['#6a4a8a', '#2a1a3a', '#ff4fd8', '#ff2d55'], beh: B.CHASE, hp: 16, spd: 62, dmg: 11, r: 11 },
      { name: 'Демон-страж', body: 'knight', pal: ['#5e3a72', '#3a2650', '#ff4fd8', '#c46bff'], beh: B.TANK, hp: 90, spd: 42, dmg: 16, r: 12, kbr: 0.3, xp: 4 },
      { name: 'Суккуб', body: 'bat', pal: ['#8a3a6a', '#4a1a3a', '#ffd24a', '#ff4fd8'], beh: B.RANGED, hp: 14, spd: 90, dmg: 10, r: 10, cd: 2, proj: 220, xp: 2 },
      { name: 'Бездновый маг', body: 'caster', pal: ['#5e2e8a', '#2e1648', '#ff4fd8', '#c46bff'], beh: B.BLINK, hp: 24, spd: 50, dmg: 12, r: 11, cd: 3.5, xp: 3 },
      { name: 'Рыцарь Бездны', body: 'knight', pal: ['#4e2e66', '#7a3a8e', '#ff2d55', '#ff4fd8'], beh: B.CHARGE, hp: 50, spd: 55, dmg: 16, r: 12, cd: 2.5, kbr: 0.5, xp: 4 },
      { name: 'Горгулья', body: 'beast', pal: ['#5a5a6a', '#3a3a4a', '#ff4fd8', '#c46bff'], beh: B.FLY, hp: 30, spd: 80, dmg: 12, r: 11, kbr: 0.6, xp: 3 },
      { name: 'Пожиратель', body: 'blob', pal: ['#4a1a6a', '#2a0a3a', '#ff4fd8', '#c46bff'], beh: B.SPLIT, hp: 40, spd: 46, dmg: 11, r: 12, xp: 3 },
      { name: 'Жрец Бездны', body: 'caster', pal: ['#5a3a7a', '#3a1a4a', '#ffd24a', '#ff4fd8'], beh: B.HEAL, hp: 36, spd: 40, dmg: 8, r: 11, cd: 3.5, xp: 4 },
      { name: 'Кошмар', body: 'skull', pal: ['#d8c8e8', '#6a4a8a', '#ff4fd8', '#c46bff'], beh: B.EXPLODE, hp: 18, spd: 95, dmg: 34, r: 10, xp: 2 },
    ],
    boss: {
      name: 'Сердце Бездны',
      title: 'Сердце Бездны',
      body: 'skull',
      pal: ['#e8d8f8', '#6a3a8a', '#ff2d55', '#ff4fd8'],
      beh: B.BOSS,
      hp: 32000,
      spd: 50,
      dmg: 40,
      r: 42,
      size: 3.8,
      xp: 0,
      kbr: 0.05,
      patterns: ['burst', 'volley', 'summon', 'spikes', 'teleport', 'slam'],
    },
    hpMul: 4.3,
    dmgMul: 2.1,
    rate: 1.4,
    bossAt: 480,
    killGoal: 2500,
    special: { text: 'Убей босса за 2 минуты после его появления', check: (r) => r.won && r.time <= 600 },
    unlock: 'mirror',
  },
];

export function levelChallenges(i: number) {
  const L = LEVELS[i];
  return [
    { text: `Победи ${L.boss.title}`, check: (r: RunResult) => r.won },
    { text: `Убей ${L.killGoal} врагов за забег`, check: (r: RunResult) => r.kills >= L.killGoal },
    L.special,
  ];
}
