import type { SchoolId } from './schools';

// слияния школ: открываются, если в билде по 2+ оружия каждой из двух школ
export interface Fusion {
  id: string;
  name: string;
  a: SchoolId;
  b: SchoolId;
  desc: string;
}

export const FUSIONS: Fusion[] = [
  { id: 'plasma', name: 'Плазма', a: 'electro', b: 'pyro', desc: 'Электроудары поджигают, огонь бьёт током' },
  { id: 'thermo', name: 'Термошок', a: 'kinetic', b: 'pyro', desc: 'Огонь раскалывает замороженных с огромным уроном' },
  { id: 'phantom', name: 'Вирусный фантом', a: 'necro', b: 'glitch', desc: 'Глитч-атаки заражают врагов' },
  { id: 'teslaswarm', name: 'Тесла-рой', a: 'mech', b: 'electro', desc: 'Каждое 4-е попадание механики бьёт цепной молнией' },
  { id: 'rift', name: 'Временной разлом', a: 'kinetic', b: 'glitch', desc: 'Глитч-атаки накладывают холод' },
  { id: 'plague', name: 'Чумной пожар', a: 'necro', b: 'pyro', desc: 'Заражённые и горящие враги при смерти разносят обе напасти' },
];

export const fusionById = (id: string) => FUSIONS.find((f) => f.id === id);
