import type { Relic } from './relics';

export interface RunResult {
  level: number;
  won: boolean;
  time: number;
  kills: number;
  lvl: number;
  crits: number;
  evolutions: number;
  maxSet: number;
  dashes: number;
  minHp: number;
  shrines: number;
  chests: number;
  weapons: string[];
  tier: number;
  endless: boolean;
  daily: boolean;
  cls: string;
  shards: number;
  goblins: number;
  bosses: number;
  legends: number;
  rift: number;
  riftWon: boolean;
  killsBy: Record<string, number>;
  fusions: string[];
  ults: number;
}

export interface Settings {
  bloom: boolean;
  shake: boolean;
  numbers: boolean;
  bright: number; // 0 тёмная, 1 обычная, 2 яркая
  quality: number; // 0 низкое, 1 среднее, 2 высокое (разрешение рендера)
  music: number; // 0..1
  sfx: number; // 0..1
}

export interface Profile {
  v: 1;
  shards: number;
  earned: number;
  shop: Record<string, number>;
  stars: boolean[][];
  won: boolean[];
  tierWon: boolean[][];
  best: number[];
  ach: Record<string, boolean>;
  life: {
    kills: number;
    runs: number;
    bosses: number;
    crits: number;
    evolutions: number;
    shrines: number;
    chests: number;
    time: number;
    goblins: number;
    legends: number;
  };
  used: string[];
  cls: string;
  classWins: string[];
  tier: number;
  endless: boolean;
  daily: { key: number; done: boolean; best: number; count: number };
  settings: Settings;
  paragon: { xp: number; alloc: number[] };
  relics: { inv: Relic[]; eq: (string | null)[] };
  gems: Record<string, number>;
  fusions: string[];
  skin: string;
  bestiary: Record<string, number>;
  rift: { best: number; last: number };
  records: { mode: string; text: string; score: number; date: number }[];
  intro: boolean[];
}

const KEY = 'neonhex.save.v1';
const five = <T>(f: () => T) => [0, 1, 2, 3, 4].map(f);

export function freshProfile(): Profile {
  return {
    v: 1,
    shards: 0,
    earned: 0,
    shop: {},
    stars: five(() => [false, false, false]),
    won: five(() => false),
    tierWon: five(() => [false, false, false]),
    best: five(() => 0),
    ach: {},
    life: { kills: 0, runs: 0, bosses: 0, crits: 0, evolutions: 0, shrines: 0, chests: 0, time: 0, goblins: 0, legends: 0 },
    used: [],
    cls: 'cyber',
    classWins: [],
    tier: 0,
    endless: false,
    daily: { key: 0, done: false, best: 0, count: 0 },
    settings: { bloom: true, shake: true, numbers: true, bright: 1, quality: 1, music: 0.6, sfx: 0.8 },
    paragon: { xp: 0, alloc: [] },
    relics: { inv: [], eq: [null, null] },
    gems: {},
    fusions: [],
    skin: '',
    bestiary: {},
    rift: { best: 0, last: 1 },
    records: [],
    intro: five(() => false),
  };
}

// подмешиваем новые поля к старым сейвам и чиним связи между ними
export function normalize(raw: Partial<Profile>): Profile {
  const base = freshProfile();
  const p: Profile = {
    ...base,
    ...raw,
    life: { ...base.life, ...raw.life },
    settings: { ...base.settings, ...raw.settings },
    daily: { ...base.daily, ...raw.daily },
    paragon: { ...base.paragon, ...raw.paragon },
    relics: { ...base.relics, ...raw.relics },
    rift: { ...base.rift, ...raw.rift },
  } as Profile;
  if (!Array.isArray(p.intro) || p.intro.length !== 5) p.intro = base.intro;
  if (!Array.isArray(p.records)) p.records = [];
  if (!Array.isArray(p.fusions)) p.fusions = [];
  if (typeof p.gems !== 'object' || !p.gems) p.gems = {};
  if (typeof p.bestiary !== 'object' || !p.bestiary) p.bestiary = {};
  if (!Array.isArray(p.relics.eq) || p.relics.eq.length !== 2) p.relics.eq = [null, null];
  if (!Array.isArray(p.tierWon) || p.tierWon.length !== 5) p.tierWon = base.tierWon;
  if (!Array.isArray(p.best) || p.best.length !== 5) p.best = base.best;
  if (!Array.isArray(p.classWins)) p.classWins = [];
  p.won.forEach((w, i) => {
    if (w) p.tierWon[i][0] = true;
  });
  return p;
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : freshProfile();
  } catch {
    return freshProfile();
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // приватный режим Safari может запретить запись — игра продолжит работать без сохранений
  }
}

export function resetProfile(): Profile {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  return freshProfile();
}

// код сохранения для переноса между Safari и установленным приложением
export function exportCode(p: Profile) {
  const json = JSON.stringify(p);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'NHX1.' + btoa(bin);
}

export function importCode(code: string): Profile | null {
  try {
    const clean = code.trim().replace(/^NHX1\./, '');
    const bin = atob(clean);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof data !== 'object' || data === null || typeof data.shards !== 'number') return null;
    return normalize(data);
  } catch {
    return null;
  }
}
