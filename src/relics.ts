import { LEGENDS } from './stats';

// реликвии — вечные легендарки с гнёздами; камни вставляются в гнёзда и растут слиянием 3 → 1
export interface Relic {
  id: string;
  leg: string;
  sockets: (string | null)[];
}

export interface GemDef {
  id: string;
  name: string;
  css: string;
  text: (lvl: number) => string;
}

export const GEMS: GemDef[] = [
  { id: 'ruby', name: 'Рубин', css: '#ff2d55', text: (l) => `Урон +${3 * l}%` },
  { id: 'sapphire', name: 'Сапфир', css: '#3e8aff', text: (l) => `Перезарядка −${2 * l}%` },
  { id: 'emerald', name: 'Изумруд', css: '#3ed87a', text: (l) => `Здоровье +${8 * l}, регенерация +${(0.1 * l).toFixed(1).replace('.', ',')}` },
  { id: 'topaz', name: 'Топаз', css: '#ffc94a', text: (l) => `Шанс крита +${(1.5 * l).toFixed(1).replace('.', ',')}%` },
  { id: 'amethyst', name: 'Аметист', css: '#c46bff', text: (l) => `Площадь +${3 * l}%` },
  { id: 'diamond', name: 'Алмаз', css: '#e8f4ff', text: (l) => `Урон всех школ +${3 * l}%` },
];

export const gemById = (id: string) => GEMS.find((g) => g.id === id)!;
export const gemKey = (id: string, lvl: number) => `${id}:${lvl}`;
export const parseGem = (key: string) => {
  const [id, l] = key.split(':');
  return { id, lvl: Number(l) || 1 };
};

export function newRelic(): Relic {
  const leg = LEGENDS[(Math.random() * LEGENDS.length) | 0];
  return { id: Math.random().toString(36).slice(2, 10), leg: leg.id, sockets: Math.random() < 0.35 ? [null, null] : [null] };
}

export const randomGem = (lvl = 1) => gemKey(GEMS[(Math.random() * GEMS.length) | 0].id, lvl);

// суммарные бонусы камней в формате доп. статов
export function gemBonuses(keys: string[]) {
  const b = { dmg: 0, cd: 0, maxHp: 0, regen: 0, crit: 0, area: 0, elem: 0 };
  for (const k of keys) {
    const { id, lvl } = parseGem(k);
    if (id === 'ruby') b.dmg += 0.03 * lvl;
    else if (id === 'sapphire') b.cd += 0.02 * lvl;
    else if (id === 'emerald') {
      b.maxHp += 8 * lvl;
      b.regen += 0.1 * lvl;
    } else if (id === 'topaz') b.crit += 0.015 * lvl;
    else if (id === 'amethyst') b.area += 0.03 * lvl;
    else if (id === 'diamond') b.elem += 0.03 * lvl;
  }
  return b;
}
