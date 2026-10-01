import { paragonLevel } from './paragon';
import type { Profile } from './save';
import type { MagePal } from './textures';

export interface Skin {
  id: string;
  name: string;
  pal: MagePal;
  req: (p: Profile) => boolean;
  reqText: string;
}

export const SKINS: Skin[] = [
  { id: 'gold', name: 'Золотой век', pal: { c: '#6a4a10', C: '#b8862a', t: '#fff3c0', m: '#ffd24a' }, req: (p) => p.stars.flat().every(Boolean), reqText: 'Собери все 15 звёзд' },
  { id: 'blood', name: 'Кровавая луна', pal: { c: '#4a0a14', C: '#8a1428', t: '#ff2d55', m: '#ff7a2d' }, req: (p) => p.tierWon.some((t) => t[2]), reqText: 'Пройди любую локацию на Аде' },
  { id: 'void', name: 'Пустота', pal: { c: '#120a1e', C: '#2a1a40', t: '#ff4fd8', m: '#c46bff' }, req: (p) => paragonLevel(p.paragon.xp).lvl >= 20, reqText: 'Достигни 20 уровня парагона' },
  { id: 'ghost', name: 'Призрак', pal: { c: '#5a6a7a', C: '#a8b8c8', t: '#e8ffff', m: '#9ad8ff' }, req: (p) => p.daily.count >= 3, reqText: 'Пройди 3 испытания дня' },
  { id: 'royal', name: 'Цареубийца', pal: { c: '#2a0a4a', C: '#5a1a8a', t: '#ffd24a', m: '#ffd24a' }, req: (p) => p.life.bosses >= 10, reqText: 'Убей 10 боссов' },
  { id: 'greed', name: 'Жадина', pal: { c: '#3a4a1a', C: '#6a8a2a', t: '#ffe14a', m: '#ffc94a' }, req: (p) => p.life.goblins >= 10, reqText: 'Убей 10 гоблинов' },
  { id: 'neon', name: 'Неон', pal: { c: '#0a2a3a', C: '#0a6a8a', t: '#7dffea', m: '#ff4fd8' }, req: (p) => p.rift.best >= 10, reqText: 'Закрой Великий портал 10' },
];

export const skinById = (id: string) => SKINS.find((s) => s.id === id);
