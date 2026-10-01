// аффиксы элиты в духе Диабло: каждая элита получает случайные свойства и имя по ним
export interface Affix {
  id: string;
  bit: number;
  adj: string;
  desc: string;
  color: string;
}

export const AFFIXES: Affix[] = [
  { id: 'fast', bit: 1, adj: 'Быстрый', desc: 'бегает в полтора раза быстрее', color: '#7dff6a' },
  { id: 'fire', bit: 2, adj: 'Огненный', desc: 'оставляет горящий след', color: '#ff7a2d' },
  { id: 'frost', bit: 4, adj: 'Морозный', desc: 'аура замедляет мага', color: '#9ad8ff' },
  { id: 'shield', bit: 8, adj: 'Защищённый', desc: 'периодически неуязвим', color: '#ffd24a' },
  { id: 'teleport', bit: 16, adj: 'Ускользающий', desc: 'телепортируется к магу', color: '#c46bff' },
  { id: 'vampire', bit: 32, adj: 'Кровососущий', desc: 'восстанавливает здоровье', color: '#ff2d55' },
  { id: 'arcane', bit: 64, adj: 'Чародейский', desc: 'выпускает кольца снарядов', color: '#3ef0ff' },
  { id: 'molten', bit: 128, adj: 'Расплавленный', desc: 'взрывается лавой после смерти', color: '#ffb03a' },
];

export const AF = Object.fromEntries(AFFIXES.map((a) => [a.id, a.bit])) as Record<string, number>;

export function rollAffixes(n: number) {
  const pool = [...AFFIXES];
  let mask = 0;
  const names: string[] = [];
  for (let k = 0; k < n && pool.length; k++) {
    const a = pool.splice((Math.random() * pool.length) | 0, 1)[0];
    mask |= a.bit;
    names.push(a.adj);
  }
  return { mask, names };
}
