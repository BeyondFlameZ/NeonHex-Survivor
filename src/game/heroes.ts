import type { HeroLook } from './models.js';

// ---------- статы забега ----------

export interface Stats {
  maxHp: number;
  regen: number;
  armor: number; // доля снижения урона
  move: number; // множитель скорости бега
  dmg: number; // множитель урона
  rate: number; // множитель скорострельности
  projSpeed: number;
  pierce: number;
  count: number;
  crit: number;
  critDmg: number;
  area: number;
  skillCd: number; // доля сокращения
  skillPower: number;
  dodgeCd: number; // доля сокращения
  pickup: number;
  xp: number;
  chain: number;
  burn: number; // урон горения в секунду
  chill: number; // стаков холода за попадание
  infect: number; // урон заразы в секунду
  lifesteal: number;
  revive: number;
}

export type StatKey = keyof Stats;
export type Mods = Partial<Stats>;

export const baseStats = (): Stats => ({
  maxHp: 100, regen: 0.3, armor: 0, move: 1, dmg: 1, rate: 1, projSpeed: 1, pierce: 0, count: 0, crit: 0.05, critDmg: 2,
  area: 1, skillCd: 0, skillPower: 1, dodgeCd: 0, pickup: 1, xp: 1, chain: 0, burn: 0, chill: 0, infect: 0, lifesteal: 0, revive: 0,
});

export function applyMods(s: Stats, m: Mods, k = 1) {
  for (const key in m) {
    const v = m[key as StatKey]!;
    s[key as StatKey] += v * k;
  }
}

// особые свойства, которые меняют поведение, а не цифры
export type Flag =
  | 'chainOnCrit' | 'explosive' | 'ricochet' | 'homing' | 'stun' | 'burnSpread' | 'burnVuln' | 'shatter' | 'frostNova'
  | 'raiseDead' | 'minionPower' | 'drone' | 'drone2' | 'decoyOnDodge' | 'novaOnHit' | 'execute' | 'bloodShots'
  | 'magnet' | 'doubleSpecial' | 'thorns' | 'noCrit';

const PCT = (v: number) => `${Math.round(v * 100)}%`;
export function modText(m: Mods): string[] {
  const out: string[] = [];
  const L: Record<StatKey, (v: number) => string> = {
    maxHp: (v) => `Здоровье ${v > 0 ? '+' : ''}${v}`,
    regen: (v) => `Регенерация +${v.toFixed(1).replace('.', ',')} HP/с`,
    armor: (v) => `Броня ${v > 0 ? '+' : ''}${PCT(v)}`,
    move: (v) => `Скорость бега ${v > 0 ? '+' : ''}${PCT(v)}`,
    dmg: (v) => `Урон ${v > 0 ? '+' : ''}${PCT(v)}`,
    rate: (v) => `Скорострельность ${v > 0 ? '+' : ''}${PCT(v)}`,
    projSpeed: (v) => `Скорость снарядов +${PCT(v)}`,
    pierce: (v) => `Пробитие +${v}`,
    count: (v) => `Снаряды ${v > 0 ? '+' : ''}${v}`,
    crit: (v) => `Шанс крита ${v > 0 ? '+' : ''}${PCT(v)}`,
    critDmg: (v) => `Урон крита +${PCT(v)}`,
    area: (v) => `Площадь +${PCT(v)}`,
    skillCd: (v) => `Перезарядка умения −${PCT(v)}`,
    skillPower: (v) => `Сила умения ${v > 0 ? '+' : ''}${PCT(v)}`,
    dodgeCd: (v) => `Перезарядка рывка −${PCT(v)}`,
    pickup: (v) => `Радиус подбора +${PCT(v)}`,
    xp: (v) => `Опыт +${PCT(v)}`,
    chain: (v) => `Цепь молнии +${v}`,
    burn: (v) => `Поджог ${v} урона/с`,
    chill: (v) => `Холод +${v} стак`,
    infect: (v) => `Зараза ${v} урона/с`,
    lifesteal: (v) => `Вампиризм +${PCT(v)}`,
    revive: (v) => `Воскрешение +${v}`,
  };
  for (const k in m) out.push(L[k as StatKey](m[k as StatKey]!));
  return out;
}

