// аффиксы элиты в духе Диабло: каждая элита получает случайные свойства и имя по ним
export interface Affix {
  id: string;
  bit: number;
  adj: string;
}

export const AFFIXES: Affix[] = [
  { id: 'fast', bit: 1, adj: 'Быстрый' },
  { id: 'fire', bit: 2, adj: 'Огненный' },
  { id: 'frost', bit: 4, adj: 'Морозный' },
  { id: 'shield', bit: 8, adj: 'Защищённый' },
  { id: 'teleport', bit: 16, adj: 'Ускользающий' },
  { id: 'vampire', bit: 32, adj: 'Кровососущий' },
  { id: 'arcane', bit: 64, adj: 'Чародейский' },
  { id: 'molten', bit: 128, adj: 'Расплавленный' },
];

export const AF = Object.fromEntries(AFFIXES.map((a) => [a.id, a.bit])) as Record<string, number>;
