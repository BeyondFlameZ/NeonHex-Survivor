import { CLASSES } from './classes';
import { levelChallenges, LEVELS } from './levels';
import { LORE, loreNeed } from './lore';
import { TIERS, todayKey } from './modes';
import { paragonBonuses, paragonLevel } from './paragon';
import { gemBonuses, newRelic, randomGem, type Relic } from './relics';
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
  const pg = paragonBonuses(p.paragon.alloc);
  const eq = p.relics.eq.map((id) => p.relics.inv.find((r) => r.id === id)).filter((r): r is Relic => !!r);
  const gems = gemBonuses(eq.flatMap((r) => r.sockets.filter((g): g is string => !!g)));
  return {
    dmg: 0.05 * l('dmg') + pg.dmg + gems.dmg,
    maxHp: 15 * l('hp') + pg.maxHp + gems.maxHp,
    regen: 0.2 * l('regen') + pg.regen + gems.regen,
    move: 0.05 * l('move') + pg.move,
    pickup: 0.2 * l('magnet') + pg.pickup,
    crit: 0.03 * l('crit') + pg.crit + gems.crit,
    xp: 0.1 * l('xp') + pg.xp,
    cd: 0.04 * l('cd') + pg.cd + gems.cd,
    area: 0.06 * l('area') + pg.area + gems.area,
    dur: pg.dur,
    elemAll: gems.elem,
    rerolls: 1 + l('reroll'),
    revive: l('revive') > 0,
    relicLegs: eq.map((r) => r.leg),
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
  { id: 'nm', name: 'Кошмарный сон', desc: 'Пройди любую локацию на сложности «Кошмар»', reward: 400, check: (p) => p.tierWon.some((t) => t[1]) },
  { id: 'hell', name: 'Сошествие в ад', desc: 'Пройди любую локацию на сложности «Ад»', reward: 800, check: (p) => p.tierWon.some((t) => t[2]) },
  { id: 'hellall', name: 'Владыка Ада', desc: 'Пройди все 5 локаций на «Аде»', reward: 3000, check: (p) => p.tierWon.every((t) => t[2]) },
  { id: 'goblin', name: 'Гоблинобой', desc: 'Убей 5 гоблинов-майнеров', reward: 200, check: (p) => p.life.goblins >= 5 },
  { id: 'legend', name: 'Легенда', desc: 'Надень легендарный предмет', reward: 150, check: (p) => p.life.legends >= 1 },
  { id: 'endless', name: 'Бесконечность', desc: 'Продержись 20 минут в бесконечном режиме', reward: 600, check: (_p, r) => r.endless && r.time >= 1200 },
  { id: 'daily3', name: 'Ежедневник', desc: 'Пройди 3 испытания дня', reward: 300, check: (p) => p.daily.count >= 3 },
  { id: 'classes', name: 'Многоликий', desc: 'Победи тремя разными классами', reward: 400, check: (p) => p.classWins.length >= 3 },
  { id: 'rift10', name: 'Покоритель порталов', desc: 'Закрой Великий портал 10', reward: 800, check: (p) => p.rift.best >= 10 },
  { id: 'paragon20', name: 'Парагон', desc: 'Достигни 20 уровня парагона', reward: 500, check: (p) => paragonLevel(p.paragon.xp).lvl >= 20 },
  { id: 'fusion3', name: 'Алхимик', desc: 'Открой 3 слияния школ', reward: 300, check: (p) => p.fusions.length >= 3 },
  { id: 'relic2', name: 'Хранитель реликвий', desc: 'Надень две реликвии одновременно', reward: 200, check: (p) => p.relics.eq.every(Boolean) },
  { id: 'lore10', name: 'Летописец', desc: 'Открой 10 записей бестиария', reward: 250, check: (p) => Object.keys(LORE).filter((n) => (p.bestiary[n] ?? 0) >= loreNeed(n, false)).length >= 10 },
];

export interface Settlement {
  base: number;
  starShards: number;
  dailyBonus: number;
  newStars: string[];
  newAch: Achievement[];
  total: number;
  unlockedLevel: string | null;
  unlockedClass: string | null;
  newBest: boolean;
  relics: Relic[];
  gems: string[];
  pxp: number;
  plevels: number;
  riftNew: boolean;
}

