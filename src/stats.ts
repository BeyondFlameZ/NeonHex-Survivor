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
  stats: GearStat[];
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

function rollValue(key: BaseKey) {
  const [a, b] = ROLL[key];
  const v = a + Math.random() * (b - a);
  if (key === 'amount' || key === 'maxHp') return Math.round(v);
  if (key === 'regen') return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

// ownedElems — стихии школ, которые уже есть у игрока: стихийный стат чаще выпадает под них
export function rollGear(ownedElems: number[], slot = (Math.random() * 6) | 0): Gear {
  const primary = pick(SLOT_PRIMARY[slot]);
  const stats: GearStat[] = [{ key: primary, value: rollValue(primary) }];

  if (Math.random() < 0.5) {
    const elem = ownedElems.length && Math.random() < 0.75 ? pick(ownedElems) : (Math.random() * 6) | 0;
    stats.push({ key: 'elem', elem, value: Math.round((0.3 + Math.random() * 0.2) * 100) / 100 });
  } else {
    const keys = (Object.keys(ROLL) as BaseKey[]).filter((k) => k !== primary);
    const k = pick(keys);
    stats.push({ key: k, value: rollValue(k) });
  }

  return { slot, name: `${GEAR_SLOTS[slot]} «${pick(EPITHET[primary])}»`, stats };
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

export function computeStats(gear: (Gear | null)[]): Stats {
  const s = baseStats();
  for (const g of gear) {
    if (!g) continue;
    for (const st of g.stats) {
      if (st.key === 'elem') s.elem[st.elem ?? 0] += st.value;
      else s[st.key] += st.value;
    }
  }
  return s;
}

export const gearHasElem = (gear: (Gear | null)[], elem: number) =>
  gear.some((g) => g?.stats.some((s) => s.key === 'elem' && s.elem === elem));