export const FLAG_TEXT: Record<Flag, string> = {
  chainOnCrit: 'Криты бьют цепной молнией',
  explosive: 'Снаряды взрываются',
  ricochet: 'Снаряды отскакивают к следующей цели',
  homing: 'Снаряды доворачивают к врагам',
  stun: 'Попадания иногда оглушают',
  burnSpread: 'Горящие враги при смерти поджигают соседей',
  burnVuln: 'Горящие враги получают +30% урона',
  shatter: 'Замороженные раскалываются: двойной урон и взрыв при смерти',
  frostNova: 'Получив урон, выпускаешь ледяную нову',
  raiseDead: 'Убитые иногда встают миньонами',
  minionPower: 'Миньоны сильнее вдвое',
  drone: 'Боевой дрон кружит рядом и стреляет',
  drone2: 'Второй боевой дрон',
  decoyOnDodge: 'Рывок оставляет взрывную голограмму',
  novaOnHit: 'Каждые 5 секунд вокруг взрывается нова',
  execute: 'Враги с запасом здоровья ниже 15% погибают от попадания',
  bloodShots: 'Выстрелы тратят здоровье, но сильнее бьют',
  magnet: 'Раз в 20 секунд весь опыт летит к тебе',
  doubleSpecial: 'Особые эффекты иногда срабатывают дважды',
  thorns: 'Касание врага ранит его',
  noCrit: 'Криты невозможны',
};

// ---------- оружие и герои ----------

export type WeaponKind = 'bolt' | 'flame' | 'shard' | 'spore' | 'burst' | 'dual';

export interface WeaponDef {
  name: string;
  kind: WeaponKind;
  desc: string;
  rate: number; // выстрелов в секунду
  dmg: number;
  speed: number;
  range: number;
  pierce: number;
  spread: number;
  color: string;
}

export interface Talent {
  name: string;
  mods: Mods;
  flag?: Flag;
  text?: string;
}

export interface ImplantDef {
  id: string;
  hero: string;
  slot: 0 | 1 | 2; // Верх, Центр, Низ
  mods: Mods;
  flag?: Flag;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  lore: string;
  look: HeroLook;
  weapon: WeaponDef;
  skill: { name: string; desc: string; cd: number };
  passive: { name: string; desc: string; flag: Flag };
  talents: Talent[][];
  set2: { text: string; flag?: Flag; mods?: Mods };
  set3: { text: string; flag?: Flag; mods?: Mods };
  implants: [Mods, Mods, Mods];
  cost: number;
}

const T = (name: string, mods: Mods, flag?: Flag, text?: string): Talent => ({ name, mods, flag, text });

