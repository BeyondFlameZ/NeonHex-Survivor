import { CFG } from './config';

export interface Stats {
  dmg: number;
  cooldown: number;
  boltCount: number;
  boltSpeed: number;
  pierce: number;
  moveSpeed: number;
  maxHp: number;
  pickup: number;
  regen: number;
  drones: number;
  droneDmg: number;
  crit: number;
}

export const baseStats = (): Stats => ({
  dmg: 10,
  cooldown: 0.75,
  boltCount: 1,
  boltSpeed: 520,
  pierce: 0,
  moveSpeed: CFG.player.speed,
  maxHp: CFG.player.hp,
  pickup: CFG.player.pickup,
  regen: 0,
  drones: 0,
  droneDmg: 8,
  crit: 0.08,
});

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  apply(s: Stats, g: { heal(n: number): void }): void;
}

export const UPGRADES: Upgrade[] = [
  { id: 'amp', name: 'Усилитель разряда', desc: 'Разряды бьют на 25% сильнее', max: 5, apply: (s) => { s.dmg *= 1.25; } },
  { id: 'overclock', name: 'Разгон ядра', desc: 'Заклинания перезаряжаются на 12% быстрее', max: 5, apply: (s) => { s.cooldown *= 0.88; } },
  { id: 'thread', name: 'Мультипоток', desc: '+1 разряд в каждом залпе', max: 4, apply: (s) => { s.boltCount++; } },
  { id: 'pierce', name: 'Бронебойный код', desc: 'Разряд прошивает ещё одного врага', max: 3, apply: (s) => { s.pierce++; } },
  { id: 'exploit', name: 'Эксплойт', desc: '+8% шанс критического удара (урон ×2,2)', max: 4, apply: (s) => { s.crit += 0.08; } },
  { id: 'orbit', name: 'orbit.drv', desc: '+1 дрон-хранитель, кружит вокруг и режет всё рядом', max: 6, apply: (s) => { s.drones++; s.droneDmg += 2; } },
  { id: 'servo', name: 'Сервоприводы', desc: 'Двигаешься на 10% быстрее', max: 4, apply: (s) => { s.moveSpeed *= 1.1; } },
  { id: 'magnet', name: 'Магнитный имплант', desc: 'Кристаллы опыта притягиваются с большего расстояния', max: 4, apply: (s) => { s.pickup *= 1.3; } },
  { id: 'nano', name: 'Нанорегенерация', desc: 'Восстанавливаешь 0,6 HP в секунду', max: 5, apply: (s) => { s.regen += 0.6; } },
  { id: 'ceramic', name: 'Биокерамика', desc: '+20 к максимуму HP и полное лечение', max: 5, apply: (s, g) => { s.maxHp += 20; g.heal(Infinity); } },
];

export function rollChoices(levels: Record<string, number>, count = 3): Upgrade[] {
  const pool = UPGRADES.filter((u) => (levels[u.id] ?? 0) < u.max);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
