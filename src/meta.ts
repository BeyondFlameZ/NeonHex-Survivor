import { levelChallenges, LEVELS } from './levels';
import { saveProfile, type Profile, type RunResult } from './save';

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  cost: number[];
}

export const SHOP: ShopItem[] = [
  { id: 'dmg', name: 'Резонатор урона', desc: '+5% урона', cost: [60, 120, 200, 300, 450] },
  { id: 'hp', name: 'Бронепластины', desc: '+15 к здоровью', cost: [50, 100, 170, 260, 380] },
  { id: 'regen', name: 'Нанофабрика', desc: '+0,2 HP/с регенерации', cost: [120, 240, 400] },
  { id: 'move', name: 'Сервоприводы', desc: '+5% скорости бега', cost: [80, 160, 280] },
  { id: 'magnet', name: 'Магнитный контур', desc: '+20% радиуса подбора', cost: [60, 120, 200] },
  { id: 'crit', name: 'Эксплойт-ядро', desc: '+3% шанса крита', cost: [100, 200, 340] },
  { id: 'xp', name: 'Нейроускоритель', desc: '+10% опыта', cost: [100, 200, 340] },
  { id: 'cd', name: 'Криоохлаждение', desc: '−4% перезарядки', cost: [120, 240, 400] },
  { id: 'area', name: 'Фокусирующие линзы', desc: '+6% площади', cost: [100, 200, 340] },
  { id: 'reroll', name: 'Генератор вероятностей', desc: '+1 реролл снаряжения за забег', cost: [150, 350] },
  { id: 'revive', name: 'Резервная копия', desc: 'Один раз за забег воскрешает с 50% здоровья', cost: [500] },
];

export const shopLevel = (p: Profile, id: string) => p.shop[id] ?? 0;

// бонусы мастерской, которые игра подмешивает в стартовые статы
export function metaBonuses(p: Profile) {
  const l = (id: string) => shopLevel(p, id);
  return {
    dmg: 0.05 * l('dmg'),
    maxHp: 15 * l('hp'),
    regen: 0.2 * l('regen'),
    move: 0.05 * l('move'),
    pickup: 0.2 * l('magnet'),
    crit: 0.03 * l('crit'),
    xp: 0.1 * l('xp'),
    cd: 0.04 * l('cd'),
    area: 0.06 * l('area'),
    rerolls: 1 + l('reroll'),
    revive: l('revive') > 0,
  };
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  reward: number;
  check: (p: Profile, r: RunResult) => boolean;
}