// итог забега: осколки, звёзды, режимы, достижения; профиль сохраняется
export function settle(p: Profile, r: RunResult): Settlement {
  const T = TIERS[r.tier] ?? TIERS[0];
  p.life.kills += r.kills;
  p.life.runs++;
  p.life.crits += r.crits;
  p.life.evolutions += r.evolutions;
  p.life.shrines += r.shrines;
  p.life.chests += r.chests;
  p.life.time += r.time;
  p.life.bosses += r.bosses;
  p.life.goblins += r.goblins;
  p.life.legends += r.legends;
  for (const w of r.weapons) if (!p.used.includes(w)) p.used.push(w);
  for (const f of r.fusions) if (!p.fusions.includes(f)) p.fusions.push(f);
  for (const [n, k] of Object.entries(r.killsBy)) p.bestiary[n] = (p.bestiary[n] ?? 0) + k;

  // опыт парагона
  const before = paragonLevel(p.paragon.xp).lvl;
  const pxp = Math.round(r.kills + r.time * 3 + r.bosses * 300 + r.rift * 100);
  p.paragon.xp += pxp;
  const plevels = paragonLevel(p.paragon.xp).lvl - before;

  // добыча: реликвии и камни
  const relics: Relic[] = [];
  const gems: string[] = [];
  for (let k = 0; k < r.bosses; k++) {
    if (Math.random() < 0.5) relics.push(newRelic());
    gems.push(randomGem(Math.min(5, 1 + r.tier)));
  }
  for (let k = 0; k < r.goblins; k++) if (Math.random() < 0.3) gems.push(randomGem(1));
  if (r.rift && r.riftWon) {
    gems.push(randomGem(Math.min(5, 1 + Math.floor(r.rift / 5))));
    if (Math.random() < 0.25) relics.push(newRelic());
  }
  if (r.daily && r.won) gems.push(randomGem(2));
  let salvage = 0;
  for (const rel of relics) {
    if (p.relics.inv.length < 20) p.relics.inv.push(rel);
    else salvage += 100;
  }
  for (const g of gems) p.gems[g] = (p.gems[g] ?? 0) + 1;

  // Великие порталы
  let riftNew = false;
  if (r.rift) {
    p.rift.last = r.riftWon ? r.rift + 1 : r.rift;
    if (r.riftWon && r.rift > p.rift.best) {
      p.rift.best = r.rift;
      riftNew = true;
    }
  }

  let unlockedLevel: string | null = null;
  let unlockedClass: string | null = null;
  if (r.won && !r.rift) {
    if (!p.won[r.level]) {
      p.won[r.level] = true;
      if (r.level + 1 < LEVELS.length) unlockedLevel = LEVELS[r.level + 1].name;
      const c = CLASSES[r.level + 1];
      if (c) unlockedClass = c.name;
    }
    p.tierWon[r.level][r.tier] = true;
    if (!p.classWins.includes(r.cls)) p.classWins.push(r.cls);
  }

  let newBest = false;
  if (r.endless && r.time > p.best[r.level]) {
    p.best[r.level] = r.time;
    newBest = true;
  }

  const raw = r.kills * 0.1 + (r.time / 60) * 6 + (r.won ? 150 * (r.level + 1) : 0) + r.bosses * 100 * (r.endless ? 1 : 0) + r.shards;
  const base = Math.round(raw * T.reward);

  let starShards = 0;
  const newStars: string[] = [];
  levelChallenges(r.level).forEach((c, i) => {
    if (!p.stars[r.level][i] && c.check(r)) {
      p.stars[r.level][i] = true;
      starShards += 50 * (r.level + 1);
      newStars.push(c.text);
    }
  });

  let dailyBonus = 0;
  if (r.daily) {
    const today = todayKey();
    if (p.daily.key !== today) p.daily = { key: today, done: false, best: 0, count: p.daily.count };
    p.daily.best = Math.max(p.daily.best, r.kills);
    if (r.won && !p.daily.done) {
      p.daily.done = true;
      p.daily.count++;
      dailyBonus = 400;
    }
  }

  const riftShards = r.rift ? Math.round(r.rift * 40 * (r.riftWon ? 1 : 0.4)) : 0;
  const gained = base + starShards + dailyBonus + salvage + riftShards;
  p.shards += gained;
  p.earned += gained;

  const newAch: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.ach[a.id] || !a.check(p, r)) continue;
    p.ach[a.id] = true;
    p.shards += a.reward;
    p.earned += a.reward;
    newAch.push(a);
  }

  // рекорды
  const mode = r.rift ? 'rift' : r.endless ? 'endless' : r.daily ? 'daily' : 'level';
  const score = r.rift ? r.rift * 10000 + (r.riftWon ? 5000 : 0) - Math.round(r.time) : r.endless ? Math.round(r.time) : r.kills;
  const lvlName = LEVELS[r.level].name;
  const text = r.rift
    ? `Портал ${r.rift} ${r.riftWon ? 'закрыт' : 'провален'} · ${lvlName}`
    : r.endless
      ? `${lvlName} · бесконечный · ${Math.floor(r.time / 60)} мин · боссов ${r.bosses}`
      : `${lvlName} · ${TIERS[r.tier].name}${r.daily ? ' · день' : ''} · ${r.won ? 'победа' : 'поражение'} · ${r.kills} убийств`;
  p.records.push({ mode, text, score, date: Date.now() });
  p.records.sort((a, b) => b.score - a.score);
  if (p.records.length > 60) p.records.length = 60;

  saveProfile(p);
  const total = gained + newAch.reduce((acc, a) => acc + a.reward, 0);
  return { base, starShards, dailyBonus, newStars, newAch, total, unlockedLevel, unlockedClass, newBest, relics, gems, pxp, plevels, riftNew };
}

