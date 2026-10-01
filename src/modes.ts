import { LEVELS } from './levels';
import type { Profile } from './save';

export interface Tier {
  name: string;
  hp: number;
  boss: number; // множитель здоровья босса отдельно — иначе на Аде он неубиваем
  dmg: number;
  rate: number;
  reward: number;
  legend: number; // прибавка к весу легендарок
}

export const TIERS: Tier[] = [
  { name: 'Обычная', hp: 1, boss: 1, dmg: 1, rate: 1, reward: 1, legend: 0 },
  { name: 'Кошмар', hp: 2.4, boss: 1.7, dmg: 1.6, rate: 1.2, reward: 2, legend: 3 },
  { name: 'Ад', hp: 5, boss: 2.6, dmg: 2.4, rate: 1.4, reward: 3.5, legend: 6 },
];

export const tierOpen = (p: Profile, level: number, t: number) => t === 0 || p.tierWon[level][t - 1];

export interface RunOpts {
  level: number;
  tier: number;
  endless: boolean;
  daily: string[] | null;
  cls: string;
  rift: number; // 0 — не портал, иначе уровень Великого портала
}

// Великий портал: случайная локация, 5 минут на прогресс 100%, затем страж
export const RIFT_TIME = 300;
export const riftHp = (n: number) => Math.pow(1.17, n - 1);
export const riftDmg = (n: number) => Math.pow(1.09, n - 1);
export function riftLevel(n: number, open: number[]) {
  return open[(Math.imul(n, 2654435761) >>> 0) % open.length];
}

export interface Modifier {
  id: string;
  name: string;
  desc: string;
}

export const MODIFIERS: Modifier[] = [
  { id: 'glass', name: 'Стеклянная пушка', desc: 'Урон ×2, здоровье ×0,5' },
  { id: 'swarm', name: 'Нашествие', desc: 'Врагов на 60% больше, но они слабее' },
  { id: 'fast', name: 'Ускорение', desc: 'Враги быстрее на 30%' },
  { id: 'elite', name: 'Парад элиты', desc: 'Элитный враг каждую минуту' },
  { id: 'goblins', name: 'Золотая лихорадка', desc: 'Гоблин-майнер каждую минуту' },
  { id: 'noregen', name: 'Без регенерации', desc: 'Регенерация отключена, лечение вдвое слабее' },
  { id: 'giants', name: 'Гиганты', desc: 'Враги крупнее и живучее, но дают больше опыта' },
  { id: 'chaos', name: 'Хаос', desc: 'Случайное благословение святилища каждые 30 секунд' },
];

export const modById = (id: string) => MODIFIERS.find((m) => m.id === id)!;

export function todayKey(d = new Date()) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// один и тот же набор на весь день: уровень из открытых и два модификатора
export function dailyFor(p: Profile, key = todayKey()) {
  let seed = key;
  const r = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  r();
  const open = LEVELS.map((_, i) => i).filter((i) => i === 0 || p.won[i - 1]);
  const level = open[(r() * open.length) | 0];
  const pool = MODIFIERS.map((m) => m.id);
  const a = pool.splice((r() * pool.length) | 0, 1)[0];
  const b = pool.splice((r() * pool.length) | 0, 1)[0];
  return { key, level, mods: [a, b] };
}
