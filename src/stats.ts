import { CFG } from './config';
import { SCHOOL_ORDER, SCHOOLS } from './schools';

// Все бонусы — доли (0.2 = +20%), кроме amount / regen / maxHp.
export interface Stats {
  dmg: number;
  cd: number;
  amount: number;
  area: number;
  dur: number;
  speed: number;
  crit: number;
  move: number;
  pickup: number;
  regen: number;
  maxHp: number;
  elem: number[];
}

export const baseStats = (): Stats => ({
  dmg: 0,
  cd: 0,
  amount: 0,
  area: 0,
  dur: 0,
  speed: 0,
  crit: 0.08,
  move: 0,
  pickup: 0,
  regen: 0,
  maxHp: CFG.player.hp,
  elem: [0, 0, 0, 0, 0, 0],
});

type BaseKey = 'dmg' | 'cd' | 'amount' | 'area' | 'dur' | 'speed' | 'crit' | 'move' | 'pickup' | 'regen' | 'maxHp';

export interface GearStat {
  key: BaseKey | 'elem';
  value: number;
  elem?: number;
}

export interface Gear {
  slot: number;
  name: string;
  rarity: number;
  stats: GearStat[];
  leg?: string;
}

export const RARITY = [
  { name: 'Обычный', css: '#d8d0c0', stats: 1, mul: 1 },
  { name: 'Магический', css: '#6a9aff', stats: 2, mul: 1.15 },
  { name: 'Редкий', css: '#ffd24a', stats: 3, mul: 1.3 },
  { name: 'Легендарный', css: '#ff8a1a', stats: 2, mul: 1.4 },
];

export interface Legend {
  id: string;
  slot: number;
  name: string;
  desc: string;
}

// по две легендарки на слот; эффекты статов — здесь, поведенческие — в Game
export const LEGENDS: Legend[] = [
  { id: 'madness', slot: 0, name: 'Корона безумия', desc: 'Шанс крита +10%, криты взрываются' },
  { id: 'reaper', slot: 0, name: 'Венец жнеца', desc: '+1% урона за каждые 50 убийств в забеге (до +60%)' },
  { id: 'chronos', slot: 1, name: 'Часы Хроноса', desc: 'Перезарядка −15%, длительность +30%' },
  { id: 'hive', slot: 1, name: 'Нейросеть роя', desc: '+1 снаряд для всего оружия' },
  { id: 'phoenix', slot: 2, name: 'Сердце феникса', desc: 'Смертельный удар оставляет 30% здоровья (раз в 60 с)' },
  { id: 'frost', slot: 2, name: 'Ледяной панцирь', desc: 'Касание замораживает врага, контактный урон −30%' },
  { id: 'thunder', slot: 3, name: 'Длань Громовержца', desc: 'Каждое 8-е попадание бьёт цепной молнией по 4 врагам' },
  { id: 'blood', slot: 3, name: 'Кровавый договор', desc: 'Урон +50%, но здоровье −30%' },
  { id: 'wildfire', slot: 4, name: 'Поступь пожара', desc: 'За тобой остаётся горящая земля' },
  { id: 'shadow', slot: 4, name: 'Шаг тени', desc: 'Рывок на 40% чаще и взрывается в точке старта' },
  { id: 'void', slot: 5, name: 'Ядро пустоты', desc: 'Каждые 5 секунд вокруг взрывается нова пустоты' },
  { id: 'singular', slot: 5, name: 'Сингулярность', desc: 'Радиус подбора ×2, опыт +25%' },
];

export const legendById = (id: string) => LEGENDS.find((l) => l.id === id);

// веса редкости [обычный, магический, редкий, легендарный]
export const DROP_LEVELUP = [55, 32, 11, 2];
export const DROP_CHEST = [0, 45, 42, 13];
export const DROP_LEGEND = [0, 0, 60, 40];

export function rollRarity(w: number[], legendBonus = 0) {
  const ww = [w[0], w[1], w[2], w[3] + legendBonus];
  let r = Math.random() * ww.reduce((a, b) => a + b, 0);
  for (let k = 0; k < 4; k++) {
    r -= ww[k];
    if (r <= 0) return k;
  }
  return 0;
}

export const GEAR_SLOTS = ['Шлем', 'Нейроинтерфейс', 'Броня', 'Перчатки', 'Ботинки', 'Ядро'];
export const GEAR_GLYPH = ['Ш', 'Н', 'Б', 'П', 'О', 'Я'];

const SLOT_PRIMARY: BaseKey[][] = [
  ['crit', 'dmg', 'area'],
  ['cd', 'dur', 'speed'],
  ['maxHp', 'regen', 'area'],
  ['dmg', 'crit', 'amount'],
  ['move', 'pickup', 'cd'],
  ['amount', 'dmg', 'dur'],
];

const ROLL: Record<BaseKey, [number, number]> = {
  dmg: [0.12, 0.25],
  cd: [0.08, 0.15],
  amount: [1, 1],
  area: [0.12, 0.25],
  dur: [0.15, 0.3],
  speed: [0.15, 0.3],
  crit: [0.05, 0.1],
  move: [0.08, 0.15],
  pickup: [0.25, 0.5],
  regen: [0.4, 1],
  maxHp: [20, 40],
};

