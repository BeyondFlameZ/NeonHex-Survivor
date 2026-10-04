// Сгенерировано из данных 2D-версии: скорости и размеры переведены в единицы 3D-мира
import type { Body } from './models.js';

export type Beh = 'CHASE' | 'FLY' | 'RANGED' | 'CHARGE' | 'EXPLODE' | 'SPLIT' | 'SUMMON' | 'HEAL' | 'BLINK' | 'SPIT' | 'TANK' | 'BOSS' | 'FLEE';

export interface EnemyDef {
  name: string;
  body: Body;
  pal: [string, string, string, string];
  beh: Beh;
  hp: number;
  spd: number;
  dmg: number;
  r: number;
  size: number;
  xp: number;
  kb: number;
  cd: number;
  proj: number;
  child: number;
  count: number;
}

export interface BossDef extends EnemyDef {
  title: string;
  patterns: string[];
}

export interface LevelDef {
  name: string;
  sub: string;
  desc: string;
  ground: { kind: 'slab' | 'basalt' | 'ice' | 'flesh' | 'marble'; base: string; dark: string; light: string; line: string; glow: string };
  fog: string;
  sky: string;
  props: { kind: import('./models.js').PropKind; w: number; a: string; b: string; glow: string }[];
  house: { a: string; b: string; glow: string };
  enemies: EnemyDef[];
  boss: BossDef;
  hpMul: number;
  dmgMul: number;
  rate: number;
}

const e = (name: string, body: Body, pal: [string, string, string, string], beh: Beh, hp: number, spd: number, dmg: number, r: number, o: Partial<EnemyDef> = {}): EnemyDef => ({
  name, body, pal, beh, hp, spd, dmg, r, size: 1, xp: 1, kb: 1, cd: 2, proj: 9, child: 0, count: 3, ...o,
});