export const HEROES: HeroDef[] = [
  {
    id: 'volt',
    name: 'Вольт',
    title: 'Кибермаг молний',
    lore: 'Бывший инженер энергосетей. Когда Бездна прорвалась в Сектор 0, он подключился к подстанции напрямую — и больше не отключался.',
    look: { robe: '#2d4a8f', trim: '#1b2a5a', glow: '#3ef0ff', skin: '#e8c8a8', hat: 'hood', gun: 'staff' },
    weapon: { name: 'Разрядник', kind: 'bolt', desc: 'Быстрые разряды, перескакивают на соседнюю цель', rate: 5, dmg: 13, speed: 30, range: 17, pierce: 0, spread: 0.05, color: '#3ef0ff' },
    skill: { name: 'Перегрузка сети', desc: '3 секунды бьёт молниями по врагам на экране', cd: 22 },
    passive: { name: 'Проводник', desc: 'Криты бьют цепной молнией по двум врагам', flag: 'chainOnCrit' },
    talents: [
      [T('Перегрев', { rate: 0.15 }), T('Высокое напряжение', { dmg: 0.15 }), T('Длинная цепь', { chain: 1 })],
      [T('Изоляция', { maxHp: 25 }), T('Скольжение', { move: 0.1 }), T('Быстрая разрядка', { skillCd: 0.15 })],
      [T('Громоотвод', {}, 'chainOnCrit'), T('Сверхпроводник', { crit: 0.08 }), T('Двойной разряд', { count: 1 })],
      [T('Буря', { skillPower: 0.3 }), T('Статика', {}, 'stun'), T('Ионный щит', { armor: 0.1 })],
      [T('Девять жизней', { revive: 1 }), T('Шаровая молния', {}, 'explosive'), T('Сеть на пределе', { skillCd: 0.3, skillPower: -0.1 })],
    ],
    set2: { text: 'Попадания иногда оглушают', flag: 'stun' },
    set3: { text: 'Урон +20%, цепь +1', mods: { dmg: 0.2, chain: 1 } },
    implants: [{ crit: 0.05 }, { chain: 1 }, { rate: 0.08 }],
    cost: 0,
  },
  {
    id: 'ember',
    name: 'Эмбер',
    title: 'Пиромант',
    lore: 'Работала в Горне корпорации и первой увидела, как из печи вышел демон. Сожгла его. С тех пор сжигает всё, что вылезает из Бездны.',
    look: { robe: '#b8381e', trim: '#5a1a14', glow: '#ffb03a', skin: '#e8c8a8', hat: 'horns', gun: 'torch' },
    weapon: { name: 'Пламемёт', kind: 'flame', desc: 'Поток огня вблизи, поджигает и прожигает толпу', rate: 12, dmg: 4, speed: 14, range: 7, pierce: 99, spread: 0.28, color: '#ff8a2d' },
    skill: { name: 'Огненный шторм', desc: '4 секунды с неба падают метеоры', cd: 24 },
    passive: { name: 'Жар', desc: 'Горящие враги получают на 30% больше урона', flag: 'burnVuln' },
    talents: [
      [T('Напалм', { burn: 4 }), T('Широкий поток', { area: 0.2 }), T('Форсаж', { rate: 0.15 })],
      [T('Огнеупорность', { armor: 0.08, maxHp: 15 }), T('Пылающий след', { move: 0.1 }), T('Тлеющие угли', { skillCd: 0.15 })],
      [T('Пожар', {}, 'burnSpread'), T('Жар печи', { dmg: 0.2 }), T('Дальнобой', { projSpeed: 0.3 })],
      [T('Метеоритный дождь', { skillPower: 0.35 }), T('Кольцо огня', {}, 'novaOnHit'), T('Пепел', { lifesteal: 0.03 })],
      [T('Феникс', { revive: 1 }), T('Испепеление', {}, 'execute'), T('Солнце', { burn: 8, area: 0.15 })],
    ],
    set2: { text: 'Горящие враги при смерти поджигают соседей', flag: 'burnSpread' },
    set3: { text: 'Поджог +6, площадь +20%', mods: { burn: 6, area: 0.2 } },
    implants: [{ burn: 3 }, { area: 0.1 }, { dmg: 0.08 }],
    cost: 600,
  },
  {
    id: 'frost',
    name: 'Иней',
    title: 'Криокинетик',
    lore: 'Проснулась в криохранилище раньше срока. Холод остался внутри и теперь слушается её.',
    look: { robe: '#3a6a9a', trim: '#1a3a5a', glow: '#9ad8ff', skin: '#e8d8d0', hat: 'crystal', gun: 'cannon' },
    weapon: { name: 'Криопушка', kind: 'shard', desc: 'Тяжёлые осколки пробивают толпу и замораживают', rate: 1.6, dmg: 42, speed: 20, range: 19, pierce: 3, spread: 0, color: '#bfe8ff' },
    skill: { name: 'Абсолютный ноль', desc: 'Замораживает и ранит всех врагов вокруг', cd: 20 },
    passive: { name: 'Хрупкость', desc: 'Замороженные раскалываются: двойной урон', flag: 'shatter' },
    talents: [
      [T('Лавина', { chill: 1 }), T('Тяжёлый лёд', { dmg: 0.2 }), T('Шрапнель', { count: 1, dmg: -0.1 })],
      [T('Ледяная кожа', { armor: 0.12 }), T('Наст', { move: 0.08 }), T('Вечная мерзлота', { skillCd: 0.15 })],
      [T('Ледяная нова', {}, 'frostNova'), T('Пробой', { pierce: 2 }), T('Скорострел', { rate: 0.2 })],
      [T('Глубокий холод', { skillPower: 0.35 }), T('Сосульки', {}, 'ricochet'), T('Зимняя стойкость', { maxHp: 30 })],
      [T('Вторая зима', { revive: 1 }), T('Ледниковый период', { chill: 2, area: 0.2 }), T('Криошок', {}, 'explosive')],
    ],
    set2: { text: 'Получив урон, выпускаешь ледяную нову', flag: 'frostNova' },
    set3: { text: 'Холод +1, пробитие +1', mods: { chill: 1, pierce: 1 } },
    implants: [{ chill: 1 }, { armor: 0.06 }, { pierce: 1 }],
    cost: 900,
  },
  {
    id: 'rot',
    name: 'Гниль',
    title: 'Некрохакер',
    lore: 'Взломал протокол нанозаразы и переписал его под себя. Мёртвые теперь работают на него — бесплатно и без выходных.',
    look: { robe: '#2a6a4a', trim: '#1a3a2a', glow: '#7dff6a', skin: '#c8d8c0', hat: 'skull', gun: 'emitter' },
    weapon: { name: 'Чумной излучатель', kind: 'spore', desc: 'Самонаводящиеся споры заражают врагов', rate: 3, dmg: 10, speed: 13, range: 16, pierce: 0, spread: 0.3, color: '#7dff6a' },
    skill: { name: 'Армия мертвецов', desc: 'Поднимает 6 мертвецов на 12 секунд', cd: 26 },
    passive: { name: 'Некроз', desc: 'Убитые иногда встают миньонами', flag: 'raiseDead' },
    talents: [
      [T('Вирулентность', { infect: 5 }), T('Рой спор', { count: 1 }), T('Ускоренный метаболизм', { rate: 0.15 })],
      [T('Мёртвая плоть', { maxHp: 25 }), T('Кровопийца', { lifesteal: 0.03 }), T('Быстрый вызов', { skillCd: 0.15 })],
      [T('Повелитель', {}, 'minionPower'), T('Эпидемия', { infect: 6, area: 0.15 }), T('Кислота', { dmg: 0.2 })],
      [T('Легион', { skillPower: 0.4 }), T('Шипы костей', {}, 'thorns'), T('Чумной туман', { regen: 1 })],
      [T('Нежить', { revive: 1 }), T('Пандемия', {}, 'explosive'), T('Жатва', {}, 'execute')],
    ],
    set2: { text: 'Миньоны сильнее вдвое', flag: 'minionPower' },
    set3: { text: 'Зараза +6, вампиризм +3%', mods: { infect: 6, lifesteal: 0.03 } },
    implants: [{ infect: 4 }, { regen: 0.6 }, { lifesteal: 0.02 }],
    cost: 1200,
  },
  {
    id: 'gear',
    name: 'Шестерня',
    title: 'Техножрец',
    lore: 'Молится машинам, и машины отвечают. Его дроны помнят каждую молитву — и каждого врага.',
    look: { robe: '#8a7a3a', trim: '#4a3a1a', glow: '#ffc94a', skin: '#e8c8a8', hat: 'antenna', gun: 'rifle' },
    weapon: { name: 'Рельс-штуцер', kind: 'burst', desc: 'Очереди по три выстрела, дальний бой', rate: 1.8, dmg: 16, speed: 38, range: 22, pierce: 1, spread: 0.03, color: '#ffd24a' },
    skill: { name: 'Орбитальный удар', desc: '6 мощных ударов по самым плотным толпам', cd: 24 },
    passive: { name: 'Дрон', desc: 'Боевой дрон кружит рядом и стреляет', flag: 'drone' },
    talents: [
      [T('Калибровка', { dmg: 0.15 }), T('Длинная очередь', { count: 1 }), T('Автоподача', { rate: 0.15 })],
      [T('Бронепластины', { armor: 0.1, maxHp: 10 }), T('Сервоприводы', { move: 0.1 }), T('Перезарядка спутника', { skillCd: 0.15 })],
      [T('Второй дрон', {}, 'drone2'), T('Бронебойные', { pierce: 2 }), T('Прицел', { crit: 0.1 })],
      [T('Залп с орбиты', { skillPower: 0.35 }), T('Рикошет', {}, 'ricochet'), T('Автоаптечка', { regen: 0.8 })],
      [T('Резервная копия', { revive: 1 }), T('Разрывные', {}, 'explosive'), T('Магнитное поле', {}, 'magnet')],
    ],
    set2: { text: 'Второй боевой дрон', flag: 'drone2' },
    set3: { text: 'Снаряды +1, урон +15%', mods: { count: 1, dmg: 0.15 } },
    implants: [{ count: 1 }, { maxHp: 20 }, { skillCd: 0.08 }],
    cost: 1600,
  },
  {
    id: 'glitch',
    name: 'Глюк',
    title: 'Глитчер',
    lore: 'Ошибка в матрице, которую не смогли исправить. Существует в трёх местах одновременно и стреляет из всех трёх.',
    look: { robe: '#8a2a8a', trim: '#4a1a4a', glow: '#ff4fd8', skin: '#e8c8b8', hat: 'cap', gun: 'dual' },
    weapon: { name: 'Двойные глюкеры', kind: 'dual', desc: 'Скорострельные пистолеты, много критов', rate: 8, dmg: 7, speed: 32, range: 15, pierce: 0, spread: 0.08, color: '#ff4fd8' },
    skill: { name: 'Стоп-кадр', desc: 'Останавливает время для врагов на 4 секунды', cd: 26 },
    passive: { name: 'Двойник', desc: 'Рывок оставляет взрывную голограмму', flag: 'decoyOnDodge' },
    talents: [
      [T('Слепая зона', { crit: 0.08 }), T('Разгон', { rate: 0.15 }), T('Двойное эхо', { count: 1, dmg: -0.1 })],
      [T('Фантомная кожа', { armor: 0.08 }), T('Телепортация', { dodgeCd: 0.25 }), T('Буфер', { skillCd: 0.15 })],
      [T('Критическая ошибка', { critDmg: 0.6 }), T('Рикошет', {}, 'ricochet'), T('Перегрузка', { dmg: 0.2 })],
      [T('Длинный кадр', { skillPower: 0.4 }), T('Каскад', {}, 'doubleSpecial'), T('Спринт', { move: 0.15 })],
      [T('Откат', { revive: 1 }), T('Удаление', {}, 'execute'), T('Вирус в системе', {}, 'homing')],
    ],
    set2: { text: 'Особые эффекты иногда срабатывают дважды', flag: 'doubleSpecial' },
    set3: { text: 'Добивание врагов ниже 15% здоровья', flag: 'execute' },
    implants: [{ move: 0.08 }, { dodgeCd: 0.12 }, { critDmg: 0.25 }],
    cost: 2200,
  },
];