const EPITHET: Record<BaseKey, string[]> = {
  dmg: ['Берсерк', 'Разлом', 'Ярость'],
  cd: ['Перегрев', 'Разгон', 'Тахион'],
  amount: ['Мультипоток', 'Гидра', 'Рой'],
  area: ['Сверхнова', 'Резонанс', 'Эхо'],
  dur: ['Стазис', 'Вечность', 'Буфер'],
  speed: ['Импульс', 'Рельса', 'Вспышка'],
  crit: ['Эксплойт', 'Зеро-дэй', 'Бэкдор'],
  move: ['Призрак', 'Сервопривод', 'Сквозняк'],
  pickup: ['Магнетар', 'Жадность', 'Пылесос'],
  regen: ['Наноблок', 'Живучесть', 'Регенерат'],
  maxHp: ['Бастион', 'Монолит', 'Броненосец'],
};

const pick = <T>(a: readonly T[]) => a[(Math.random() * a.length) | 0];

function rollValue(key: BaseKey, mul = 1) {
  const [a, b] = ROLL[key];
  const v = (a + Math.random() * (b - a)) * (key === 'amount' ? 1 : mul);
  if (key === 'amount' || key === 'maxHp') return Math.round(v);
  if (key === 'regen') return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

const RARE_WORD = ['Проклятый', 'Древний', 'Пылающий', 'Безумный', 'Теневой', 'Сломанный', 'Святой', 'Чумной'];

// ownedElems — стихии школ игрока: стихийный стат чаще выпадает под них
export function rollGear(ownedElems: number[], rarity = 0, slot = (Math.random() * 6) | 0): Gear {
  const R = RARITY[rarity];
  const primary = pick(SLOT_PRIMARY[slot]);
  const stats: GearStat[] = [{ key: primary, value: rollValue(primary, R.mul) }];
  const used = new Set<string>([primary]);
  let hasElem = false;
  while (stats.length < R.stats) {
    if (!hasElem && Math.random() < 0.5) {
      hasElem = true;
      const elem = ownedElems.length && Math.random() < 0.75 ? pick(ownedElems) : (Math.random() * 6) | 0;
      stats.push({ key: 'elem', elem, value: Math.round((0.3 + Math.random() * 0.2) * R.mul * 100) / 100 });
      continue;
    }
    const keys = (Object.keys(ROLL) as BaseKey[]).filter((k) => !used.has(k));
    const k = pick(keys);
    used.add(k);
    stats.push({ key: k, value: rollValue(k, R.mul) });
  }

  if (rarity === 3) {
    const leg = pick(LEGENDS.filter((l) => l.slot === slot));
    return { slot, rarity, name: leg.name, stats, leg: leg.id };
  }
  const epi = pick(EPITHET[primary]);
  const name =
    rarity === 2 ? `${pick(RARE_WORD)} ${GEAR_SLOTS[slot].toLowerCase()} «${epi}»` : rarity === 1 ? `${GEAR_SLOTS[slot]} «${epi}»` : GEAR_SLOTS[slot];
  return { slot, rarity, name, stats };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function statText(s: GearStat): string {
  switch (s.key) {
    case 'dmg': return `Урон +${pct(s.value)}`;
    case 'cd': return `Перезарядка −${pct(s.value)}`;
    case 'amount': return `+${s.value} к числу снарядов`;
    case 'area': return `Площадь +${pct(s.value)}`;
    case 'dur': return `Длительность +${pct(s.value)}`;
    case 'speed': return `Скорость снарядов +${pct(s.value)}`;
    case 'crit': return `Шанс крита +${pct(s.value)}`;
    case 'move': return `Скорость бега +${pct(s.value)}`;
    case 'pickup': return `Радиус подбора +${pct(s.value)}`;
    case 'regen': return `Регенерация +${String(s.value).replace('.', ',')} HP/с`;
    case 'maxHp': return `Макс. здоровье +${s.value}`;
    case 'elem': return `Урон школы «${SCHOOLS[SCHOOL_ORDER[s.elem ?? 0]].name}» +${pct(s.value)}`;
  }
}

export interface MetaStats {
  dmg: number;
  maxHp: number;
  regen: number;
  move: number;
  pickup: number;
  crit: number;
  cd: number;
  area: number;
  dur?: number;
  elem?: number[];
}

export function computeStats(gear: (Gear | null)[], meta?: MetaStats): Stats {
  const s = baseStats();
  if (meta) {
    s.dmg += meta.dmg;
    s.maxHp += meta.maxHp;
    s.regen += meta.regen;
    s.move += meta.move;
    s.pickup += meta.pickup;
    s.crit += meta.crit;
    s.cd += meta.cd;
    s.area += meta.area;
    s.dur += meta.dur ?? 0;
    if (meta.elem) for (let k = 0; k < 6; k++) s.elem[k] += meta.elem[k] ?? 0;
  }
  const legs = new Set(gear.map((g) => g?.leg).filter(Boolean));
  for (const g of gear) {
    if (!g) continue;
    for (const st of g.stats) {
      if (st.key === 'elem') s.elem[st.elem ?? 0] += st.value;
      else s[st.key] += st.value;
    }
  }
  if (legs.has('madness')) s.crit += 0.1;
  if (legs.has('chronos')) {
    s.cd += 0.15;
    s.dur += 0.3;
  }
  if (legs.has('hive')) s.amount += 1;
  if (legs.has('singular')) s.pickup += 1;
  if (legs.has('blood')) {
    s.dmg += 0.5;
    s.maxHp = Math.round(s.maxHp * 0.7);
  }
  return s;
}

export const gearHasElem = (gear: (Gear | null)[], elem: number) =>
  gear.some((g) => g?.stats.some((s) => s.key === 'elem' && s.elem === elem));