export const LEVELS: LevelDef[] = [
  {
    name: 'Кибер-некрополь',
    sub: 'Сектор 0',
    desc: 'Заброшенное кладбище корпорации. Нанозараза подняла мёртвых, и они всё ещё помнят, где жили.',
    ground: { kind: 'slab', base: '#353c41', dark: '#23282e', light: '#4b535b', line: '#131619', glow: '#3ef0ff' },
    fog: '#4a7a6a',
    sky: '#16191d',
    props: [
      { kind: 'tomb', w: 4, a: '#4e545c', b: '#2a2e34', glow: '#3ef0ff' },
      { kind: 'cross', w: 2, a: '#3e444c', b: '#2a2e34', glow: '#3ef0ff' },
      { kind: 'lamp', w: 2, a: '#2a2e34', b: '#1a1c20', glow: '#7dffd8' },
      { kind: 'crate', w: 3, a: '#7a5a3a', b: '#3a2a1a', glow: '#3ef0ff' },
      { kind: 'skylight', w: 1, a: '#8a7a6a', b: '#5a4a3a', glow: '#3ef0ff' },
    ],
    house: { a: '#5a4a40', b: '#2e2622', glow: '#7dffd8' },
    enemies: [
      e('Нанозомби', 'humanoid', ['#5f7a4f', '#3a2e52', '#ffe14a', '#ff2d55'], 'CHASE', 10, 2.75, 8, 0.5),
      e('Гнилой бегун', 'humanoid', ['#8a6a4a', '#2e1f1f', '#ff5a2d', '#ff2d55'], 'CHASE', 6, 5.25, 6, 0.45),
      e('Костяной страж', 'skeleton', ['#c8c0a8', '#6a6a7a', '#3ef0ff', '#3ef0ff'], 'CHASE', 22, 3.0, 10, 0.5, { xp: 2, kb: 0.6 }),
      e('Трупный пёс', 'beast', ['#6a5a4a', '#3a2a2a', '#ff2d55', '#ff2d55'], 'CHARGE', 16, 3.5, 10, 0.5, { xp: 2, cd: 3.0 }),
      e('Нетопырь-дрон', 'bat', ['#3a3a5a', '#2a2a3a', '#3ef0ff', '#ff2d55'], 'FLY', 7, 4.75, 6, 0.45),
      e('Кислотный слизень', 'blob', ['#6aa84a', '#3a6a2a', '#e8ff6a', '#b8ff3a'], 'SPLIT', 28, 2.25, 8, 0.55, { xp: 2 }),
      e('Могильщик', 'caster', ['#4a4a5a', '#2a2a38', '#7dff6a', '#7dff6a'], 'SUMMON', 35, 2.0, 8, 0.55, { xp: 4, cd: 5.0, child: 0, count: 3 }),
      e('Раздутый', 'brute', ['#7a8a5a', '#5a4a3a', '#ffe14a', '#b8ff3a'], 'EXPLODE', 14, 3.5, 25, 0.55, { xp: 2 }),
      e('Скелет-лучник', 'skeleton', ['#b8b0a0', '#4a3a2a', '#ff5a2d', '#ffb03a'], 'RANGED', 12, 2.5, 8, 0.5, { xp: 2, cd: 2.2, proj: 8.5 }),
    ],
    boss: { ...e('Архилич', 'caster', ['#2a3a3a', '#1a2a2a', '#3ef0ff', '#7dff6a'], 'BOSS', 10000, 2.25, 20, 1.27, { size: 2.6, xp: 0, kb: 0.05 }), title: 'Архилич Сектора 0', patterns: ['burst', 'summon', 'volley', 'spikes'] },
    hpMul: 1.0,
    dmgMul: 1.0,
    rate: 1.0,
  },
  {
    name: 'Пылающая плавильня',
    sub: 'Горн корпорации',
    desc: 'Цеха, где плавили киберимпланты. Теперь в лаве куют демонов.',
    ground: { kind: 'basalt', base: '#3f2b26', dark: '#291b17', light: '#573e36', line: '#160f0c', glow: '#ff7a2d' },
    fog: '#8a3a1a',
    sky: '#1a110e',
    props: [
      { kind: 'pillar', w: 3, a: '#4a3530', b: '#2a1a18', glow: '#ff7a2d' },
      { kind: 'brazier', w: 2, a: '#4a4a4a', b: '#2a2a2a', glow: '#ff9a3c' },
      { kind: 'barrel', w: 3, a: '#6a3a2a', b: '#3a1a10', glow: '#ffb03a' },
      { kind: 'container', w: 1, a: '#8a3a2a', b: '#5a2418', glow: '#ff7a2d' },
      { kind: 'crate', w: 2, a: '#6a4a2a', b: '#3a2a1a', glow: '#ff7a2d' },
    ],
    house: { a: '#5a3a30', b: '#2a1a14', glow: '#ffb03a' },
    enemies: [
      e('Угольный голем', 'brute', ['#5e3e32', '#2e1a14', '#ff7a2d', '#ff4a1a'], 'TANK', 50, 1.9, 12, 0.68, { size: 1.3, xp: 3, kb: 0.3 }),
      e('Бес', 'bat', ['#a83a2a', '#5a1a1a', '#ffd24a', '#ff7a2d'], 'FLY', 8, 5.25, 7, 0.45),
      e('Пиро-культист', 'caster', ['#5a1a1a', '#3a0a0a', '#ffd24a', '#ff7a2d'], 'RANGED', 16, 2.25, 10, 0.5, { xp: 2, cd: 2.0, proj: 9.5 }),
      e('Лавовый слизень', 'blob', ['#ff6a2a', '#a8301a', '#fff27a', '#ffd24a'], 'SPLIT', 30, 2.25, 9, 0.55, { xp: 2 }),
      e('Адская гончая', 'beast', ['#8a2a1a', '#3a1010', '#ffd24a', '#ff7a2d'], 'CHARGE', 20, 3.75, 12, 0.5, { xp: 2, cd: 2.6 }),
      e('Огненный череп', 'skull', ['#e8d8c0', '#8a6a4a', '#ff7a2d', '#ff4a1a'], 'EXPLODE', 12, 4.25, 28, 0.45, { xp: 2 }),
      e('Демон-кузнец', 'knight', ['#5a3a3a', '#3a1a1a', '#ffd24a', '#ff4a1a'], 'TANK', 60, 2.25, 14, 0.55, { xp: 4, kb: 0.4 }),
      e('Жрец пепла', 'caster', ['#6a6a6a', '#3a3a3a', '#ffb03a', '#ff7a2d'], 'HEAL', 30, 2.0, 6, 0.5, { xp: 3, cd: 4.0 }),
      e('Магма-паук', 'spider', ['#6a2a1e', '#a83a1a', '#ffd24a', '#ff7a2d'], 'CHASE', 10, 5.5, 8, 0.45),
    ],
    boss: { ...e('Владыка Горна', 'brute', ['#4a1a1a', '#2a0a0a', '#ffd24a', '#ff4a1a'], 'BOSS', 14000, 2.5, 26, 1.34, { size: 2.6, xp: 0, kb: 0.05 }), title: 'Владыка Горна', patterns: ['charge', 'burst', 'slam', 'summon'] },
    hpMul: 1.6,
    dmgMul: 1.25,
    rate: 1.1,
  },
  {
    name: 'Ледяные катакомбы',
    sub: 'Криохранилище',
    desc: 'Здесь спали замороженные клиенты бессмертия. Проснулись не все — но и не те.',
    ground: { kind: 'ice', base: '#344d6a', dark: '#223348', light: '#4b6d91', line: '#121c27', glow: '#9ad8ff' },
    fog: '#6a8aaa',
    sky: '#15202e',
    props: [
      { kind: 'crystal', w: 4, a: '#40566f', b: '#2a3a4e', glow: '#9ad8ff' },
      { kind: 'pillar', w: 2, a: '#64809e', b: '#3a4e66', glow: '#9ad8ff' },
      { kind: 'container', w: 1, a: '#5a7a9a', b: '#3a4e66', glow: '#9ad8ff' },
      { kind: 'lamp', w: 2, a: '#2a3a4e', b: '#1a2430', glow: '#bfe8ff' },
      { kind: 'crate', w: 2, a: '#6a7a8a', b: '#3a4a5a', glow: '#9ad8ff' },
    ],
    house: { a: '#4a5a6a', b: '#2a3440', glow: '#bfe8ff' },
    enemies: [
      e('Ледяной упырь', 'humanoid', ['#7aa8c8', '#2a3a5a', '#e8ffff', '#9ad8ff'], 'CHASE', 12, 2.75, 9, 0.5),
      e('Морозный волк', 'beast', ['#c8d8e8', '#6a7a9a', '#3ef0ff', '#9ad8ff'], 'CHARGE', 20, 4.0, 12, 0.5, { xp: 2, cd: 2.4 }),
      e('Кристальный страж', 'knight', ['#6a8aa8', '#3a4a6a', '#e8ffff', '#9ad8ff'], 'TANK', 70, 2.0, 14, 0.55, { xp: 4, kb: 0.3 }),
      e('Вьюжный дух', 'skull', ['#e8f4ff', '#9ab8d8', '#3ef0ff', '#9ad8ff'], 'BLINK', 16, 3.5, 10, 0.45, { xp: 2, cd: 3.0 }),
      e('Ледяной снайпер', 'skeleton', ['#d8e8f0', '#3a4a6a', '#3ef0ff', '#9ad8ff'], 'RANGED', 14, 2.25, 10, 0.5, { xp: 2, cd: 2.4, proj: 12.0 }),
      e('Осколочник', 'blob', ['#9ad8ff', '#4a7aa8', '#ffffff', '#e8ffff'], 'SPLIT', 32, 2.25, 9, 0.55, { xp: 2 }),
      e('Снежный паук', 'spider', ['#e8f0f8', '#8aa8c8', '#3ef0ff', '#9ad8ff'], 'CHASE', 10, 5.75, 8, 0.45),
      e('Инеистый маг', 'caster', ['#3a5a8a', '#1a2a4a', '#e8ffff', '#3ef0ff'], 'SUMMON', 40, 2.0, 8, 0.55, { xp: 4, cd: 5.0, child: 0, count: 3 }),
      e('Мёрзлый титан', 'brute', ['#8aa8c8', '#4a5a7a', '#3ef0ff', '#e8ffff'], 'TANK', 90, 1.7, 16, 0.68, { size: 1.3, xp: 5, kb: 0.25 }),
    ],
    boss: { ...e('Королева Инея', 'caster', ['#8ab8e8', '#2a4a8a', '#ffffff', '#3ef0ff'], 'BOSS', 19000, 2.75, 30, 1.27, { size: 2.6, xp: 0, kb: 0.05 }), title: 'Королева Инея', patterns: ['volley', 'spikes', 'teleport', 'burst'] },
    hpMul: 2.3,
    dmgMul: 1.5,
    rate: 1.2,
  },
  {
    name: 'Биоулей',
    sub: 'Лаборатория 7',
    desc: 'Эксперимент по выращиванию солдат вышел из-под контроля. Стены здесь дышат.',
    ground: { kind: 'flesh', base: '#3a4628', dark: '#262e19', light: '#506037', line: '#15190d', glow: '#b8ff3a' },
    fog: '#5a7a2a',
    sky: '#181d10',
    props: [
      { kind: 'vat', w: 2, a: '#5a6a2a', b: '#2a3a1a', glow: '#b8ff3a' },
      { kind: 'pod', w: 4, a: '#6a4a3a', b: '#4a3a2a', glow: '#b8ff3a' },
      { kind: 'barrel', w: 3, a: '#4a6a2a', b: '#2a3a1a', glow: '#7dff6a' },
      { kind: 'container', w: 1, a: '#4a5a3a', b: '#2a3a1a', glow: '#b8ff3a' },
      { kind: 'crate', w: 2, a: '#5a5a3a', b: '#3a3a1a', glow: '#b8ff3a' },
    ],
    house: { a: '#4a5a3a', b: '#2a3420', glow: '#b8ff3a' },
    enemies: [
      e('Мутант', 'humanoid', ['#8aa84a', '#4a5a2a', '#ff2d55', '#b8ff3a'], 'CHASE', 14, 2.9, 10, 0.5),
      e('Рой-паразит', 'bat', ['#6a8a3a', '#3a4a1a', '#ffe14a', '#b8ff3a'], 'FLY', 6, 6.0, 6, 0.41),
      e('Споровик', 'blob', ['#a8c84a', '#5a6a2a', '#ff2d55', '#e8ff6a'], 'SPIT', 24, 2.0, 14, 0.55, { xp: 3, cd: 3.0 }),
      e('Гнойный бегемот', 'brute', ['#6a7a3a', '#3a3a1a', '#ff2d55', '#b8ff3a'], 'TANK', 100, 1.75, 18, 0.68, { size: 1.3, xp: 5, kb: 0.25 }),
      e('Прыгун', 'beast', ['#5a7a3a', '#2a3a1a', '#ff2d55', '#b8ff3a'], 'CHARGE', 22, 4.0, 13, 0.5, { xp: 2, cd: 2.2 }),
      e('Слизь-репликатор', 'blob', ['#7dff6a', '#2a8a3a', '#ffffff', '#e8ff6a'], 'SPLIT', 34, 2.4, 9, 0.55, { xp: 2 }),
      e('Хирург', 'skeleton', ['#d8d8c8', '#4a6a5a', '#7dff6a', '#ff2d55'], 'BLINK', 20, 3.5, 12, 0.5, { xp: 3, cd: 3.0 }),
      e('Токсичный раздутый', 'brute', ['#9aba5a', '#6a5a3a', '#ffe14a', '#7dff6a'], 'EXPLODE', 18, 3.6, 32, 0.55, { xp: 2 }),
      e('Матка роя', 'spider', ['#8a6a3a', '#4a3a1a', '#ffe14a', '#b8ff3a'], 'SUMMON', 50, 1.75, 10, 0.64, { size: 1.3, xp: 5, cd: 4.5, child: 1, count: 4 }),
    ],
    boss: { ...e('Праматерь Улья', 'blob', ['#8ab84a', '#4a6a2a', '#ff2d55', '#e8ff6a'], 'BOSS', 25000, 2.0, 34, 1.4, { size: 2.6, xp: 0, kb: 0.05 }), title: 'Праматерь Улья', patterns: ['summon', 'spikes', 'burst', 'slam'] },
    hpMul: 3.2,
    dmgMul: 1.8,
    rate: 1.3,
  },
  {
    name: 'Собор Бездны',
    sub: 'Ядро',
    desc: 'Сердце заразы. Корпорация пыталась взломать ад — ад взломал её в ответ.',
    ground: { kind: 'marble', base: '#3f285c', dark: '#291a3d', light: '#583e7a', line: '#160e21', glow: '#ff4fd8' },
    fog: '#6a2a8a',
    sky: '#1a1027',
    props: [
      { kind: 'pillar', w: 4, a: '#45305e', b: '#2a1a3a', glow: '#ff4fd8' },
      { kind: 'candles', w: 3, a: '#e8dcc4', b: '#3a2a1a', glow: '#ffb03a' },
      { kind: 'brazier', w: 2, a: '#3a2a4a', b: '#1a0a2a', glow: '#c46bff' },
      { kind: 'tomb', w: 2, a: '#3a2a4a', b: '#1a1024', glow: '#ff4fd8' },
      { kind: 'cross', w: 1, a: '#2a1a3a', b: '#1a1024', glow: '#ff4fd8' },
    ],
    house: { a: '#3a2a4a', b: '#1a1024', glow: '#ff4fd8' },
    enemies: [
      e('Одержимый', 'humanoid', ['#6a4a8a', '#2a1a3a', '#ff4fd8', '#ff2d55'], 'CHASE', 16, 3.1, 11, 0.5),
      e('Демон-страж', 'knight', ['#5e3a72', '#3a2650', '#ff4fd8', '#c46bff'], 'TANK', 90, 2.1, 16, 0.55, { xp: 4, kb: 0.3 }),
      e('Суккуб', 'bat', ['#8a3a6a', '#4a1a3a', '#ffd24a', '#ff4fd8'], 'RANGED', 14, 4.5, 10, 0.45, { xp: 2, cd: 2.0, proj: 11.0 }),
      e('Бездновый маг', 'caster', ['#5e2e8a', '#2e1648', '#ff4fd8', '#c46bff'], 'BLINK', 24, 2.5, 12, 0.5, { xp: 3, cd: 3.5 }),
      e('Рыцарь Бездны', 'knight', ['#4e2e66', '#7a3a8e', '#ff2d55', '#ff4fd8'], 'CHARGE', 50, 2.75, 16, 0.55, { xp: 4, kb: 0.5, cd: 2.5 }),
      e('Горгулья', 'beast', ['#5a5a6a', '#3a3a4a', '#ff4fd8', '#c46bff'], 'FLY', 30, 4.0, 12, 0.5, { xp: 3, kb: 0.6 }),
      e('Пожиратель', 'blob', ['#4a1a6a', '#2a0a3a', '#ff4fd8', '#c46bff'], 'SPLIT', 40, 2.3, 11, 0.55, { xp: 3 }),
      e('Жрец Бездны', 'caster', ['#5a3a7a', '#3a1a4a', '#ffd24a', '#ff4fd8'], 'HEAL', 36, 2.0, 8, 0.5, { xp: 4, cd: 3.5 }),
      e('Кошмар', 'skull', ['#d8c8e8', '#6a4a8a', '#ff4fd8', '#c46bff'], 'EXPLODE', 18, 4.75, 34, 0.45, { xp: 2 }),
    ],
    boss: { ...e('Сердце Бездны', 'skull', ['#e8d8f8', '#6a3a8a', '#ff2d55', '#ff4fd8'], 'BOSS', 32000, 2.5, 40, 1.34, { size: 2.6, xp: 0, kb: 0.05 }), title: 'Сердце Бездны', patterns: ['burst', 'volley', 'summon', 'spikes', 'teleport', 'slam'] },
    hpMul: 4.3,
    dmgMul: 2.1,
    rate: 1.4,
  },
];

export const GOBLIN: EnemyDef = e('Гоблин-майнер', 'goblin', ['#7aa84a', '#a8823a', '#ffe14a', '#ffc94a'], 'FLEE', 30, 5.2, 0, 0.5, { xp: 10, kb: 0.4 });