export const heroById = (id: string) => HEROES.find((h) => h.id === id) ?? HEROES[0];
export const TALENT_LEVEL = [1, 3, 5, 7, 9];
export const SLOT_NAME = ['Верх', 'Центр', 'Низ'];
export const SLOT_SHORT = ['В', 'Ц', 'Н'];

// импланты: по 3 на героя
export const IMPLANTS: ImplantDef[] = HEROES.flatMap((h) =>
  h.implants.map((mods, slot) => ({ id: `${h.id}:${slot}`, hero: h.id, slot: slot as 0 | 1 | 2, mods })),
);

// ---------- протоколы (аналог карт класса) ----------

export type Tag = 'Урон' | 'Стихия' | 'Выживание' | 'Подвижность' | 'Штраф';

export interface ProtocolDef {
  id: string;
  name: string;
  tags: Tag[];
  mods: Mods;
  flag?: Flag;
  icon: string;
}

export const PROTOCOLS: ProtocolDef[] = [
  { id: 'roots', name: 'Возвращение к истокам', tags: ['Урон', 'Штраф'], mods: { dmg: 0.3 }, flag: 'noCrit', icon: '⚔' },
  { id: 'barrage', name: 'Шквал', tags: ['Урон', 'Штраф'], mods: { rate: 0.22, armor: -0.08 }, icon: '➶' },
  { id: 'chain', name: 'Цепная реакция', tags: ['Стихия'], mods: {}, flag: 'doubleSpecial', icon: '⚡' },
  { id: 'blood', name: 'Кровавый прилив', tags: ['Выживание', 'Штраф'], mods: { dmg: 0.15, lifesteal: 0.04 }, flag: 'bloodShots', icon: '✚' },
  { id: 'hunter', name: 'Охотник за наживой', tags: ['Выживание'], mods: { xp: 0.12 }, flag: 'magnet', icon: '◎' },
  { id: 'ricochet', name: 'Рикошет', tags: ['Урон'], mods: {}, flag: 'ricochet', icon: '↯' },
  { id: 'explosive', name: 'Разрывные заряды', tags: ['Урон'], mods: {}, flag: 'explosive', icon: '✸' },
  { id: 'homing', name: 'Самонаведение', tags: ['Урон'], mods: {}, flag: 'homing', icon: '➹' },
  { id: 'execute', name: 'Казнь', tags: ['Урон'], mods: {}, flag: 'execute', icon: '☠' },
  { id: 'thorns', name: 'Шипованная броня', tags: ['Выживание'], mods: { armor: 0.05 }, flag: 'thorns', icon: '✦' },
  { id: 'plating', name: 'Бронеплиты', tags: ['Выживание'], mods: { armor: 0.07, maxHp: 15 }, icon: '⛨' },
  { id: 'regen', name: 'Наноремонт', tags: ['Выживание'], mods: { regen: 0.8 }, icon: '♥' },
  { id: 'sprint', name: 'Спринт', tags: ['Подвижность'], mods: { move: 0.1 }, icon: '»' },
  { id: 'evasion', name: 'Уклонение', tags: ['Подвижность'], mods: { dodgeCd: 0.18 }, icon: '↻' },
  { id: 'magnet', name: 'Магнит', tags: ['Подвижность'], mods: { pickup: 0.4 }, icon: '◉' },
  { id: 'focus', name: 'Фокус', tags: ['Урон'], mods: { crit: 0.06, critDmg: 0.2 }, icon: '◈' },
  { id: 'glass', name: 'Стеклянная пушка', tags: ['Урон', 'Штраф'], mods: { dmg: 0.45, maxHp: -30 }, icon: '◇' },
  { id: 'accel', name: 'Ускоритель', tags: ['Стихия'], mods: { skillCd: 0.14 }, icon: '⟳' },
  { id: 'resonance', name: 'Резонанс', tags: ['Стихия'], mods: { skillPower: 0.25 }, icon: '◍' },
  { id: 'nova', name: 'Новая звезда', tags: ['Стихия'], mods: {}, flag: 'novaOnHit', icon: '✺' },
  { id: 'multi', name: 'Мультизалп', tags: ['Урон', 'Штраф'], mods: { count: 1, dmg: -0.12 }, icon: '⁂' },
  { id: 'pierce', name: 'Пробой', tags: ['Урон'], mods: { pierce: 1, projSpeed: 0.2 }, icon: '➤' },
];

export const protoById = (id: string) => PROTOCOLS.find((p) => p.id === id)!;
export const implantById = (id: string) => IMPLANTS.find((p) => p.id === id)!;
