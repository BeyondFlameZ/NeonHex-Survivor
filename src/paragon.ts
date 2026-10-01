// Доска парагона 9×9: центр открыт, узел можно изучить, только если он соседствует с изученным.
// Очки — уровни парагона, их дают за опыт аккаунта со всех забегов.
export const PSIZE = 9;
export const PCENTER = 40;

export type PStat = 'dmg' | 'maxHp' | 'crit' | 'area' | 'cd' | 'move' | 'pickup' | 'regen' | 'xp' | 'dur';

export interface PNode {
  i: number;
  kind: 'start' | 'magic' | 'rare' | 'glyph';
  name: string;
  stats: [PStat, number][];
}

const SMALL: [PStat, number, string][] = [
  ['dmg', 0.02, 'Сила'],
  ['maxHp', 5, 'Стойкость'],
  ['crit', 0.01, 'Точность'],
  ['area', 0.02, 'Охват'],
  ['cd', 0.01, 'Скорость'],
  ['move', 0.01, 'Ловкость'],
  ['pickup', 0.04, 'Притяжение'],
  ['regen', 0.05, 'Живучесть'],
  ['xp', 0.02, 'Мудрость'],
];

const GLYPHS: Record<number, PNode> = {
  4: { i: 4, kind: 'glyph', name: 'Разрушитель', stats: [['dmg', 0.15]] },
  36: { i: 36, kind: 'glyph', name: 'Бастион', stats: [['maxHp', 60], ['regen', 1]] },
  44: { i: 44, kind: 'glyph', name: 'Хронист', stats: [['cd', 0.1], ['dur', 0.2]] },
  76: { i: 76, kind: 'glyph', name: 'Жнец', stats: [['crit', 0.08], ['xp', 0.15]] },
};

const hash = (x: number, y: number) => {
  let h = Math.imul(x * 73 + 11, 2654435761) ^ Math.imul(y * 151 + 7, 40503);
  h ^= h >>> 15;
  return (h >>> 0) % 997;
};

export const NODES: PNode[] = Array.from({ length: PSIZE * PSIZE }, (_, i) => {
  if (i === PCENTER) return { i, kind: 'start', name: 'Исток', stats: [] };
  if (GLYPHS[i]) return GLYPHS[i];
  const x = i % PSIZE;
  const y = (i / PSIZE) | 0;
  const [stat, v, name] = SMALL[hash(x, y) % SMALL.length];
  const ring = Math.max(Math.abs(x - 4), Math.abs(y - 4));
  const rare = ring >= 2 && (x + y) % 4 === 0;
  return { i, kind: rare ? 'rare' : 'magic', name: rare ? `Великая ${name.toLowerCase()}` : name, stats: [[stat, rare ? v * 3 : v]] };
});

export const neighbors = (i: number) => {
  const x = i % PSIZE;
  const y = (i / PSIZE) | 0;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < PSIZE - 1) out.push(i + 1);
  if (y > 0) out.push(i - PSIZE);
  if (y < PSIZE - 1) out.push(i + PSIZE);
  return out;
};

export const canAlloc = (alloc: number[], i: number) => !alloc.includes(i) && neighbors(i).some((n) => n === PCENTER || alloc.includes(n));

// опыт → уровень: каждый следующий дороже
export function paragonLevel(xp: number) {
  let lvl = 0;
  let need = 800;
  while (xp >= need) {
    xp -= need;
    lvl++;
    need = 800 + 200 * lvl;
  }
  return { lvl, into: xp, need };
}

export function paragonBonuses(alloc: number[]) {
  const b: Record<PStat, number> = { dmg: 0, maxHp: 0, crit: 0, area: 0, cd: 0, move: 0, pickup: 0, regen: 0, xp: 0, dur: 0 };
  for (const i of alloc) for (const [k, v] of NODES[i]?.stats ?? []) b[k] += v;
  return b;
}

export function statLabel(k: PStat, v: number) {
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  switch (k) {
    case 'dmg': return `Урон +${pct(v)}`;
    case 'maxHp': return `Здоровье +${v}`;
    case 'crit': return `Шанс крита +${pct(v)}`;
    case 'area': return `Площадь +${pct(v)}`;
    case 'cd': return `Перезарядка −${pct(v)}`;
    case 'move': return `Скорость бега +${pct(v)}`;
    case 'pickup': return `Радиус подбора +${pct(v)}`;
    case 'regen': return `Регенерация +${String(Math.round(v * 100) / 100).replace('.', ',')} HP/с`;
    case 'xp': return `Опыт +${pct(v)}`;
    case 'dur': return `Длительность +${pct(v)}`;
  }
}