const starCount = (p: Profile) => p.stars.flat().filter(Boolean).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'Первая кровь', desc: 'Убей первого врага', reward: 20, check: (p) => p.life.kills >= 1 },
  { id: 'k1000', name: 'Мясорубка', desc: '1000 убийств за один забег', reward: 100, check: (_p, r) => r.kills >= 1000 },
  { id: 'k3000', name: 'Жнец', desc: '3000 убийств за один забег', reward: 250, check: (_p, r) => r.kills >= 3000 },
  { id: 't10k', name: 'Геноцид', desc: '10 000 убийств всего', reward: 300, check: (p) => p.life.kills >= 10000 },
  { id: 't50k', name: 'Конец света', desc: '50 000 убийств всего', reward: 800, check: (p) => p.life.kills >= 50000 },
  { id: 'surv5', name: 'Выживший', desc: 'Продержись 5 минут в одном забеге', reward: 50, check: (_p, r) => r.time >= 300 },
  { id: 'win0', name: 'Могильщик могильщиков', desc: 'Пройди Кибер-некрополь', reward: 100, check: (p) => p.won[0] },
  { id: 'win1', name: 'Закалённый', desc: 'Пройди Пылающую плавильню', reward: 150, check: (p) => p.won[1] },
  { id: 'win2', name: 'Оттепель', desc: 'Пройди Ледяные катакомбы', reward: 200, check: (p) => p.won[2] },
  { id: 'win3', name: 'Стерилизатор', desc: 'Пройди Биоулей', reward: 300, check: (p) => p.won[3] },
  { id: 'win4', name: 'Взломщик ада', desc: 'Пройди Собор Бездны', reward: 500, check: (p) => p.won[4] },
  { id: 'evo1', name: 'Компилятор', desc: 'Скомпилируй первое оружие', reward: 150, check: (p) => p.life.evolutions >= 1 },
  { id: 'evo3', name: 'Архитектор', desc: '3 компиляции за один забег', reward: 400, check: (_p, r) => r.evolutions >= 3 },
  { id: 'set4', name: 'Полный сет', desc: 'Собери 4 оружия одной школы', reward: 200, check: (_p, r) => r.maxSet >= 4 },
  { id: 'lvl30', name: 'Сверхразум', desc: 'Достигни 30 уровня в забеге', reward: 250, check: (_p, r) => r.lvl >= 30 },
  { id: 'crit', name: 'Критический сбой', desc: '1000 критов всего', reward: 150, check: (p) => p.life.crits >= 1000 },
  { id: 'nodash', name: 'Стоик', desc: 'Пройди уровень без единого рывка', reward: 300, check: (_p, r) => r.won && r.dashes === 0 },
  { id: 'untouch', name: 'Неприкасаемый', desc: 'Пройди уровень, не опускаясь ниже 50% здоровья', reward: 400, check: (_p, r) => r.won && r.minHp >= 0.5 },
  { id: 'stars15', name: 'Звездочёт', desc: 'Собери все 15 звёзд', reward: 600, check: (p) => starCount(p) >= 15 },
  { id: 'col12', name: 'Коллекционер', desc: 'Используй 12 разных оружий', reward: 200, check: (p) => p.used.length >= 12 },
  { id: 'col24', name: 'Полный арсенал', desc: 'Используй все 24 оружия', reward: 600, check: (p) => p.used.length >= 24 },
  { id: 'shrine', name: 'Паломник', desc: 'Активируй 10 святилищ', reward: 100, check: (p) => p.life.shrines >= 10 },
  { id: 'chest', name: 'Кладоискатель', desc: 'Открой 10 сундуков', reward: 100, check: (p) => p.life.chests >= 10 },
  { id: 'boss5', name: 'Цареубийца', desc: 'Убей 5 боссов', reward: 300, check: (p) => p.life.bosses >= 5 },
  { id: 'rich', name: 'Магнат', desc: 'Заработай 3000 осколков за всё время', reward: 200, check: (p) => p.earned >= 3000 },
];

export interface Settlement {
  base: number;
  starShards: number;
  newStars: string[];
  newAch: Achievement[];
  total: number;
  unlocked: string | null;
}

// итог забега: осколки, звёзды, достижения; профиль сохраняется
export function settle(p: Profile, r: RunResult): Settlement {
  const L = LEVELS[r.level];
  p.life.kills += r.kills;
  p.life.runs++;
  p.life.crits += r.crits;
  p.life.evolutions += r.evolutions;
  p.life.shrines += r.shrines;
  p.life.chests += r.chests;
  p.life.time += r.time;
  if (r.won) p.life.bosses++;
  for (const w of r.weapons) if (!p.used.includes(w)) p.used.push(w);

  let unlocked: string | null = null;
  if (r.won && !p.won[r.level]) {
    p.won[r.level] = true;
    unlocked = L.unlock;
  }

  const base = Math.round(r.kills * 0.1 + (r.time / 60) * 6 + (r.won ? 150 * (r.level + 1) : 0));
  let starShards = 0;
  const newStars: string[] = [];
  levelChallenges(r.level).forEach((c, i) => {
    if (!p.stars[r.level][i] && c.check(r)) {
      p.stars[r.level][i] = true;
      starShards += 50 * (r.level + 1);
      newStars.push(c.text);
    }
  });

  p.shards += base + starShards;
  p.earned += base + starShards;

  const newAch: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.ach[a.id] || !a.check(p, r)) continue;
    p.ach[a.id] = true;
    p.shards += a.reward;
    p.earned += a.reward;
    newAch.push(a);
  }

  saveProfile(p);
  const total = base + starShards + newAch.reduce((s, a) => s + a.reward, 0);
  return { base, starShards, newStars, newAch, total, unlocked };
}

// стартовые скрипты: bolt всегда, остальные открываются победами на уровнях
export function startOptions(p: Profile) {
  const out = ['bolt'];
  LEVELS.forEach((L, i) => {
    if (p.won[i]) out.push(L.unlock);
  });
  return out;
}
