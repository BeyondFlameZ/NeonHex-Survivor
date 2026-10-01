import type { Profile } from './save';
import type { MagePal } from './textures';

export interface ClassMods {
  dmg?: number;
  maxHp?: number;
  regen?: number;
  area?: number;
  dur?: number;
  xp?: number;
  rerolls?: number;
  dashCd?: number; // множитель перезарядки рывка
  elem?: [number, number]; // [стихия, бонус]
}

export interface ClassDef {
  id: string;
  name: string;
  desc: string;
  passive: string;
  start: string;
  pal: MagePal;
  mods: ClassMods;
  unlock: (p: Profile) => boolean;
  unlockText: string;
}

export const CLASSES: ClassDef[] = [
  {
    id: 'cyber',
    name: 'Кибермаг',
    desc: 'Универсал сети, одинаково хорош во всём.',
    passive: '+10% опыта и +1 реролл снаряжения',
    start: 'bolt',
    pal: { c: '#1b2a5a', C: '#2d4a8f', t: '#3ef0ff', m: '#8a4dff' },
    mods: { xp: 0.1, rerolls: 1 },
    unlock: () => true,
    unlockText: '',
  },
  {
    id: 'pyro',
    name: 'Пиромант',
    desc: 'Сжигает толпы и не оглядывается.',
    passive: 'Урон школы «Пиро» +25%, площадь +10%',
    start: 'pyre',
    pal: { c: '#5a1a14', C: '#9a2e1a', t: '#ffb03a', m: '#ff7a2d' },
    mods: { elem: [1, 0.25], area: 0.1 },
    unlock: (p) => p.won[0],
    unlockText: 'Пройди Кибер-некрополь',
  },
  {
    id: 'cryo',
    name: 'Криокинетик',
    desc: 'Холод и сталь. Медленно, но неотвратимо.',
    passive: 'Урон «Кинетики» +25%, здоровье +20',
    start: 'cryo',
    pal: { c: '#1a3a5a', C: '#3a6a9a', t: '#e8ffff', m: '#9ad8ff' },
    mods: { elem: [2, 0.25], maxHp: 20 },
    unlock: (p) => p.won[1],
    unlockText: 'Пройди Пылающую плавильню',
  },
  {
    id: 'necro',
    name: 'Некрохакер',
    desc: 'Мёртвые работают на него бесплатно.',
    passive: 'Урон «Некрокода» +25%, регенерация +0,5 HP/с',
    start: 'virus',
    pal: { c: '#1a3a2a', C: '#2a6a4a', t: '#7dff6a', m: '#b8ff3a' },
    mods: { elem: [3, 0.25], regen: 0.5 },
    unlock: (p) => p.won[2],
    unlockText: 'Пройди Ледяные катакомбы',
  },
  {
    id: 'tech',
    name: 'Техножрец',
    desc: 'Молится машинам, и машины отвечают.',
    passive: 'Урон «Механики» +25%, длительность эффектов +15%',
    start: 'orbit',
    pal: { c: '#4a3a1a', C: '#7a6a3a', t: '#ffc94a', m: '#ff9a3c' },
    mods: { elem: [4, 0.25], dur: 0.15 },
    unlock: (p) => p.won[3],
    unlockText: 'Пройди Биоулей',
  },
  {
    id: 'glitch',
    name: 'Глитчер',
    desc: 'Ошибка в матрице, которую невозможно поймать.',
    passive: 'Урон «Глитча» +25%, рывок перезаряжается вдвое быстрее',
    start: 'mirror',
    pal: { c: '#4a1a4a', C: '#8a2a8a', t: '#ff4fd8', m: '#c46bff' },
    mods: { elem: [5, 0.25], dashCd: 0.5 },
    unlock: (p) => p.won[4],
    unlockText: 'Пройди Собор Бездны',
  },
];

export const classById = (id: string) => CLASSES.find((c) => c.id === id) ?? CLASSES[0];
